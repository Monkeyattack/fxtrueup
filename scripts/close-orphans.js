#!/usr/bin/env node

/**
 * Close the 6 orphaned positions with broken mappings
 */

import axios from 'axios';

const POOL_URL = 'http://localhost:8086';

const orphans = [
  // LiveCopyFromGold (b90a1029)
  { accountId: 'b90a1029-9ef4-4db5-be87-97fd148fe341', positionId: '51668759', symbol: 'XAUUSD', region: 'london' },
  { accountId: 'b90a1029-9ef4-4db5-be87-97fd148fe341', positionId: '51671556', symbol: 'XAUUSD', region: 'london' },
  { accountId: 'b90a1029-9ef4-4db5-be87-97fd148fe341', positionId: '51674260', symbol: 'XAUUSD', region: 'london' },

  // FTMO Challenge 100k (bb106d21)
  { accountId: '7194816f-c897-4e89-a19a-d8af3c9b0c38', positionId: '71757041', symbol: 'XAUUSD', region: 'london' },
  { accountId: '7194816f-c897-4e89-a19a-d8af3c9b0c38', positionId: '71764112', symbol: 'XAUUSD', region: 'london' },
  { accountId: '7194816f-c897-4e89-a19a-d8af3c9b0c38', positionId: '71766740', symbol: 'ETHUSD', region: 'london' },
];

async function closeOrphan(orphan) {
  try {
    console.log(`\n🔴 Closing orphan: ${orphan.symbol} (${orphan.positionId}) on ${orphan.accountId.slice(0, 8)}`);

    const response = await axios.post(`${POOL_URL}/position/close`, {
      account_id: orphan.accountId,
      region: orphan.region,
      position_id: orphan.positionId
    });

    if (response.data.success) {
      const profit = response.data.profit || 0;
      console.log(`✅ Closed successfully! P&L: $${profit.toFixed(2)}`);
      return { success: true, profit };
    } else {
      console.log(`❌ Failed: ${response.data.error || 'Unknown error'}`);
      return { success: false, error: response.data.error };
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧹 Closing 6 orphaned positions with broken mappings...\n');

  let totalProfit = 0;
  let successCount = 0;
  let failCount = 0;

  for (const orphan of orphans) {
    const result = await closeOrphan(orphan);

    if (result.success) {
      successCount++;
      totalProfit += result.profit || 0;
    } else {
      failCount++;
    }

    // Wait a bit between closes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Summary:`);
  console.log(`   ✅ Closed: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   💰 Total P&L: $${totalProfit.toFixed(2)}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
