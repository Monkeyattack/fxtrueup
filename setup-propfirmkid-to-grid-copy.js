#!/usr/bin/env node

// Copy filtered trades from PropFirmKidEA (source) to Grid Demo (destination)

import dotenv from 'dotenv';
import FilteredCopyTrader from './src/services/filteredCopyTrader.js';
import poolClient from './src/services/poolClient.js';
import { ACCOUNT_CONFIGS, PROP_FIRMKID_EA_ID, GRID_ACCOUNT_ID } from './src/config/accounts.js';

dotenv.config();

const SOURCE_ID = process.env.SOURCE_ID || PROP_FIRMKID_EA_ID;
const DEST_ID = process.env.DEST_ID || GRID_ACCOUNT_ID;
const SOURCE_REGION = ACCOUNT_CONFIGS.PROP_FIRMKID_EA.region || 'london';
const DEST_REGION = ACCOUNT_CONFIGS.GRID_DEMO.region || 'new-york';

async function main() {
  console.log('🔄 PROP FIRM KID EA → GRID DEMO (FILTERED COPY)');
  console.log('═'.repeat(80));

  try {
    // Check destination status
    console.log('\n📊 Checking Destination (Grid Demo)...');
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
    console.log('\n🚀 Starting filtered copy trader');
    const copyTrader = new FilteredCopyTrader(SOURCE_ID, DEST_ID, DEST_REGION);

    // Baseline risk config (tune as needed)
    copyTrader.config.fixedLotSize = 2.50; // Example for ~$118k dest; adjust per equity
    copyTrader.config.maxDailyTrades = 5;

    await copyTrader.start();
    console.log('\n✅ Copy trader started');

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
    console.error('Hints: ensure POOL_API_URL and METAAPI_TOKEN are set, and the pool API is running.');
    process.exit(1);
  }
}

main();

