#!/usr/bin/env node
/**
 * Test cTrader Streaming Handler
 * Tests real-time data streaming and event handling
 */

import streamingHandler from '../streamingHandler.js';
import { EventEmitter } from 'events';

// Test configuration
const testConfig = {
  accountId: process.env.CTRADER_TEST_ACCOUNT || '12345',
  symbols: ['EURUSD', 'GBPUSD', 'XAUUSD'],
  testDuration: 10000  // 10 seconds
};

async function testStreamingOperations() {
  console.log('📡 Testing cTrader Streaming Handler...\n');

  try {
    // Test 1: Start streaming handler
    console.log('1. Starting streaming handler:');
    await streamingHandler.start();
    console.log('✅ Streaming handler started\n');

    // Test 2: Subscribe to symbols
    console.log('2. Subscribing to symbols:');
    for (const symbol of testConfig.symbols) {
      await streamingHandler.subscribeToSymbol(symbol, testConfig.accountId);
      console.log(`✅ Subscribed to ${symbol}`);
    }
    console.log();

    // Test 3: Set up event listeners
    console.log('3. Setting up event listeners:');
    let priceUpdateCount = 0;
    let positionEvents = [];

    // Price update listener
    streamingHandler.on('price', (priceData) => {
      priceUpdateCount++;
      console.log(`💹 Price update: ${priceData.symbol} - Bid: ${priceData.bid}, Ask: ${priceData.ask}`);
    });

    // Position event listeners
    streamingHandler.on('positionOpened', (event) => {
      positionEvents.push(event);
      console.log(`📈 Position opened: ${event.position.symbol} ${event.position.type}`);
    });

    streamingHandler.on('positionClosed', (event) => {
      positionEvents.push(event);
      console.log(`📉 Position closed: ${event.symbol} - Profit: ${event.closedProfit}`);
    });

    streamingHandler.on('positionModified', (event) => {
      positionEvents.push(event);
      console.log(`✏️  Position modified: ${event.positionId}`);
    });

    streamingHandler.on('error', (error) => {
      console.log(`❌ Streaming error: ${error.message}`);
    });

    console.log('✅ Event listeners attached\n');

    // Test 4: Monitor account
    console.log('4. Starting account monitoring:');
    await streamingHandler.monitorAccount(testConfig.accountId, testConfig.symbols);
    console.log(`✅ Monitoring account ${testConfig.accountId}\n`);

    // Test 5: Get streaming stats
    console.log('5. Initial streaming stats:');
    const initialStats = streamingHandler.getStats();
    console.log('✅ Stats:', initialStats, '\n');

    // Test 6: Wait for some data
    console.log(`6. Collecting data for ${testConfig.testDuration / 1000} seconds...\n`);

    await new Promise(resolve => setTimeout(resolve, testConfig.testDuration));

    // Test 7: Check collected data
    console.log('\n7. Data collection summary:');
    console.log(`✅ Price updates received: ${priceUpdateCount}`);
    console.log(`✅ Position events: ${positionEvents.length}`);

    // Get current prices
    const currentPrices = streamingHandler.getAllPrices();
    console.log(`✅ Cached prices: ${Object.keys(currentPrices).length} symbols`);

    // Display sample prices
    if (Object.keys(currentPrices).length > 0) {
      console.log('\nCurrent prices:');
      Object.entries(currentPrices).slice(0, 3).forEach(([symbol, price]) => {
        console.log(`  ${symbol}: Bid ${price.bid}, Ask ${price.ask}`);
      });
    }

    // Test 8: Get positions for account
    console.log('\n8. Testing position cache:');
    const positions = streamingHandler.getPositions(testConfig.accountId);
    console.log(`✅ Cached positions: ${positions.length}`);
    if (positions.length > 0) {
      console.log('Sample position:', {
        id: positions[0].id,
        symbol: positions[0].symbol,
        profit: positions[0].profit
      });
    }

    // Test 9: Get recent execution events
    console.log('\n9. Testing execution events:');
    const recentEvents = streamingHandler.getRecentExecutionEvents(10);
    console.log(`✅ Recent execution events: ${recentEvents.length}`);

    // Test 10: Final stats
    console.log('\n10. Final streaming stats:');
    const finalStats = streamingHandler.getStats();
    console.log('✅ Stats:', finalStats);

    // Test 11: Unsubscribe from a symbol
    console.log('\n11. Testing unsubscribe:');
    streamingHandler.unsubscribeFromSymbol(testConfig.symbols[0], testConfig.accountId);
    console.log(`✅ Unsubscribed from ${testConfig.symbols[0]}`);

    // Test 12: Stop monitoring account
    console.log('\n12. Testing stop monitoring:');
    streamingHandler.stopMonitoringAccount(testConfig.accountId);
    console.log(`✅ Stopped monitoring account ${testConfig.accountId}`);

    // Test 13: Stop streaming handler
    console.log('\n13. Stopping streaming handler:');
    await streamingHandler.stop();
    console.log('✅ Streaming handler stopped');

    console.log('\n✅ Streaming tests completed!');
    console.log(`Total price updates received: ${priceUpdateCount}`);
    console.log(`Total position events: ${positionEvents.length}`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testStreamingOperations().catch(console.error);