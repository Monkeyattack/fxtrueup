#!/usr/bin/env node

/**
 * Start the Filtered Copy Trader
 * Copies trades from Gold Buy Only Service with martingale filtering
 */

import dotenv from 'dotenv';
import FilteredCopyTrader from './src/services/filteredCopyTrader.js';
import poolClient from './src/services/poolClient.js';

dotenv.config();

// Configuration
const SOURCE_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac'; // Gold Buy Only Service
const DEST_ACCOUNT_ID = process.env.COPY_ACCOUNT_ID || '44f05253-8b6a-4aba-a4b2-7882da7c8e48'; // Grid Demo
const DEST_REGION = process.env.COPY_ACCOUNT_REGION || 'london'; // Grid Demo is in London

async function startCopyTrading() {
  console.log('🎯 FILTERED COPY TRADER');
  console.log('═'.repeat(60));
  console.log('This system will copy trades with the following filters:');
  console.log('  ✅ No martingale/grid trades');
  console.log('  ✅ Fixed 0.01 lot size');
  console.log('  ✅ Max 1 position at a time');
  console.log('  ✅ 30 min between trades');
  console.log('  ✅ Trading hours: 8-17 UTC');
  console.log('  ✅ Max 5 trades per day');
  console.log('═'.repeat(60));
  
  // Validate configuration
  if (DEST_ACCOUNT_ID === 'YOUR_ACCOUNT_ID') {
    console.error('❌ Please set COPY_ACCOUNT_ID in your .env file');
    process.exit(1);
  }
  
  console.log('\n🎯 Configuration:');
  console.log(`  Source: Gold Buy Only Service (${SOURCE_ACCOUNT_ID})`);
  console.log(`  Destination: Grid Demo (${DEST_ACCOUNT_ID})`);
  console.log(`  Region: ${DEST_REGION}`);
  
  try {
    // Test connection
    console.log('\n🔗 Testing connections...');
    
    const sourceInfo = await poolClient.getAccountInfo(SOURCE_ACCOUNT_ID);
    console.log(`✅ Source account connected: ${sourceInfo.name || 'Gold Buy Only Service'}`);
    
    const destInfo = await poolClient.getAccountInfo(DEST_ACCOUNT_ID, DEST_REGION);
    console.log(`✅ Destination account connected: ${destInfo.name || DEST_ACCOUNT_ID}`);
    
    // Initialize copy trader
    const copyTrader = new FilteredCopyTrader(
      SOURCE_ACCOUNT_ID,
      DEST_ACCOUNT_ID,
      DEST_REGION
    );
    
    // Start copying
    await copyTrader.start();
    
    // Display stats periodically
    setInterval(() => {
      const stats = copyTrader.getStats();
      console.log('\n📊 Copy Trader Stats:');
      console.log(`  Open Positions: ${stats.openPositions}`);
      console.log(`  Daily Trades: ${stats.dailyTrades}`);
      console.log(`  Status: ${stats.isRunning ? '🟢 Running' : '🔴 Stopped'}`);
    }, 60000); // Every minute
    
    // Handle shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down copy trader...');
      copyTrader.stop();
      process.exit(0);
    });
    
    console.log('\n✅ Copy trader is running!');
    console.log('Press Ctrl+C to stop\n');
    
  } catch (error) {
    console.error('❌ Error starting copy trader:', error.message);
    process.exit(1);
  }
}

// Performance comparison display
function showExpectedPerformance() {
  console.log('\n📈 EXPECTED PERFORMANCE');
  console.log('─'.repeat(60));
  console.log('Without Filtering (Original):');
  console.log('  • Monthly Return: ~16%');
  console.log('  • Win Rate: 74.6%');
  console.log('  • Profit: $1,297');
  console.log('  • Risk: HIGH (martingale)');
  console.log('  • FTMO Compatible: ❌');
  
  console.log('\nWith Filtering (This System):');
  console.log('  • Monthly Return: ~20%');
  console.log('  • Win Rate: 94.7%');
  console.log('  • Profit: $1,597 (+23%)');
  console.log('  • Risk: LOW (controlled)');
  console.log('  • FTMO Compatible: ✅');
  console.log('─'.repeat(60));
}

// Show performance expectations
showExpectedPerformance();

// Start the system
startCopyTrading().catch(console.error);