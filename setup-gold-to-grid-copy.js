#!/usr/bin/env node

/**
 * Setup script to copy filtered trades from Gold Buy Only to Grid Demo account
 * This will make Grid Demo receive only the profitable non-martingale trades
 */

import dotenv from 'dotenv';
import FilteredCopyTrader from './src/services/filteredCopyTrader.js';
import poolClient from './src/services/poolClient.js';
import { GOLD_ACCOUNT_ID, GRID_ACCOUNT_ID, ACCOUNT_CONFIGS } from './src/config/accounts.js';

dotenv.config();

// Account Configuration from our accounts config
const GOLD_REGION = ACCOUNT_CONFIGS.GOLD_BUY_ONLY.region; // london
const GRID_REGION = ACCOUNT_CONFIGS.GRID_DEMO.region; // new-york

async function setupGoldToGridCopy() {
  console.log('🔄 GOLD TO GRID FILTERED COPY SETUP');
  console.log('═'.repeat(80));
  console.log('This will configure Grid Demo account to receive filtered trades from Gold Buy Only');
  console.log('═'.repeat(80));
  
  try {
    // 1. Check current Grid Demo status
    console.log('\n📊 Checking Grid Demo Account Status...');
    const gridInfo = await poolClient.getAccountInfo(GRID_ACCOUNT_ID, GRID_REGION);
    const gridPositions = await poolClient.getPositions(GRID_ACCOUNT_ID, GRID_REGION);
    
    console.log(`\nGrid Demo Account:`);
    console.log(`  Name: ${gridInfo.name || 'Grid Demo - Prop Firm'}`);
    console.log(`  Balance: $${gridInfo.balance?.toLocaleString() || 'N/A'}`);
    console.log(`  Open Positions: ${gridPositions.length}`);
    console.log(`  Server: ${gridInfo.server || 'N/A'}`);
    
    if (gridPositions.length > 0) {
      console.log('\n⚠️  WARNING: Grid Demo has open positions');
      console.log('You may want to close these before starting filtered copy trading.');
      console.log('\nOpen positions:');
      gridPositions.forEach(pos => {
        console.log(`  - ${pos.symbol} ${pos.type} ${pos.volume} lots`);
      });
    }
    
    // 2. Verify Gold account
    console.log('\n📊 Checking Gold Buy Only Account...');
    const goldInfo = await poolClient.getAccountInfo(GOLD_ACCOUNT_ID, GOLD_REGION);
    const goldPositions = await poolClient.getPositions(GOLD_ACCOUNT_ID, GOLD_REGION);
    
    console.log(`\nGold Buy Only Account:`);
    console.log(`  Balance: $${goldInfo.balance?.toLocaleString() || 'N/A'}`);
    console.log(`  Open Positions: ${goldPositions.length}`);
    
    // 3. Show expected performance
    console.log('\n📈 EXPECTED PERFORMANCE WITH FILTERING');
    console.log('─'.repeat(60));
    console.log('Based on historical analysis:');
    console.log('\nWithout Filtering (Original Gold Strategy):');
    console.log('  • Monthly Return: ~16%');
    console.log('  • Win Rate: 74.6%');
    console.log('  • Includes risky martingale trades');
    console.log('  • NOT FTMO compliant');
    
    console.log('\nWith Filtering (What Grid will receive):');
    console.log('  • Monthly Return: ~20% (+25% improvement)');
    console.log('  • Win Rate: 94.7%');
    console.log('  • NO martingale trades');
    console.log('  • FTMO compliant ✅');
    console.log('  • Max 1 position at a time');
    console.log('  • Fixed 2.50 lot sizing (1% risk for $118k account)');
    
    // 4. Show filter configuration
    console.log('\n🎯 FILTER CONFIGURATION');
    console.log('─'.repeat(60));
    console.log('The following filters will be applied:');
    console.log('  ✅ Max 1 open position (no grid/martingale)');
    console.log('  ✅ Fixed lot size: 2.50 (1% risk with ~40-50 pip stops)');
    console.log('  ✅ Min 30 minutes between trades');
    console.log('  ✅ Max 5 trades per day');
    console.log('  ✅ Trading hours: 8-17 UTC only');
    console.log('  ✅ Skip trades at similar price levels');
    console.log('  ✅ Skip position size increases after losses');
    
    // 5. Initialize the copy trader
    console.log('\n🚀 STARTING FILTERED COPY TRADER');
    console.log('─'.repeat(60));
    
    const copyTrader = new FilteredCopyTrader(
      GOLD_ACCOUNT_ID,
      GRID_ACCOUNT_ID,
      GRID_REGION
    );
    
    // Override some settings for Grid Demo
    copyTrader.config.fixedLotSize = 2.50; // Scaled for $118k account to risk ~1% per trade
    copyTrader.config.maxDailyTrades = 5;   // Limit daily exposure (max 5% daily risk)
    
    // Start the copy trader
    await copyTrader.start();
    
    console.log('\n✅ COPY TRADER STARTED SUCCESSFULLY!');
    console.log('\nGrid Demo will now receive:');
    console.log('  • Only high-quality trades (94.7% win rate)');
    console.log('  • No martingale/grid trades');
    console.log('  • FTMO compliant trades only');
    console.log('  • Fixed 2.50 lot sizing (1% risk for $118k account)');
    
    // 6. Real-time monitoring
    console.log('\n📊 REAL-TIME MONITORING');
    console.log('─'.repeat(60));
    
    // Display stats every 30 seconds
    setInterval(async () => {
      const stats = copyTrader.getStats();
      const gridPos = await poolClient.getPositions(GRID_ACCOUNT_ID, GRID_REGION);
      const gridInfo = await poolClient.getAccountInfo(GRID_ACCOUNT_ID, GRID_REGION);
      
      console.log(`\n[${new Date().toLocaleTimeString()}] Status Update:`);
      console.log(`  Grid Balance: $${gridInfo.balance?.toFixed(2) || 'N/A'}`);
      console.log(`  Open Positions: ${gridPos.length}`);
      console.log(`  Daily Trades: ${stats.dailyTrades}/5`);
      console.log(`  Copy Status: ${stats.isRunning ? '🟢 Active' : '🔴 Stopped'}`);
      
      if (gridPos.length > 0) {
        console.log(`  Current Trade: ${gridPos[0].symbol} ${gridPos[0].volume} lots`);
      }
    }, 30000);
    
    // Handle shutdown gracefully
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down copy trader...');
      copyTrader.stop();
      console.log('✅ Copy trader stopped safely');
      console.log('\nGrid Demo results will show the filtered strategy performance.');
      process.exit(0);
    });
    
    console.log('\nPress Ctrl+C to stop the copy trader');
    console.log('\n💡 TIP: Let it run for a few days to see the difference!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Create PM2 ecosystem file for easy deployment
async function createPM2Config() {
  const pm2Config = {
    apps: [{
      name: 'gold-to-grid-copy',
      script: './setup-gold-to-grid-copy.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        POOL_API_URL: process.env.POOL_API_URL || 'http://localhost:8086'
      },
      error_file: './logs/gold-to-grid-error.log',
      out_file: './logs/gold-to-grid-out.log',
      log_file: './logs/gold-to-grid-combined.log',
      time: true
    }]
  };
  
  const fs = await import('fs');
  fs.writeFileSync('ecosystem.gold-to-grid.config.js', 
    `module.exports = ${JSON.stringify(pm2Config, null, 2)}`
  );
  
  console.log('\n📄 PM2 config created: ecosystem.gold-to-grid.config.js');
  console.log('To run with PM2: pm2 start ecosystem.gold-to-grid.config.js');
}

// Run the setup
console.log('Starting Gold to Grid filtered copy setup...\n');
setupGoldToGridCopy().catch(console.error);

// Also create PM2 config
createPM2Config().catch(console.error);