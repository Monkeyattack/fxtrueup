import poolClient from '../poolClient.js';
import { logger } from '../../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

// Account configurations
const accounts = {
  PropFirmKid: {
    id: '1becc873-1ac2-4dbd-b98d-0d81f1e13a4b',
    region: 'london',
    nickname: 'PropFirmKid'
  },
  GoldBuyOnly: {
    id: '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac',
    region: 'london',
    nickname: 'GoldBuyOnly'
  }
};

// Track known positions
const knownPositions = new Map();

async function checkAccountPositions(account) {
  try {
    const positions = await poolClient.getPositions(account.id, account.region);
    const currentPositionIds = new Set(positions.map(p => p.id));
    const accountPositions = knownPositions.get(account.id) || new Set();

    // Check for new positions
    positions.forEach(pos => {
      if (!accountPositions.has(pos.id)) {
        logger.info(`🎯 NEW POSITION DETECTED on ${account.nickname}:`);
        logger.info(`  Symbol: ${pos.symbol}`);
        logger.info(`  Type: ${pos.type}`);
        logger.info(`  Volume: ${pos.volume} lots`);
        logger.info(`  Open Price: ${pos.openPrice}`);
        logger.info(`  Time: ${new Date(pos.time).toISOString()}`);
        logger.info(`  Position ID: ${pos.id}`);
      }
    });

    // Check for closed positions
    accountPositions.forEach(posId => {
      if (!currentPositionIds.has(posId)) {
        logger.info(`📕 POSITION CLOSED on ${account.nickname}: ${posId}`);
      }
    });

    // Update known positions
    knownPositions.set(account.id, currentPositionIds);

    // Show current status
    if (positions.length > 0) {
      return {
        account: account.nickname,
        openPositions: positions.length,
        totalVolume: positions.reduce((sum, p) => sum + p.volume, 0),
        totalProfit: positions.reduce((sum, p) => sum + (p.profit || 0), 0)
      };
    } else {
      return {
        account: account.nickname,
        openPositions: 0,
        totalVolume: 0,
        totalProfit: 0
      };
    }
  } catch (error) {
    logger.error(`Error checking ${account.nickname}: ${error.message}`);
    return null;
  }
}

async function monitorPositions() {
  logger.info('📡 Starting real-time position monitoring...');
  logger.info('Checking every 5 seconds. Press Ctrl+C to stop.\n');

  // Initial check
  for (const account of Object.values(accounts)) {
    const info = await poolClient.getAccountInfo(account.id, account.region);
    logger.info(`${account.nickname}: Balance: $${info.balance}, Equity: $${info.equity}`);
  }

  // Monitor loop
  setInterval(async () => {
    const results = [];

    for (const account of Object.values(accounts)) {
      const status = await checkAccountPositions(account);
      if (status) results.push(status);
    }

    // Show summary
    if (results.some(r => r.openPositions > 0)) {
      logger.info('\n📊 Current Status:');
      results.forEach(r => {
        if (r.openPositions > 0) {
          logger.info(`  ${r.account}: ${r.openPositions} positions, ${r.totalVolume.toFixed(2)} lots, P/L: $${r.totalProfit.toFixed(2)}`);
        }
      });
    }
  }, 5000); // Check every 5 seconds
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('\n👋 Stopping position monitor...');
  process.exit(0);
});

// Start monitoring
monitorPositions().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});