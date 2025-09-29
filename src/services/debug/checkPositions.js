import poolClient from '../poolClient.js';
import { logger } from '../../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

// Account configurations
const accounts = {
  PropFirmKid: {
    id: '1becc873-1ac2-4dbd-b98d-0d81f1e13a4b',
    region: 'london'
  },
  GoldBuyOnly: {
    id: '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac',
    region: 'london'
  }
};

async function checkPositions() {
  logger.info('🔍 Checking positions on source accounts...');

  for (const [nickname, account] of Object.entries(accounts)) {
    try {
      logger.info(`\n📊 Checking ${nickname} (${account.id})...`);

      // Try to get account info to check connection
      let accountInfo;
      try {
        accountInfo = await poolClient.getAccountInfo(account.id, account.region);
        logger.info(`✅ Connected - Balance: $${accountInfo.balance}, Equity: $${accountInfo.equity}`);
      } catch (error) {
        logger.warn(`❌ ${nickname} is not connected: ${error.message}`);
        continue;
      }

      // Get current positions
      const positions = await poolClient.getPositions(account.id, account.region);

      if (positions.length === 0) {
        logger.info('No open positions');
      } else {
        logger.info(`Found ${positions.length} open position(s):`);
        positions.forEach(pos => {
          logger.info(`  - ${pos.symbol} ${pos.type} ${pos.volume} lots @ ${pos.openPrice}`);
          logger.info(`    ID: ${pos.id}, Time: ${new Date(pos.time).toISOString()}`);
          logger.info(`    Current P/L: $${pos.profit}`);
        });
      }

      // Get recent trade history
      logger.info('\n📜 Recent trade history (last 24 hours):');
      const history = await poolClient.getTradeHistory(account.id, 1, 20);

      if (!history || history.length === 0) {
        logger.info('No trades in the last 24 hours');
      } else {
        history.slice(0, 10).forEach(trade => {
          logger.info(`  - ${trade.symbol} ${trade.type} ${trade.volume || trade.executedVolume} lots`);
          logger.info(`    Time: ${new Date(trade.time).toISOString()}`);
          logger.info(`    State: ${trade.state}, P/L: $${trade.profit || 0}`);
        });
      }

    } catch (error) {
      logger.error(`Error checking ${nickname}:`, error);
    }
  }

  logger.info('\n✅ Position check complete');
}

// Run the check
checkPositions()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });