import poolClient from '../poolClient.js';
import { logger } from '../../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkTradeHistory() {
  const account = {
    id: '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac',
    region: 'london',
    nickname: 'GoldBuyOnly'
  };

  logger.info(`\n📊 Checking ${account.nickname} trade history...`);

  try {
    // Get account info
    const info = await poolClient.getAccountInfo(account.id, account.region);
    logger.info(`Balance: $${info.balance}, Equity: $${info.equity}`);

    // Get current positions
    const positions = await poolClient.getPositions(account.id, account.region);
    logger.info(`\n🔴 Current OPEN positions: ${positions.length}`);
    if (positions.length > 0) {
      positions.forEach(pos => {
        logger.info(`  Position ID: ${pos.id}`);
        logger.info(`  Symbol: ${pos.symbol} ${pos.type}`);
        logger.info(`  Volume: ${pos.volume} lots @ ${pos.openPrice}`);
        logger.info(`  Opened: ${new Date(pos.time).toISOString()}`);
        logger.info(`  Current P/L: $${pos.profit}\n`);
      });
    }

    // Check if the position 51287351 is in current positions
    const targetPosition = positions.find(p => p.id === '51287351');
    if (targetPosition) {
      logger.info(`✅ Position 51287351 is STILL OPEN`);
    } else {
      logger.info(`❌ Position 51287351 is NOT in open positions`);
    }

    // Get trade history for today
    logger.info('\n📜 Trade history (last 24 hours):');
    const history = await poolClient.getTradeHistory(account.id, 1, 50);

    if (!history || !Array.isArray(history)) {
      logger.info('No trade history available');
      return;
    }

    // Filter for today's trades
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysTrades = history.filter(trade => {
      const tradeTime = new Date(trade.time);
      return tradeTime >= today;
    });

    logger.info(`Found ${todaysTrades.length} trades today`);

    todaysTrades.forEach(trade => {
      logger.info(`\n  Trade ID: ${trade.id || trade.positionId}`);
      logger.info(`  Time: ${new Date(trade.time).toISOString()}`);
      logger.info(`  Symbol: ${trade.symbol}`);
      logger.info(`  Type: ${trade.type}`);
      logger.info(`  Volume: ${trade.volume || trade.executedVolume} lots`);
      logger.info(`  State: ${trade.state}`);
      if (trade.closeTime) {
        logger.info(`  Closed: ${new Date(trade.closeTime).toISOString()}`);
        logger.info(`  P/L: $${trade.profit || 0}`);
      }
    });

    // Look specifically for position 51287351
    logger.info('\n🔍 Looking for position 51287351 in history...');
    const targetInHistory = history.find(t =>
      t.id === '51287351' ||
      t.positionId === '51287351' ||
      (t.comment && t.comment.includes('51287351'))
    );

    if (targetInHistory) {
      logger.info('Found in history:');
      logger.info(JSON.stringify(targetInHistory, null, 2));
    } else {
      logger.info('Not found in recent history');
    }

  } catch (error) {
    logger.error('Error:', error);
  }
}

checkTradeHistory()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });