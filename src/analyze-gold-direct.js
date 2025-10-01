/**
 * Direct MetaAPI Connection for GoldBuyOnly Account Analysis
 * Uses MetaStats for comprehensive performance metrics
 */

import MetaApi from 'metaapi.cloud-sdk/esm-node';
import { GOLD_ACCOUNT_ID, getAccountConfig } from './config/accounts.js';
import { logger } from './utils/logger.js';

async function analyzeWithMetaStats() {
  let api;
  let metaStatsApi;
  let account;
  let connection;

  try {
    logger.info('🔗 Connecting directly to MetaAPI...');

    // Initialize MetaAPI with token
    const token = process.env.METAAPI_TOKEN;
    if (!token) {
      throw new Error('METAAPI_TOKEN not found in environment');
    }

    api = new MetaApi(token);
    metaStatsApi = api.metaStats;

    const accountConfig = getAccountConfig(GOLD_ACCOUNT_ID);
    logger.info(`\n📊 Analyzing: ${accountConfig.name}`);
    logger.info(`Account ID: ${accountConfig.id}`);
    logger.info(`Region: ${accountConfig.region}`);

    // Get MetaStats account metrics
    logger.info('\n🔍 Fetching MetaStats data...');

    try {
      // Get comprehensive metrics
      const metrics = await metaStatsApi.getMetrics(GOLD_ACCOUNT_ID);

      logger.info('\n💰 ACCOUNT PERFORMANCE OVERVIEW:');
      logger.info(`═══════════════════════════════════════`);

      // Overall Performance
      if (metrics) {
        logger.info(`\n📈 Overall Statistics:`);
        logger.info(`Total Trades: ${metrics.trades || 0}`);
        logger.info(`Won Trades: ${metrics.wonTrades || 0}`);
        logger.info(`Lost Trades: ${metrics.lostTrades || 0}`);

        const winRate = metrics.wonTrades && metrics.lostTrades
          ? ((metrics.wonTrades / (metrics.wonTrades + metrics.lostTrades)) * 100).toFixed(2)
          : 'N/A';
        logger.info(`Win Rate: ${winRate}%`);

        logger.info(`\n💵 Profit/Loss:`);
        logger.info(`Total Net Profit: $${metrics.profit?.toFixed(2) || '0.00'}`);
        logger.info(`Average Win: $${metrics.averageWin?.toFixed(2) || '0.00'}`);
        logger.info(`Average Loss: $${metrics.averageLoss?.toFixed(2) || '0.00'}`);
        logger.info(`Profit Factor: ${metrics.profitFactor?.toFixed(2) || 'N/A'}`);

        logger.info(`\n📊 Risk Metrics:`);
        logger.info(`Max Drawdown: ${metrics.maxDrawdown?.toFixed(2) || '0.00'}%`);
        logger.info(`Return: ${metrics.return?.toFixed(2) || '0.00'}%`);
      }

      // Get open trades (if any)
      const openTrades = await metaStatsApi.getOpenTrades(GOLD_ACCOUNT_ID);
      if (openTrades && openTrades.length > 0) {
        logger.info(`\n🔓 Open Positions: ${openTrades.length}`);
        let totalUnrealizedPL = 0;
        openTrades.forEach(trade => {
          logger.info(`  - ${trade.symbol}: ${trade.volume} lots @ ${trade.openPrice} | P/L: $${(trade.profit || 0).toFixed(2)}`);
          totalUnrealizedPL += trade.profit || 0;
        });
        logger.info(`Total Unrealized P/L: $${totalUnrealizedPL.toFixed(2)}`);
      }

      // Get account growth data
      logger.info('\n📈 Fetching monthly performance data...');

      // MetaStats provides various period options
      const periods = ['day', 'week', 'month', 'year'];

      for (const period of ['month']) { // Focus on monthly for now
        try {
          const growth = await metaStatsApi.getAccountGrowth(GOLD_ACCOUNT_ID, period);

          if (growth && growth.length > 0) {
            logger.info(`\n📅 MONTHLY BREAKDOWN (Last 12 months):`);
            logger.info(`═══════════════════════════════════════════════════════════════════════`);
            logger.info(`Month       | Profit    | Swap     | Total P/L | 30% Fee  | Client Net`);
            logger.info(`═══════════════════════════════════════════════════════════════════════`);

            let totalProfit = 0;
            let totalSwap = 0;
            let totalFees = 0;

            // Sort by date
            growth.sort((a, b) => new Date(a.date) - new Date(b.date));

            growth.forEach(month => {
              const profit = month.profit || 0;
              const swap = month.swap || 0;
              const netPL = profit + swap;
              const perfFee = Math.max(0, netPL * 0.30);
              const clientNet = netPL - perfFee;

              const date = new Date(month.date);
              const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

              logger.info(
                `${monthStr}    | ` +
                `$${profit.toFixed(2).padStart(8)} | ` +
                `$${swap.toFixed(2).padStart(7)} | ` +
                `$${netPL.toFixed(2).padStart(8)} | ` +
                `$${perfFee.toFixed(2).padStart(7)} | ` +
                `$${clientNet.toFixed(2).padStart(10)}`
              );

              totalProfit += profit;
              totalSwap += swap;
              totalFees += perfFee;
            });

            logger.info(`═══════════════════════════════════════════════════════════════════════`);
            logger.info(
              `TOTAL       | ` +
              `$${totalProfit.toFixed(2).padStart(8)} | ` +
              `$${totalSwap.toFixed(2).padStart(7)} | ` +
              `$${(totalProfit + totalSwap).toFixed(2).padStart(8)} | ` +
              `$${totalFees.toFixed(2).padStart(7)} | ` +
              `$${((totalProfit + totalSwap) - totalFees).toFixed(2).padStart(10)}`
            );
          }
        } catch (err) {
          logger.debug(`Could not fetch ${period} growth data: ${err.message}`);
        }
      }

      // Get daily growth for current month
      try {
        const currentMonthGrowth = await metaStatsApi.getAccountGrowth(GOLD_ACCOUNT_ID, 'day');
        if (currentMonthGrowth && currentMonthGrowth.length > 0) {
          const currentMonth = new Date().getMonth();
          const currentYear = new Date().getFullYear();

          const thisMonthData = currentMonthGrowth.filter(day => {
            const date = new Date(day.date);
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
          });

          if (thisMonthData.length > 0) {
            const monthProfit = thisMonthData.reduce((sum, day) => sum + (day.profit || 0), 0);
            const monthSwap = thisMonthData.reduce((sum, day) => sum + (day.swap || 0), 0);
            const monthNet = monthProfit + monthSwap;
            const monthFee = Math.max(0, monthNet * 0.30);

            logger.info(`\n📆 Current Month (${new Date().toISOString().slice(0, 7)}):`);
            logger.info(`Gross P/L: $${monthProfit.toFixed(2)}`);
            logger.info(`Swap Fees: $${monthSwap.toFixed(2)}`);
            logger.info(`Net P/L: $${monthNet.toFixed(2)}`);
            logger.info(`30% Performance Fee: $${monthFee.toFixed(2)}`);
            logger.info(`Client Net: $${(monthNet - monthFee).toFixed(2)}`);
          }
        }
      } catch (err) {
        logger.debug('Could not fetch current month data');
      }

    } catch (statsError) {
      logger.warn('MetaStats data not available, trying alternative approach...');

      // Fallback to account connection for basic info
      const metatraderAccountApi = api.metatraderAccountApi;
      account = await metatraderAccountApi.getAccount(GOLD_ACCOUNT_ID);

      logger.info('\n📊 Account Information:');
      logger.info(`Name: ${account.name}`);
      logger.info(`Broker: ${account.broker}`);
      logger.info(`Currency: ${account.currency}`);
      logger.info(`Platform: ${account.platform}`);

      // Try to get connection and fetch some data
      connection = account.getRPCConnection();
      await connection.connect();
      await connection.waitSynchronized();

      const accountInfo = await connection.getAccountInformation();
      logger.info(`\n💰 Current Status:`);
      logger.info(`Balance: $${accountInfo.balance.toFixed(2)}`);
      logger.info(`Equity: $${accountInfo.equity.toFixed(2)}`);
      logger.info(`Margin: $${accountInfo.margin.toFixed(2)}`);
      logger.info(`Free Margin: $${accountInfo.freeMargin.toFixed(2)}`);

      // Note about MetaStats
      logger.info('\n⚠️ Note: For detailed historical analysis, MetaStats needs to be enabled on this account.');
      logger.info('MetaStats provides:');
      logger.info('- Complete trade history with P/L breakdown');
      logger.info('- Monthly performance metrics');
      logger.info('- Risk analysis and drawdown calculations');
      logger.info('- Swap/commission tracking');
    }

  } catch (error) {
    logger.error('Error in analysis:', error.message);

    if (error.message.includes('E_AUTH')) {
      logger.error('Authentication failed. Please check METAAPI_TOKEN');
    } else if (error.message.includes('E_ACCOUNT_NOT_FOUND')) {
      logger.error('Account not found. Please verify account ID');
    } else if (error.message.includes('E_METASTATS')) {
      logger.error('MetaStats not available for this account');
    }

  } finally {
    if (connection) {
      await connection.close();
    }
    process.exit(0);
  }
}

// Run the analysis
logger.info('Starting direct MetaAPI analysis with MetaStats...');
analyzeWithMetaStats();