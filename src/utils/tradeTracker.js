import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve('logs');
const EVENTS_FILE = path.join(LOG_DIR, 'trade-events.jsonl');

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {}
}

function writeEvent(evt) {
  ensureLogDir();
  const line = JSON.stringify(evt) + '\n';
  fs.appendFile(EVENTS_FILE, line, () => {});
}

class TradeTracker {
  constructor() {
    this.counters = {
      detected: 0,
      copied: 0,
      rejected: 0,
      duplicate: 0,
      error: 0
    };
  }

  base(trade) {
    return {
      ts: new Date().toISOString(),
      source_trade_id: trade?.id,
      symbol: trade?.symbol,
      source_volume: trade?.volume,
      type: trade?.type
    };
  }

  detected(trade) {
    this.counters.detected++;
    writeEvent({ ...this.base(trade), event: 'detected' });
  }

  rejected(trade, reasons = []) {
    this.counters.rejected++;
    writeEvent({ ...this.base(trade), event: 'rejected', reasons });
  }

  sized(trade, destVolume, martingaleLevel) {
    writeEvent({
      ...this.base(trade),
      event: 'sized',
      dest_volume: destVolume,
      martingale_level: martingaleLevel
    });
  }

  duplicate(trade) {
    this.counters.duplicate++;
    writeEvent({ ...this.base(trade), event: 'duplicate' });
  }

  copied(trade, destVolume, orderId) {
    this.counters.copied++;
    writeEvent({
      ...this.base(trade),
      event: 'copied',
      dest_volume: destVolume,
      order_id: orderId
    });
  }

  error(trade, message) {
    this.counters.error++;
    writeEvent({ ...this.base(trade), event: 'error', message });
  }

  getSummary() {
    return { ...this.counters };
  }
}

export const tradeTracker = new TradeTracker();
export default tradeTracker;

