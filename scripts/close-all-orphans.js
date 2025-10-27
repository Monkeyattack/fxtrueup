#!/usr/bin/env node
/**
 * Close all orphaned positions
 */

import axios from 'axios';

const poolClient = axios.create({
  baseURL: 'http://localhost:8086',
  timeout: 30000
});

const accounts = [
  { id: 'b90a1029-9ef4-4db5-be87-97fd148fe341', nickname: 'LiveCopyFromGold', region: 'london' },
  { id: 'cec4bf95-4334-4ad7-bc9e-c2c5f8a59a3d', nickname: 'AlphaTraderInstant060', region: 'new-york' },
  { id: '7194816f-c897-4e89-a19a-d8af3c9b0c38', nickname: 'FTMO Challenge 100k', region: 'london' },
  { id: 'hola_C62330', nickname: 'HolaPrimeProp50k', region: 'demo' }
];

async function closeAllOrphans() {
  console.log('\n🔴 Closing all orphaned positions...\n');

  let totalClosed = 0;
  let totalProfit = 0;

  for (const account of accounts) {
    try {
      const resp = await poolClient.get(`/positions/${account.id}`, {
        params: { region: account.region }
      });
      const positions = resp.data.positions || resp.data || [];

      if (positions.length > 0) {
        console.log(`\n🔹 ${account.nickname} (${positions.length} positions):`);

        for (const pos of positions) {
          try {
            console.log(`   Closing ${pos.id}: ${pos.symbol} ${pos.volume} lots, P&L: $${(pos.profit || 0).toFixed(2)}`);

            const closeResp = await poolClient.post('/position/close', {
              account_id: account.id,
              region: account.region,
              position_id: pos.id
            });

            if (closeResp.data.success) {
              const profit = closeResp.data.profit || pos.profit || 0;
              totalProfit += profit;
              totalClosed++;
              console.log(`   ✅ Closed successfully! Profit: $${profit.toFixed(2)}`);
            } else {
              console.log(`   ❌ Failed: ${closeResp.data.error || 'Unknown error'}`);
            }

            // Small delay between closes
            await new Promise(resolve => setTimeout(resolve, 500));

          } catch (err) {
            console.log(`   ❌ Error closing ${pos.id}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      if (!err.message.includes('ECONNREFUSED')) {
        console.log(`   ⚠️ Error fetching ${account.nickname}: ${err.message}`);
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Positions Closed: ${totalClosed}`);
  console.log(`💰 Total Profit Realized: $${totalProfit.toFixed(2)}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

closeAllOrphans().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
