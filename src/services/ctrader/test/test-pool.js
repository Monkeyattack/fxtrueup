#!/usr/bin/env node
/**
 * Test cTrader Pool Client
 * Tests the connection pool and trading operations
 */

import ctraderPoolClient from '../ctraderPoolClient.js';
import { logger } from '../../../utils/logger.js';

// Test configuration
const testConfig = {
  accountId: process.env.CTRADER_TEST_ACCOUNT || '12345',
  environment: process.env.CTRADER_ENV || 'demo',
  testSymbol: 'EURUSD',
  pythonPoolUrl: 'http://localhost:8088'
};

async function testPoolOperations() {
  console.log('🏊 Testing cTrader Pool Client...\n');
  console.log(`Pool URL: ${testConfig.pythonPoolUrl}`);
  console.log(`Account: ${testConfig.accountId} (${testConfig.environment})\n`);

  try {
    // Test 1: Pool health check
    console.log('1. Testing pool health:');
    const health = await ctraderPoolClient.healthCheck();
    console.log('✅ Pool status:', health.status);
    console.log('   Stats:', health.stats, '\n');

    // Test 2: Get account info
    console.log('2. Testing account info:');
    try {
      const accountInfo = await ctraderPoolClient.getAccountInfo(
        testConfig.accountId,
        testConfig.environment
      );
      console.log('✅ Account info retrieved:', {
        id: accountInfo.id,
        balance: accountInfo.balance,
        equity: accountInfo.equity,
        currency: accountInfo.currency,
        leverage: accountInfo.leverage,
        platform: accountInfo.platform
      }, '\n');
    } catch (error) {
      console.log('⚠️  Account not connected:', error.message, '\n');
    }

    // Test 3: Get positions
    console.log('3. Testing position retrieval:');
    try {
      const positions = await ctraderPoolClient.getPositions(
        testConfig.accountId,
        testConfig.environment
      );
      console.log(`✅ Found ${positions.length} positions`);
      if (positions.length > 0) {
        console.log('   Sample position:', {
          id: positions[0].id,
          symbol: positions[0].symbol,
          type: positions[0].type,
          volume: positions[0].volume,
          profit: positions[0].profit
        });
      }
      console.log();
    } catch (error) {
      console.log('⚠️  Could not get positions:', error.message, '\n');
    }

    // Test 4: Initialize streaming
    console.log('4. Testing streaming initialization:');
    try {
      const streamingResult = await ctraderPoolClient.initializeStreaming(
        testConfig.accountId,
        testConfig.environment
      );
      console.log(streamingResult ? '✅ Streaming initialized' : '⚠️  Streaming not initialized\n');
    } catch (error) {
      console.log('❌ Streaming initialization failed:', error.message, '\n');
    }

    // Test 5: Subscribe to symbol
    console.log('5. Testing symbol subscription:');
    try {
      const subscribed = await ctraderPoolClient.subscribeToSymbol(
        testConfig.testSymbol,
        testConfig.accountId
      );
      console.log(subscribed ?
        `✅ Subscribed to ${testConfig.testSymbol}` :
        `⚠️  Could not subscribe to ${testConfig.testSymbol}\n`
      );
    } catch (error) {
      console.log('❌ Subscription failed:', error.message, '\n');
    }

    // Test 6: Get price
    console.log('6. Testing price retrieval:');
    try {
      const price = await ctraderPoolClient.getPrice(testConfig.testSymbol);
      if (price) {
        console.log(`✅ ${testConfig.testSymbol} price:`, {
          bid: price.bid,
          ask: price.ask,
          spread: price.ask - price.bid
        });
      } else {
        console.log(`⚠️  No price available for ${testConfig.testSymbol}`);
      }
      console.log();
    } catch (error) {
      console.log('❌ Price retrieval failed:', error.message, '\n');
    }

    // Test 7: Get all prices
    console.log('7. Testing all prices retrieval:');
    try {
      const allPrices = await ctraderPoolClient.getAllPrices();
      const priceCount = Object.keys(allPrices).length;
      console.log(`✅ Retrieved prices for ${priceCount} symbols`);
      if (priceCount > 0) {
        const firstSymbol = Object.keys(allPrices)[0];
        console.log(`   Sample: ${firstSymbol} -`, allPrices[firstSymbol]);
      }
      console.log();
    } catch (error) {
      console.log('❌ All prices retrieval failed:', error.message, '\n');
    }

    // Test 8: Get pool stats
    console.log('8. Testing pool statistics:');
    const stats = await ctraderPoolClient.getPoolStats();
    console.log('✅ Pool stats:', stats, '\n');

    // Test 9: Test trading operation (dry run)
    console.log('9. Testing trade execution (dry run):');
    const tradeData = {
      symbol: testConfig.testSymbol,
      actionType: 'ORDER_TYPE_BUY',
      volume: 0.01,
      comment: 'Test trade from pool client'
    };
    console.log('   Trade params:', tradeData);
    console.log('   ⚠️ Skipping actual execution in test mode\n');

    // Test 10: Get account metrics
    console.log('10. Testing account metrics:');
    try {
      const metrics = await ctraderPoolClient.getAccountMetrics(testConfig.accountId);
      console.log('✅ Account metrics:', metrics, '\n');
    } catch (error) {
      console.log('⚠️  Metrics not available:', error.message, '\n');
    }

    console.log('\n✅ Pool client tests completed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testPoolOperations().catch(console.error);