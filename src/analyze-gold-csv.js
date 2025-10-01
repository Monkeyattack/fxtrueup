/**
 * Analyze GoldBuyOnly Account from CSV Data
 * Calculate monthly P&L with storage fees and 30% performance fee
 */

import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';
import { logger } from './utils/logger.js';

async function analyzeGoldBuyOnlyCSV() {
  try {
    // Read the CSV file
    const csvPath = '/home/claude-dev/repos/meta-trader-hub/account_data/Gold-Buy-Only-August2025-trade_history.csv';
    const fileContent = await fs.readFile(csvPath, 'utf8');

    // Parse CSV
    const trades = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    logger.info('🏆 GoldBuyOnly Account Performance Analysis');
    logger.info('══════════════════════════════════════════════\n');

    // Process trades by month
    const monthlyData = {};
    let totalGrossProfit = 0;
    let totalStorage = 0;

    trades.forEach(trade => {
      const closeTime = new Date(trade.close_time);
      const monthKey = `${closeTime.getFullYear()}-${String(closeTime.getMonth() + 1).padStart(2, '0')}`;

      const profit = parseFloat(trade.true_profit) || 0;
      const storage = parseFloat(trade.storage) || 0;
      const commission = parseFloat(trade.commission) || 0;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          trades: 0,
          grossProfit: 0,
          storageFeesTotal: 0,
          commissionsTotal: 0,
          volume: 0
        };
      }

      monthlyData[monthKey].trades++;
      monthlyData[monthKey].grossProfit += profit;
      monthlyData[monthKey].storageFeesTotal += storage;
      monthlyData[monthKey].commissionsTotal += commission;
      monthlyData[monthKey].volume += parseFloat(trade.true_volume) || 0;

      totalGrossProfit += profit;
      totalStorage += storage;
    });

    // Display overall summary first
    const totalNetProfit = totalGrossProfit + totalStorage; // Storage is negative
    const totalPerformanceFee = Math.max(0, totalNetProfit * 0.30);
    const clientNetTotal = totalNetProfit - totalPerformanceFee;

    logger.info('💰 OVERALL PERFORMANCE SUMMARY:');
    logger.info(`Total Trades: ${trades.length}`);
    logger.info(`Gross Profit/Loss: $${totalGrossProfit.toFixed(2)}`);
    logger.info(`Total Storage Fees: $${totalStorage.toFixed(2)}`);
    logger.info(`Net Profit (after storage): $${totalNetProfit.toFixed(2)}`);
    logger.info(`30% Performance Fee: $${totalPerformanceFee.toFixed(2)}`);
    logger.info(`Client Net (70%): $${clientNetTotal.toFixed(2)}\n`);

    // Display monthly breakdown
    logger.info('📅 MONTHLY BREAKDOWN:');
    logger.info('════════════════════════════════════════════════════════════════════════════════════════');
    logger.info('Month     | Trades | Gross P/L    | Storage Fees | Net P/L      | 30% Fee     | Client Net');
    logger.info('════════════════════════════════════════════════════════════════════════════════════════');

    const sortedMonths = Object.keys(monthlyData).sort();
    let cumulativeNet = 0;

    sortedMonths.forEach(month => {
      const data = monthlyData[month];
      const monthlyNet = data.grossProfit + data.storageFeesTotal;
      const monthlyFee = Math.max(0, monthlyNet * 0.30);
      const clientNet = monthlyNet - monthlyFee;
      cumulativeNet += monthlyNet;

      logger.info(
        `${month}  | ${String(data.trades).padStart(6)} | ` +
        `$${data.grossProfit.toFixed(2).padStart(11)} | ` +
        `$${data.storageFeesTotal.toFixed(2).padStart(11)} | ` +
        `$${monthlyNet.toFixed(2).padStart(11)} | ` +
        `$${monthlyFee.toFixed(2).padStart(10)} | ` +
        `$${clientNet.toFixed(2).padStart(10)}`
      );
    });

    logger.info('════════════════════════════════════════════════════════════════════════════════════════');
    logger.info(
      `TOTAL     | ${String(trades.length).padStart(6)} | ` +
      `$${totalGrossProfit.toFixed(2).padStart(11)} | ` +
      `$${totalStorage.toFixed(2).padStart(11)} | ` +
      `$${totalNetProfit.toFixed(2).padStart(11)} | ` +
      `$${totalPerformanceFee.toFixed(2).padStart(10)} | ` +
      `$${clientNetTotal.toFixed(2).padStart(10)}\n`
    );

    // Additional statistics
    logger.info('📊 PERFORMANCE FEE DETAILS:');
    logger.info('════════════════════════════════════════════');

    sortedMonths.forEach(month => {
      const data = monthlyData[month];
      const monthlyNet = data.grossProfit + data.storageFeesTotal;
      const monthlyFee = Math.max(0, monthlyNet * 0.30);

      if (monthlyNet > 0) {
        logger.info(`${month}: Net Profit $${monthlyNet.toFixed(2)} → 30% Fee = $${monthlyFee.toFixed(2)}`);
      } else {
        logger.info(`${month}: Net Loss $${monthlyNet.toFixed(2)} → No fee (high-water mark)`);
      }
    });

  } catch (error) {
    logger.error('Error analyzing CSV data:', error);
  }
}

// Run analysis
analyzeGoldBuyOnlyCSV();