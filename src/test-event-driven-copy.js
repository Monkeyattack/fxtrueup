#!/usr/bin/env node

import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import EnhancedCopyTraderV2 from './services/enhancedCopyTraderV2.js';

dotenv.config();

/**
 * Test Event-Driven Copy Trader
 */
async function testEventDrivenCopy() {
  logger.info('🧪 Testing Event-Driven Enhanced Copy Trader');

  // Configuration
  const config = {
    fixedLotSize: 0.01,
    stopLossBuffer: 10,
    takeProfitBuffer: -5,
    maxOpenPositions: 5,
    allowedSymbols: ['XAUUSD', 'BTCUSD', 'EURUSD', 'GBPUSD'],
    minTimeBetweenTrades: 5000,
    maxDailyTrades: 10,
    allowedHours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    shortSqueeze: {
      enabled: true,
      minSqueezeScore: 0.5,
      squeezeStopLossBuffer: 5,
      squeezeLotMultiplier: 1.2,
      allowedSymbols: ['XAU', 'GOLD']
    }
  };

  // Create copy trader instance
  const copyTrader = new EnhancedCopyTraderV2(config);

  try {
    // Initialize with source and destination accounts
    const sourceAccountId = 'bb106d21-d303-4e06-84fd-e6a21d20cec9'; // Demo source account
    const destAccountId = '4019e233-89b6-4c36-8df0-3f24381d95ad';   // Demo destination account

    await copyTrader.initialize(sourceAccountId, destAccountId, 'new-york');

    // Show initial stats
    const stats = copyTrader.getStats();
    logger.info('📊 Initial Stats:', stats);

    // Set up periodic stats logging
    const statsInterval = setInterval(() => {
      const currentStats = copyTrader.getStats();
      logger.info('📈 Current Stats:', {
        sourcePositions: currentStats.sourcePositions,
        destPositions: currentStats.destPositions,
        copiedPositions: currentStats.copiedPositions,
        dailyTrades: currentStats.daily.trades,
        squeezeTrades: currentStats.daily.squeezeTrades
      });
    }, 30000); // Every 30 seconds

    // Run for a specified duration
    const runDuration = 5 * 60 * 1000; // 5 minutes
    logger.info(`⏰ Running for ${runDuration / 1000} seconds...`);

    await new Promise(resolve => setTimeout(resolve, runDuration));

    // Stop everything
    clearInterval(statsInterval);
    await copyTrader.stop();

    // Final stats
    const finalStats = copyTrader.getStats();
    logger.info('🏁 Final Stats:', finalStats);

  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run test
testEventDrivenCopy().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});