#!/usr/bin/env node

/**
 * Test script for MetaAPI Pool Integration
 * Tests connection to meta-trader-hub pool and MetaStats functionality
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

async function testPoolIntegration() {
  console.log('🧪 Testing MetaAPI Pool Integration\n');
  
  const accountId = process.env.METAAPI_ACCOUNT_ID;
  
  if (!accountId) {
    console.error('❌ METAAPI_ACCOUNT_ID not set in environment');
    process.exit(1);
  }

  console.log(`📊 Account ID: ${accountId}`);
  console.log(`🔗 Pool API URL: ${process.env.POOL_API_URL || 'http://localhost:8086'}\n`);

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Pool API Health Check...');
    const health = await poolClient.healthCheck();
    console.log('✅ Pool API is running:', health);
    console.log();

    // Test 2: Get Account Info
    console.log('2️⃣ Testing Account Info...');
    const accountInfo = await poolClient.getAccountInfo(accountId);
    console.log('✅ Account Info:', {
      balance: accountInfo.balance,
      equity: accountInfo.equity,
      margin: accountInfo.margin,
      currency: accountInfo.currency
    });
    console.log();

    // Test 3: Get MetaStats Metrics
    console.log('3️⃣ Testing MetaStats Metrics...');
    const metrics = await poolClient.getAccountMetrics(accountId);
    console.log('✅ MetaStats Metrics:', {
      balance: metrics.balance,
      equity: metrics.equity,
      trades: metrics.trades,
      winRate: metrics.winRate,
      profitFactor: metrics.profitFactor,
      maxDrawdownPercent: metrics.maxDrawdownPercent,
      sharpeRatio: metrics.sharpeRatio
    });
    console.log();

    // Test 4: Get Open Trades
    console.log('4️⃣ Testing Open Trades...');
    const openTrades = await poolClient.getOpenTrades(accountId);
    console.log(`✅ Open Trades: ${openTrades.count} positions`);
    if (openTrades.open_trades && openTrades.open_trades.length > 0) {
      openTrades.open_trades.forEach(trade => {
        console.log(`  - ${trade.symbol}: ${trade.type} ${trade.volume} @ ${trade.openPrice}`);
      });
    }
    console.log();

    // Test 5: Get Trade History
    console.log('5️⃣ Testing Trade History (last 7 days)...');
    const tradeHistory = await poolClient.getTradeHistory(accountId, 7, 10);
    console.log(`✅ Trade History: ${tradeHistory.count} trades in last 7 days`);
    if (tradeHistory.trades && tradeHistory.trades.length > 0) {
      console.log('Recent trades:');
      tradeHistory.trades.slice(0, 3).forEach(trade => {
        console.log(`  - ${trade.symbol}: ${trade.type} - P/L: ${trade.profit}`);
      });
    }
    console.log();

    // Test 6: Get Daily Growth
    console.log('6️⃣ Testing Daily Growth (last 7 days)...');
    const dailyGrowth = await poolClient.getDailyGrowth(accountId, 7);
    console.log(`✅ Daily Growth Data Points: ${dailyGrowth.growth ? dailyGrowth.growth.length : 0}`);
    console.log();

    // Test 7: Get Risk Status
    console.log('7️⃣ Testing Risk Status...');
    const riskStatus = await poolClient.getRiskStatus(accountId);
    console.log('✅ Risk Status:', {
      balance: riskStatus.balance,
      equity: riskStatus.equity,
      dailyLossPercent: riskStatus.daily_loss_percent,
      openPositions: riskStatus.open_positions,
      riskStatus: riskStatus.risk_status
    });
    console.log();

    // Test 8: Get Pool Statistics
    console.log('8️⃣ Testing Pool Statistics...');
    const poolStats = await poolClient.getPoolStats();
    console.log('✅ Pool Stats:', poolStats);
    console.log();

    console.log('✨ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testPoolIntegration().catch(console.error);