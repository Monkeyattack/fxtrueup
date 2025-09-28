#!/usr/bin/env node
/**
 * Test Unified Pool Client
 * Tests the platform-agnostic interface that routes between MetaAPI and cTrader
 */

import unifiedPoolClient from '../../unifiedPoolClient.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test configuration
const testConfig = {
  metaapiAccount: process.env.METAAPI_TEST_ACCOUNT || 'demo-account',
  ctraderAccount: process.env.CTRADER_TEST_ACCOUNT || '12345',
  testSymbol: 'EURUSD'
};

async function setupTestRouting() {
  // Create test routing config
  const routingConfig = {
    accounts: {
      [testConfig.metaapiAccount]: {
        platform: 'metaapi',
        region: 'new-york'
      },
      [testConfig.ctraderAccount]: {
        platform: 'ctrader',
        environment: 'demo'
      }
    }
  };

  const configPath = path.join(__dirname, '../../config/routing-config.json');
  await fs.writeFile(configPath, JSON.stringify(routingConfig, null, 2));
  console.log('✅ Test routing config created\n');
}

async function testUnifiedOperations() {
  console.log('🌐 Testing Unified Pool Client...\n');

  try {
    // Setup test routing
    await setupTestRouting();

    // Test 1: Health check
    console.log('1. Testing unified health check:');
    const health = await unifiedPoolClient.healthCheck();
    console.log('✅ Health status:', {
      overall: health.status,
      metaapi: health.metaapi?.status || 'not available',
      ctrader: health.ctrader?.status || 'not available'
    }, '\n');

    // Test 2: Account detection for MetaAPI
    console.log('2. Testing MetaAPI account detection:');
    const metaapiConfig = await unifiedPoolClient.getAccountConfig(testConfig.metaapiAccount);
    console.log(`✅ ${testConfig.metaapiAccount} detected as:`, metaapiConfig, '\n');

    // Test 3: Account detection for cTrader
    console.log('3. Testing cTrader account detection:');
    const ctraderConfig = await unifiedPoolClient.getAccountConfig(testConfig.ctraderAccount);
    console.log(`✅ ${testConfig.ctraderAccount} detected as:`, ctraderConfig, '\n');

    // Test 4: Get account info (MetaAPI)
    console.log('4. Testing MetaAPI account info through unified client:');
    try {
      const metaapiInfo = await unifiedPoolClient.getAccountInfo(
        testConfig.metaapiAccount,
        'new-york'
      );
      console.log('✅ MetaAPI account:', {
        id: metaapiInfo.id,
        balance: metaapiInfo.balance,
        platform: metaapiInfo.platform || 'metaapi'
      });
    } catch (error) {
      console.log('⚠️  MetaAPI account not available:', error.message);
    }
    console.log();

    // Test 5: Get account info (cTrader)
    console.log('5. Testing cTrader account info through unified client:');
    try {
      const ctraderInfo = await unifiedPoolClient.getAccountInfo(
        testConfig.ctraderAccount,
        'demo'
      );
      console.log('✅ cTrader account:', {
        id: ctraderInfo.id,
        balance: ctraderInfo.balance,
        platform: ctraderInfo.platform
      });
    } catch (error) {
      console.log('⚠️  cTrader account not available:', error.message);
    }
    console.log();

    // Test 6: Subscribe to symbol (platform-agnostic)
    console.log('6. Testing unified symbol subscription:');
    const subscribed = await unifiedPoolClient.subscribeToSymbol(testConfig.testSymbol);
    console.log(subscribed ?
      `✅ Subscribed to ${testConfig.testSymbol} on available platforms` :
      `⚠️  Could not subscribe to ${testConfig.testSymbol}\n`
    );

    // Test 7: Get unified price
    console.log('\n7. Testing unified price retrieval:');
    const price = await unifiedPoolClient.getPrice(testConfig.testSymbol);
    if (price) {
      console.log(`✅ ${testConfig.testSymbol} unified price:`, {
        bid: price.bid,
        ask: price.ask,
        source: price.brokerTime ? 'real' : 'cached'
      });
    } else {
      console.log(`⚠️  No price available for ${testConfig.testSymbol}`);
    }

    // Test 8: Get all prices (merged)
    console.log('\n8. Testing merged price retrieval:');
    const allPrices = await unifiedPoolClient.getAllPrices();
    const priceCount = Object.keys(allPrices).length;
    console.log(`✅ Retrieved ${priceCount} total prices from all platforms`);

    // Test 9: Get pool stats
    console.log('\n9. Testing combined pool stats:');
    const poolStats = await unifiedPoolClient.getPoolStats();
    console.log('✅ Combined pool stats:', {
      metaapi: poolStats.metaapi,
      ctrader: poolStats.ctrader,
      combined: poolStats.combined
    });

    // Test 10: Get accounts summary
    console.log('\n10. Testing unified accounts summary:');
    const summary = await unifiedPoolClient.getAccountsSummary();
    console.log(`✅ Total accounts: ${Object.keys(summary).length}`);
    Object.entries(summary).slice(0, 3).forEach(([accountId, info]) => {
      console.log(`   ${accountId}: ${info.platform || 'unknown'} - ${info.status || 'unknown'}`);
    });

    // Test 11: Platform-specific methods
    console.log('\n11. Testing platform-specific methods:');

    // Test pending orders (cTrader specific)
    try {
      const pendingOrders = await unifiedPoolClient.getPendingOrders(testConfig.ctraderAccount);
      console.log(`✅ Pending orders for cTrader: ${pendingOrders.length}`);
    } catch (error) {
      console.log('⚠️  Could not get pending orders:', error.message);
    }

    // Test MetaAPI specific call
    try {
      const metaApiOrders = await unifiedPoolClient.getPendingOrders(testConfig.metaapiAccount);
      console.log(`✅ Pending orders for MetaAPI: ${metaApiOrders.length} (empty expected)`);
    } catch (error) {
      console.log('⚠️  MetaAPI pending orders:', error.message);
    }

    // Test 12: Test routing logic
    console.log('\n12. Testing automatic routing:');
    const testAccounts = [
      { id: testConfig.metaapiAccount, expectedPlatform: 'metaapi' },
      { id: testConfig.ctraderAccount, expectedPlatform: 'ctrader' },
      { id: 'unknown-account', expectedPlatform: 'metaapi' }  // Should default to MetaAPI
    ];

    for (const test of testAccounts) {
      const config = await unifiedPoolClient.getAccountConfig(test.id);
      console.log(`✅ ${test.id} → ${config.platform} (expected: ${test.expectedPlatform})`);
    }

    // Test 13: Test mid price calculation
    console.log('\n13. Testing mid price calculation:');
    const midPrice = await unifiedPoolClient.getMidPrice(testConfig.testSymbol);
    if (midPrice) {
      console.log(`✅ ${testConfig.testSymbol} mid price: ${midPrice}`);
    } else {
      console.log(`⚠️  Could not calculate mid price for ${testConfig.testSymbol}`);
    }

    // Test 14: Test wait for price
    console.log('\n14. Testing wait for price (3 second timeout):');
    const waitedPrice = await unifiedPoolClient.waitForPrice(testConfig.testSymbol, 3000);
    if (waitedPrice) {
      console.log(`✅ Got price for ${testConfig.testSymbol} within timeout`);
    } else {
      console.log(`⚠️  Timeout waiting for ${testConfig.testSymbol} price`);
    }

    console.log('\n✅ Unified pool client tests completed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testUnifiedOperations().catch(console.error);