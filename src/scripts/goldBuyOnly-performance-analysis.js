import MetaApiService from '../services/metaapi.js';
import { GOLD_ACCOUNT_ID } from '../config/accounts.js';
import { logger } from '../utils/logger.js';

async function analyzeAccountPerformance() {
  try {
    // Define time range for analysis (last 12 months)
    const endTime = new Date();
    const startTime = new Date();
    startTime.setFullYear(endTime.getFullYear() - 1);

    // Retrieve account metrics
    const { accountInfo, deals, metrics } = await MetaApiService.getAccountMetrics(
      GOLD_ACCOUNT_ID,
      startTime.getTime(),
      endTime.getTime()
    );

    // Group trades by month
    const monthlyPerformance = {};
    deals.forEach(deal => {
      const tradeDate = new Date(deal.time);
      const monthKey = `${tradeDate.getFullYear()}-${String(tradeDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyPerformance[monthKey]) {
        monthlyPerformance[monthKey] = {
          trades: [],
          grossProfit: 0,
          swapFees: 0,
          netProfit: 0,
          performanceFee: 0
        };
      }

      const profit = deal.profit || 0;
      const swap = deal.swap || 0;
      const commission = deal.commission || 0;
      const netTradePL = profit + swap + commission;

      monthlyPerformance[monthKey].trades.push(deal);
      monthlyPerformance[monthKey].grossProfit += profit;
      monthlyPerformance[monthKey].swapFees += Math.abs(swap);
      monthlyPerformance[monthKey].netProfit += netTradePL;
    });

    // Calculate performance fees and format results
    const performanceReport = Object.entries(monthlyPerformance).map(([month, data]) => {
      const performanceFee = data.netProfit > 0 ? data.netProfit * 0.3 : 0;

      return {
        month,
        totalTrades: data.trades.length,
        grossProfit: parseFloat(data.grossProfit.toFixed(2)),
        swapFees: parseFloat(data.swapFees.toFixed(2)),
        netProfit: parseFloat(data.netProfit.toFixed(2)),
        performanceFee: parseFloat(performanceFee.toFixed(2))
      };
    });

    // Overall summary
    const overallSummary = {
      totalTrades: deals.length,
      totalGrossProfit: parseFloat(metrics.profit.toFixed(2)),
      totalSwapFees: parseFloat(performanceReport.reduce((sum, month) => sum + month.swapFees, 0).toFixed(2)),
      totalNetProfit: parseFloat(performanceReport.reduce((sum, month) => sum + month.netProfit, 0).toFixed(2)),
      totalPerformanceFee: parseFloat(performanceReport.reduce((sum, month) => sum + month.performanceFee, 0).toFixed(2)),
      winRate: metrics.winRate ? parseFloat(metrics.winRate.toFixed(2)) : 0
    };

    // Log report
    logger.info('Gold Buy Only Account Performance Analysis');
    logger.info('Monthly Performance:', performanceReport);
    logger.info('Overall Summary:', overallSummary);

    return {
      monthlyPerformance: performanceReport,
      overallSummary
    };
  } catch (error) {
    logger.error('Performance analysis failed:', error);
    throw error;
  }
}

// Export for potential module usage
export default analyzeAccountPerformance;

// If run directly, execute the analysis
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeAccountPerformance()
    .then(console.log)
    .catch(console.error);
}