#!/usr/bin/env node
/**
 * Test cTrader Data Mapper
 * Tests the data conversion between cTrader and MetaAPI formats
 */

import dataMapper from '../dataMapper.js';

// Mock cTrader data
const mockCTraderPosition = {
  positionId: 123456,
  symbolId: 1,  // EURUSD
  tradeSide: 'BUY',
  volume: 1000,  // 0.01 lots
  entryPrice: 1.0850,
  currentPrice: 1.0860,
  swap: -0.50,
  profit: 10.00,
  commission: -0.20,
  comment: 'Test position',
  stopLoss: 1.0800,
  takeProfit: 1.0900,
  utcTimestamp: Date.now(),
  utcLastUpdateTimestamp: Date.now()
};

const mockCTraderAccount = {
  accountId: 12345,
  brokerName: 'IC Markets',
  currency: 'USD',
  balance: 10000,
  equity: 10050,
  margin: 100,
  freeMargin: 9950,
  leverage: 500,
  marginLevel: 10050,
  environment: 'demo'
};

const mockCTraderOrder = {
  orderId: 789012,
  symbolId: 22,  // GOLD
  orderType: 2,  // LIMIT
  tradeSide: 'SELL',
  volume: 10000,  // 0.10 lots
  limitPrice: 2050.00,
  comment: 'Test order',
  orderStatus: 'PENDING',
  utcTimestamp: Date.now()
};

const mockMetaApiOrder = {
  symbol: 'EURUSD',
  actionType: 'ORDER_TYPE_BUY',
  volume: 0.01,
  stopLoss: 1.0800,
  takeProfit: 1.0900,
  comment: 'Test MetaAPI order'
};

async function testDataMapping() {
  console.log('🔄 Testing cTrader Data Mapper...\n');

  try {
    // Test 1: Position mapping
    console.log('1. Testing position conversion (cTrader → MetaAPI):');
    const mappedPosition = await dataMapper.mapPosition(mockCTraderPosition);
    console.log('✅ Mapped position:', {
      id: mappedPosition.id,
      symbol: mappedPosition.symbol,
      type: mappedPosition.type,
      volume: mappedPosition.volume,
      openPrice: mappedPosition.openPrice,
      currentPrice: mappedPosition.currentPrice,
      profit: mappedPosition.profit,
      stopLoss: mappedPosition.stopLoss,
      takeProfit: mappedPosition.takeProfit
    }, '\n');

    // Test 2: Account mapping
    console.log('2. Testing account conversion (cTrader → MetaAPI):');
    const mappedAccount = await dataMapper.mapAccountInfo(mockCTraderAccount);
    console.log('✅ Mapped account:', {
      id: mappedAccount.id,
      broker: mappedAccount.broker,
      currency: mappedAccount.currency,
      balance: mappedAccount.balance,
      equity: mappedAccount.equity,
      margin: mappedAccount.margin,
      freeMargin: mappedAccount.freeMargin,
      leverage: mappedAccount.leverage,
      platform: mappedAccount.platform
    }, '\n');

    // Test 3: Order mapping (cTrader → MetaAPI)
    console.log('3. Testing order conversion (cTrader → MetaAPI):');
    const mappedOrder = await dataMapper.mapOrder(mockCTraderOrder);
    console.log('✅ Mapped order:', {
      id: mappedOrder.id,
      symbol: mappedOrder.symbol,
      type: mappedOrder.type,
      state: mappedOrder.state,
      volume: mappedOrder.volume,
      openPrice: mappedOrder.openPrice,
      comment: mappedOrder.comment
    }, '\n');

    // Test 4: Order request mapping (MetaAPI → cTrader)
    console.log('4. Testing order request conversion (MetaAPI → cTrader):');
    const mappedRequest = await dataMapper.mapOrderRequest(mockMetaApiOrder);
    console.log('✅ Mapped request:', mappedRequest, '\n');

    // Test 5: Price data mapping
    console.log('5. Testing price data conversion:');
    const mappedPrice = await dataMapper.mapPriceData(1, 1.0855, 1.0857);
    console.log('✅ Mapped price:', {
      symbol: mappedPrice.symbol,
      bid: mappedPrice.bid,
      ask: mappedPrice.ask,
      spread: mappedPrice.spread
    }, '\n');

    // Test 6: Symbol mapping
    console.log('6. Testing symbol mapping:');
    const symbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'];
    console.log('Symbol mappings:');
    for (const symbol of symbols) {
      const mapping = await dataMapper.getSymbolMapping(symbol);
      if (mapping) {
        console.log(`  ✅ ${symbol} → cTrader ID: ${mapping.cTraderId}, Name: ${mapping.cTraderName}`);
      } else {
        console.log(`  ⚠️  ${symbol} → No mapping found`);
      }
    }
    console.log();

    // Test 7: Volume conversion
    console.log('7. Testing volume conversion:');
    const testVolumes = [0.01, 0.10, 1.00, 10.00];
    console.log('MetaAPI → cTrader volume conversion:');
    testVolumes.forEach(vol => {
      const cTraderVol = vol * 100;
      console.log(`  ${vol} lots → ${cTraderVol} (cTrader volume)`);
    });
    console.log();

    // Test 8: Order state mapping
    console.log('8. Testing order state mapping:');
    const states = ['PENDING', 'ACCEPTED', 'FILLED', 'CANCELLED', 'REJECTED'];
    console.log('cTrader → MetaAPI state mapping:');
    states.forEach(state => {
      const mappedState = dataMapper.mapOrderState(state);
      console.log(`  ${state} → ${mappedState}`);
    });
    console.log();

    // Test 9: Execution event mapping
    console.log('9. Testing execution event mapping:');
    const mockExecution = {
      executionId: '123',
      symbolId: 1,
      tradeSide: 'BUY',
      orderId: '456',
      positionId: '789',
      volume: 1000,
      executionPrice: 1.0855,
      commission: -0.50,
      utcTimestamp: Date.now()
    };
    const mappedExecution = await dataMapper.mapExecutionEvent(mockExecution);
    console.log('✅ Mapped execution:', {
      id: mappedExecution.id,
      type: mappedExecution.type,
      symbol: mappedExecution.symbol,
      volume: mappedExecution.volume,
      price: mappedExecution.price
    }, '\n');

    console.log('\n✅ Data mapper tests completed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testDataMapping().catch(console.error);