#!/usr/bin/env node
/**
 * List all orphaned positions with current P&L
 */

import axios from 'axios';

const poolClient = axios.create({
  baseURL: 'http://localhost:8086',
  timeout: 30000
});

const accounts = [
  { id: 'b90a1029-9ef4-4db5-be87-97fd148fe341', nickname: 'LiveCopyFromGold', region: 'london' },
  { id: 'cec4bf95-4334-4ad7-bc9e-c2c5f8a59a3d', nickname: 'AlphaTraderInstant060', region: 'new-york' },
  { id: 'bb106d21-d303-4e06-84fd-e6a21d20cec9', nickname: 'FTMO Challenge 100k', region: 'london' },
  { id: 'hola_C62330', nickname: 'HolaPrimeProp50k', region: 'demo' }
];

async function listOrphans() {
  console.log('\n📊 Current Orphaned Positions:\n');

  let totalOrphans = 0;
  let totalPnL = 0;

  for (const account of accounts) {
    try {
      const resp = await poolClient.get(`/positions/${account.id}`, {
        params: { region: account.region }
      });
      const positions = resp.data.positions || resp.data || [];

      if (positions.length > 0) {
        console.log(`\n🔹 ${account.nickname} (${account.id.slice(0, 8)}...):`);
        positions.forEach(p => {
          const openTime = new Date(p.time);
          const duration = Math.floor((Date.now() - openTime.getTime()) / 1000 / 60 / 60); // hours
          const profit = p.profit || 0;
          totalPnL += profit;
          totalOrphans++;

          // Calculate P&L percentage
          // Rough estimate: $100/lot/point for XAUUSD, entry to current price
          const currentPrice = p.currentPrice || 0;
          const openPrice = p.openPrice || 0;
          const priceDiff = p.type === 'POSITION_TYPE_BUY' ?
            (currentPrice - openPrice) : (openPrice - currentPrice);
          const pnlPercent = openPrice > 0 ? (priceDiff / openPrice * 100) : 0;

          console.log(`   • Position ${p.id}:`);
          console.log(`     Symbol: ${p.symbol} ${p.type.replace('POSITION_TYPE_', '')}`);
          console.log(`     Volume: ${p.volume} lots`);
          console.log(`     P&L: $${profit.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
          console.log(`     Price: ${openPrice} → ${currentPrice}`);
          console.log(`     Open: ${openTime.toISOString().slice(0, 16).replace('T', ' ')} (${duration}h ago)`);
          console.log(`     SL: ${p.stopLoss || 'none'}, TP: ${p.takeProfit || 'none'}`);
        });
      }
    } catch (err) {
      if (!err.message.includes('ECONNREFUSED')) {
        console.log(`   ⚠️ Error fetching ${account.nickname}: ${err.message}`);
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📈 Total Orphans: ${totalOrphans}`);
  console.log(`💰 Total P&L: $${totalPnL.toFixed(2)}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

listOrphans().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
