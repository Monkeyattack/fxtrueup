import poolClient from '../poolClient.js';
import { logger } from '../../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkPositionDetails() {
  const account = {
    id: '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac',
    region: 'london',
    nickname: 'GoldBuyOnly'
  };

  logger.info(`\n📊 Checking ${account.nickname} position details...`);

  try {
    const positions = await poolClient.getPositions(account.id, account.region);

    if (positions.length === 0) {
      logger.info('No open positions');
      return;
    }

    positions.forEach(pos => {
      logger.info(`\n🔍 Position ${pos.id}:`);
      logger.info(`  Symbol: ${pos.symbol}`);
      logger.info(`  Type: ${pos.type}`);
      logger.info(`  Volume: ${pos.volume} lots`);
      logger.info(`  Open Price: ${pos.openPrice}`);
      logger.info(`  Current Price: ${pos.currentPrice || 'N/A'}`);
      logger.info(`  Stop Loss: ${pos.stopLoss || 'NOT SET'} ${pos.stopLoss ? '✅' : '❌'}`);
      logger.info(`  Take Profit: ${pos.takeProfit || 'NOT SET'} ${pos.takeProfit ? '✅' : '❌'}`);
      logger.info(`  P/L: $${pos.profit}`);

      // Check what fields are available
      logger.info('\n  Available fields:');
      Object.keys(pos).forEach(key => {
        if (!['id', 'symbol', 'type', 'volume', 'openPrice', 'stopLoss', 'takeProfit', 'profit'].includes(key)) {
          logger.info(`    ${key}: ${pos[key]}`);
        }
      });
    });

  } catch (error) {
    logger.error('Error:', error);
  }
}

checkPositionDetails()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });