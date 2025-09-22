import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import poolClient from '../services/poolClient.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.STATUS_API_PORT || 8084);

const SOURCE_ACCOUNT_ID = process.env.SOURCE_ACCOUNT_ID || '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';
const DEST_ACCOUNT_ID = process.env.COPY_ACCOUNT_ID || '44f05253-8b6a-4aba-a4b2-7882da7c8e48';
const DEST_REGION = process.env.COPY_ACCOUNT_REGION || 'london';

const EVENTS_PATH = path.resolve('logs/trade-events.jsonl');

function parseEvents(limit = 1000) {
  try {
    if (!fs.existsSync(EVENTS_PATH)) return { counters: {}, lastEventAt: null, recent: [] };
    const text = fs.readFileSync(EVENTS_PATH, 'utf8');
    const lines = text.trim().split(/\n+/);
    const slice = lines.slice(-limit);
    const events = slice
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    const counters = events.reduce((acc, e) => {
      acc[e.event] = (acc[e.event] || 0) + 1;
      return acc;
    }, {});
    const lastEventAt = events.length ? events[events.length - 1].ts : null;

    // Daily copied count
    const today = new Date().toDateString();
    const dailyCopied = events.filter(e => e.event === 'copied' && new Date(e.ts).toDateString() === today).length;

    return { counters: { ...counters, dailyCopied }, lastEventAt, recent: events.slice(-50).reverse() };
  } catch (err) {
    return { counters: { error: 1 }, lastEventAt: null, recent: [], error: err.message };
  }
}

function analyzeMartingale(trades = []) {
  // Detect simple martingale: after a loss, next trade same symbol and direction with larger volume
  let enteredMartingale = false;
  let sequences = [];
  for (let i = 0; i < trades.length - 1; i++) {
    const t1 = trades[i];
    const t2 = trades[i + 1];
    if ((t1?.profit ?? 0) < 0 && t2 && t1.symbol === t2.symbol && t1.type === t2.type && (t2.volume ?? 0) > (t1.volume ?? 0)) {
      enteredMartingale = true;
      sequences.push({ symbol: t1.symbol, from: t1.volume, to: t2.volume, dir: t1.type, at: t2.time || t2.openTime });
    }
  }
  return { enteredMartingale, sequences: sequences.slice(0, 5) };
}

function lossStreak(trades = []) {
  let streak = 0;
  for (const t of trades) {
    if ((t?.profit ?? 0) < 0) streak++; else break;
  }
  return streak;
}

function oppositeDirectionOpenCount(openTrades = []) {
  const bySymbol = new Map();
  for (const t of openTrades) {
    const sym = t.symbol;
    if (!bySymbol.has(sym)) bySymbol.set(sym, { buy: 0, sell: 0 });
    const bucket = bySymbol.get(sym);
    if ((t.type || '').includes('BUY')) bucket.buy++; else bucket.sell++;
  }
  let count = 0;
  for (const { buy, sell } of bySymbol.values()) {
    if (buy > 0 && sell > 0) count++;
  }
  return count;
}

app.get('/api/copy-trader/status', async (req, res) => {
  const sourceId = req.query.source || SOURCE_ACCOUNT_ID;
  const destId = req.query.dest || DEST_ACCOUNT_ID;
  const destRegion = req.query.region || DEST_REGION;

  try {
    const [sourceInfo, sourceOpen, sourceMetrics, sourceHistory,
           destInfo, destOpen] = await Promise.all([
      poolClient.getAccountInfo(sourceId, 'london'),
      poolClient.getPositions(sourceId, 'london'),
      poolClient.getAccountMetrics(sourceId).catch(() => ({})),
      poolClient.getTradeHistory(sourceId, 14, 50).catch(() => ({ trades: [] })),
      poolClient.getAccountInfo(destId, destRegion),
      poolClient.getPositions(destId, destRegion),
    ]);

    const events = parseEvents();
    const trades = sourceHistory.trades || [];

    const analysis = {
      loss_streak: lossStreak(trades),
      martingale: analyzeMartingale(trades),
      opposite_direction_symbols: oppositeDirectionOpenCount(sourceOpen),
    };

    res.json({
      app: {
        status: 'ok',
        last_event_at: events.lastEventAt,
        event_counters: events.counters,
        port: PORT
      },
      source: {
        account_id: sourceId,
        balance: sourceInfo.balance,
        equity: sourceInfo.equity,
        margin: sourceInfo.margin,
        currency: sourceInfo.currency,
        open_trades: sourceOpen,
        metrics: sourceMetrics,
      },
      destination: {
        account_id: destId,
        region: destRegion,
        balance: destInfo.balance,
        equity: destInfo.equity,
        margin: destInfo.margin,
        currency: destInfo.currency,
        open_trades: destOpen,
      },
      analysis,
      recent_events: events.recent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Status API listening on http://127.0.0.1:${PORT}`);
});

