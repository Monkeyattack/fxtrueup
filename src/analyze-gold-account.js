/**
 * Analyze GoldBuyOnly Account Performance
 * Calculates profit breakdown and performance fees
 */

import poolClient from './services/poolClient.js';
import { GOLD_ACCOUNT_ID, getAccountConfig } from './config/accounts.js';
import { logger } from './utils/logger.js';

async function analyzeGoldBuyOnlyAccount() {
  try {
    logger.info('🏆 Analyzing GoldBuyOnly Account Performance...');

    const accountConfig = getAccountConfig(GOLD_ACCOUNT_ID);
    logger.info(`Account: ${accountConfig.name} (${accountConfig.id})`);
    logger.info(`Region: ${accountConfig.region}`);

    // Get account information
    const accountInfo = await poolClient.getAccountInfo(GOLD_ACCOUNT_ID, accountConfig.region);
    logger.info('\n📊 Current Account Status:');
    logger.info(`Balance: $${accountInfo.balance?.toFixed(2) || 'N/A'}`);
    logger.info(`Equity: $${accountInfo.equity?.toFixed(2) || 'N/A'}`);
    logger.info(`Margin: $${accountInfo.margin?.toFixed(2) || 'N/A'}`);
    logger.info(`Free Margin: $${accountInfo.freeMargin?.toFixed(2) || 'N/A'}`);

    // Get historical trades
    logger.info('\n📈 Fetching historical trades...');

    // Get trade history from pool client
    const tradeData = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, 365, 1000);
    const trades = tradeData.trades || [];

    logger.info(`Found ${trades.length} historical trades`);

    // Also get account metrics for more comprehensive data
    const metrics = await poolClient.getAccountMetrics(GOLD_ACCOUNT_ID);
    logger.info('\n📊 Account Metrics:');
    if (metrics) {
      logger.info(`Total Trades: ${metrics.trades || 'N/A'}`);
      logger.info(`Win Rate: ${metrics.wonTrades && metrics.lostTrades ?
        ((metrics.wonTrades / (metrics.wonTrades + metrics.lostTrades)) * 100).toFixed(2) : 'N/A'}%`);
      logger.info(`Average Win: $${metrics.averageWin?.toFixed(2) || 'N/A'}`);
      logger.info(`Average Loss: $${metrics.averageLoss?.toFixed(2) || 'N/A'}`);
    }

    // Process trades by month
    const monthlyData = {};
    let totalGrossProfit = 0;
    let totalSwap = 0;
    let totalCommission = 0;

    trades.forEach(trade => {
      // Process closed trades
      if (trade.closeTime) {
        const closeDate = new Date(trade.closeTime);
        const monthKey = `${closeDate.getFullYear()}-${String(closeDate.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            grossProfit: 0,
            swap: 0,
            commission: 0,
            tradeCount: 0,
            volume: 0
          };
        }

        // Add to monthly totals
        const profit = trade.profit || 0;
        const swap = trade.swap || 0;
        const commission = trade.commission || 0;

        monthlyData[monthKey].grossProfit += profit;
        monthlyData[monthKey].swap += swap;
        monthlyData[monthKey].commission += commission;
        monthlyData[monthKey].tradeCount++;
        monthlyData[monthKey].volume += trade.volume || 0;

        // Add to totals
        totalGrossProfit += profit;
        totalSwap += swap;
        totalCommission += commission;
      }
    });

    // Display overall summary
    logger.info('\n💰 OVERALL PERFORMANCE SUMMARY:');
    logger.info(`Gross Profit: $${totalGrossProfit.toFixed(2)}`);
    logger.info(`Total Swap (Storage Fees): $${totalSwap.toFixed(2)}`);
    logger.info(`Total Commission: $${totalCommission.toFixed(2)}`);

    const totalNetProfit = totalGrossProfit + totalSwap + totalCommission;
    logger.info(`Net Profit: $${totalNetProfit.toFixed(2)}`);

    const totalPerformanceFee = Math.max(0, totalNetProfit * 0.30);
    logger.info(`30% Performance Fee: $${totalPerformanceFee.toFixed(2)}`);
    logger.info(`Client Net (after fee): $${(totalNetProfit - totalPerformanceFee).toFixed(2)}`);

    // Display monthly breakdown
    logger.info('\n📅 MONTHLY BREAKDOWN:');
    logger.info('='.repeat(80));
    logger.info('Month       | Gross P/L  | Swap Fees | Commission | Net P/L    | 30% Fee    | Client Net');
    logger.info('='.repeat(80));

    const sortedMonths = Object.keys(monthlyData).sort();

    sortedMonths.forEach(month => {
      const data = monthlyData[month];
      const monthlyNet = data.grossProfit + data.swap + data.commission;
      const monthlyFee = Math.max(0, monthlyNet * 0.30);
      const clientNet = monthlyNet - monthlyFee;

      logger.info(
        `${month}    | ` +
        `${data.grossProfit.toFixed(2).padStart(10)} | ` +
        `${data.swap.toFixed(2).padStart(9)} | ` +
        `${data.commission.toFixed(2).padStart(10)} | ` +
        `${monthlyNet.toFixed(2).padStart(10)} | ` +
        `${monthlyFee.toFixed(2).padStart(10)} | ` +
        `${clientNet.toFixed(2).padStart(10)}`
      );
    });

    logger.info('='.repeat(80));

    // Additional statistics
    logger.info('\n📊 ADDITIONAL STATISTICS:');
    const monthCount = sortedMonths.length;
    const avgMonthlyProfit = totalNetProfit / monthCount;
    const avgMonthlyFee = totalPerformanceFee / monthCount;

    logger.info(`Total Months: ${monthCount}`);
    logger.info(`Average Monthly Net Profit: $${avgMonthlyProfit.toFixed(2)}`);
    logger.info(`Average Monthly Performance Fee: $${avgMonthlyFee.toFixed(2)}`);

    // Get current open positions
    const positions = await poolClient.getPositions(GOLD_ACCOUNT_ID, accountConfig.region);
    if (positions.length > 0) {
      logger.info('\n📍 CURRENT OPEN POSITIONS:');
      let unrealizedPL = 0;
      positions.forEach(pos => {
        logger.info(`${pos.symbol}: ${pos.volume} lots @ ${pos.openPrice} | P/L: $${(pos.profit || 0).toFixed(2)}`);
        unrealizedPL += pos.profit || 0;
      });
      logger.info(`Total Unrealized P/L: $${unrealizedPL.toFixed(2)}`);
    }

  } catch (error) {
    logger.error('Error analyzing account:', error);
  } finally {
    // Ensure cleanup
    process.exit(0);
  }
}

// Run the analysis
logger.info('Starting GoldBuyOnly account analysis...');
analyzeGoldBuyOnlyAccount();