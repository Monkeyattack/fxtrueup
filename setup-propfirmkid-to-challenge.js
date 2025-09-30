#!/usr/bin/env node
/**
 * PropFirmKid → FTMO Challenge 100k Copy Trading Setup
 * Copies all trades from PropFirmKid EA to FTMO Challenge account
 */

import dotenv from 'dotenv';
import FilteredCopyTrader from './src/services/filteredCopyTrader.js';
import poolClient from './src/services/poolClient.js';
import { ACCOUNT_CONFIGS, PROP_FIRMKID_EA_ID, FTMO_CHALLENGE_100K_ID } from './src/config/accounts.js';

dotenv.config();

const SOURCE_ID = PROP_FIRMKID_EA_ID;
const DEST_ID = FTMO_CHALLENGE_100K_ID;
const SOURCE_REGION = ACCOUNT_CONFIGS.PROP_FIRMKID_EA.region || 'london';
const DEST_REGION = ACCOUNT_CONFIGS.FTMO_CHALLENGE_100K.region || 'london';

async function main() {
  console.log('🚀 PROP FIRM KID EA → FTMO CHALLENGE 100K');
  console.log('═'.repeat(80));

  try {
    // Check destination status
    console.log('\n📊 Checking Destination (FTMO Challenge)...');
    const destInfo = await poolClient.getAccountInfo(DEST_ID, DEST_REGION);
    const destPositions = await poolClient.getPositions(DEST_ID, DEST_REGION);
    console.log(`  Balance: $${destInfo.balance?.toLocaleString?.() ?? destInfo.balance ?? 'N/A'}`);
    console.log(`  Open Positions: ${destPositions.length}`);

    // Check source status
    console.log('\n📊 Checking Source (PropFirmKidEA)...');
    const srcInfo = await poolClient.getAccountInfo(SOURCE_ID, SOURCE_REGION);
    const srcPositions = await poolClient.getPositions(SOURCE_ID, SOURCE_REGION);
    console.log(`  Balance: $${srcInfo.balance?.toLocaleString?.() ?? srcInfo.balance ?? 'N/A'}`);
    console.log(`  Open Positions: ${srcPositions.length}`);

    // Start Filtered Copy Trader
    console.log('\n🚀 Starting copy trader with FTMO Challenge rules');
    const copyTrader = new FilteredCopyTrader(SOURCE_ID, DEST_ID, DEST_REGION);

    // FTMO Challenge Configuration
    copyTrader.config.fixedLotSize = null; // Use proportional (both are $100k)
    copyTrader.config.maxDailyTrades = 10; // Conservative
    copyTrader.config.dailyLossLimit = 5000; // $5k max daily loss (5%)
    copyTrader.config.minTimeBetweenTrades = 0; // No restriction

    await copyTrader.start();
    console.log('\n✅ Copy trader started');
    console.log('📋 FTMO Challenge Rules Applied:');
    console.log('   - Max Daily Loss: $5,000 (5%)');
    console.log('   - Max Daily Trades: 10');
    console.log('   - Position Sizing: Proportional (1:1)');

    // Periodic status
    setInterval(async () => {
      const stats = copyTrader.getStats?.() || {};
      const [srcPos, destPos] = await Promise.all([
        poolClient.getPositions(SOURCE_ID, SOURCE_REGION),
        poolClient.getPositions(DEST_ID, DEST_REGION)
      ]);
      console.log(`\n[${new Date().toLocaleTimeString()}] Update:`);
      console.log(`  Source open: ${srcPos.length} | Dest open: ${destPos.length}`);
      if (stats.trades !== undefined) {
        console.log(`  Trades today: ${stats.trades}, Daily loss: $${(stats.dailyLoss || 0).toFixed(2)}`);
      }
    }, 30000);
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    console.error('Hints: ensure POOL_API_URL is set and the connection pool API is running.');
    process.exit(1);
  }
}

main();
