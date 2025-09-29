/**
 * Test script for position exit tracking
 */

import positionMapper from '../positionMapper.js';
import redisManager from '../redisManager.js';
import { logger } from '../../utils/logger.js';

async function testExitTracking() {
  logger.info('🧪 Testing exit tracking system...');

  try {
    // Test Redis connection
    await redisManager.connect();
    logger.info('✅ Redis connected');

    // Create a test position mapping
    const testMapping = await positionMapper.createMapping(
      '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac', // GoldBuyOnly
      'TEST123',
      {
        accountId: '019ec0f0-09f5-4230-a7bd-fa2930af07a4', // GridDemo
        positionId: 'TEST_DEST_123',
        sourceSymbol: 'XAUUSD',
        destSymbol: 'XAUUSD',
        sourceVolume: 0.01,
        destVolume: 0.01,
        openTime: new Date().toISOString(),
        sourceOpenPrice: 3800.00,
        destOpenPrice: 3800.00
      }
    );

    logger.info('✅ Test mapping created:', testMapping);

    // Retrieve the mapping
    const retrieved = await positionMapper.getMapping('58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac', 'TEST123');
    logger.info('✅ Retrieved mapping:', retrieved);

    // Get all mappings for account
    const allMappings = await positionMapper.getAccountMappings('58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac');
    logger.info(`✅ Found ${Object.keys(allMappings).length} mappings for GoldBuyOnly`);

    // Record a position close
    await positionMapper.recordPositionClose('58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac', 'TEST123', {
      closeTime: new Date().toISOString(),
      closePrice: 3810.00,
      profit: 10.00,
      reason: 'TEST_CLOSE'
    });

    logger.info('✅ Recorded position close');

    // Check if recently closed
    const wasClosed = await positionMapper.wasRecentlyClosed('58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac', 'TEST123');
    logger.info(`✅ Was recently closed: ${wasClosed}`);

    // Clean up test mapping
    await positionMapper.deleteMapping('58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac', 'TEST123');
    logger.info('✅ Cleaned up test mapping');

    // Get stats
    const stats = positionMapper.getMappingStats();
    logger.info('📊 Mapping stats:', stats);

  } catch (error) {
    logger.error('❌ Test failed:', error);
  } finally {
    await redisManager.disconnect();
  }
}

// Run the test
testExitTracking()
  .then(() => {
    logger.info('✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });