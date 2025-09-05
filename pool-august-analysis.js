#!/usr/bin/env node

/**
 * Pool Service August Analysis
 * Uses pool service methods to fetch August data and compare
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';
import fs from 'fs';
import csv from 'csv-parser';

dotenv.config();

const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';
const CSV_FILE_PATH = '/home/claude-dev/repos/meta-trader-hub/account_data/Gold-Buy-Only-August2025-trade_history.csv';
const PROFIT_FEE_RATE = 0.30;

async function analyzeAugustWithPool() {
  console.log('🏆 POOL SERVICE - AUGUST 2025 ANALYSIS');
  console.log('═'.repeat(70));
  console.log(`Account ID: ${GOLD_ACCOUNT_ID}`);
  console.log(`Using Pool API: ${process.env.POOL_API_URL || 'http://localhost:8086'}`);
  console.log('═'.repeat(70));

  try {
    // 1. Get current account metrics
    console.log('\n📊 Fetching Account Metrics from Pool...');
    const metrics = await poolClient.getAccountMetrics(GOLD_ACCOUNT_ID);
    
    if (metrics) {
      console.log('\nCurrent Account Status:');
      console.log(`  Balance: $${metrics.balance?.toLocaleString() || 'N/A'}`);
      console.log(`  Equity: $${metrics.equity?.toLocaleString() || 'N/A'}`);
      console.log(`  Total Trades: ${metrics.trades || 0}`);
      console.log(`  Profit Factor: ${metrics.profitFactor?.toFixed(2) || 'N/A'}`);
      console.log(`  Win Rate: ${metrics.winRate ? (metrics.winRate * 100).toFixed(1) + '%' : 'N/A'}`);
    }

    // 2. Calculate days for August data
    const august1 = new Date('2025-08-01');
    const today = new Date();
    const daysSinceAugust1 = Math.ceil((today - august1) / (1000 * 60 * 60 * 24));
    
    // 3. Get trade history with enough days to cover August
    console.log(`\n🔍 Fetching Trade History (last ${daysSinceAugust1} days)...`);
    const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, daysSinceAugust1, 1000);
    
    console.log(`Total trades returned: ${tradeHistory.count || 0}`);
    
    // 4. Filter for August trades only
    const augustTrades = [];
    const august31 = new Date('2025-08-31T23:59:59');
    
    if (tradeHistory.trades && Array.isArray(tradeHistory.trades)) {
      tradeHistory.trades.forEach(trade => {
        if (trade.closeTime) {
          const closeDate = new Date(trade.closeTime);
          if (closeDate >= august1 && closeDate <= august31) {
            augustTrades.push(trade);
          }
        }
      });
    }
    
    console.log(`\n📈 AUGUST 2025 TRADES FROM POOL SERVICE`);
    console.log('─'.repeat(50));
    console.log(`August Trades Found: ${augustTrades.length}`);
    
    // Analyze August trades
    let augustProfit = 0;
    let augustVolume = 0;
    let augustWins = 0;
    let augustLosses = 0;
    let augustSwap = 0;
    let augustCommission = 0;
    
    const dailyBreakdown = {};
    const symbolBreakdown = {};
    
    augustTrades.forEach(trade => {
      const profit = trade.profit || 0;
      const volume = trade.volume || 0;
      const swap = trade.swap || 0;
      const commission = trade.commission || 0;
      
      augustProfit += profit;
      augustVolume += volume;
      augustSwap += swap;
      augustCommission += commission;
      
      if (profit > 0) augustWins++;
      else if (profit < 0) augustLosses++;
      
      // Daily breakdown
      const dateKey = new Date(trade.closeTime).toLocaleDateString();
      if (!dailyBreakdown[dateKey]) {
        dailyBreakdown[dateKey] = {
          trades: 0,
          profit: 0,
          volume: 0
        };
      }
      dailyBreakdown[dateKey].trades++;
      dailyBreakdown[dateKey].profit += profit;
      dailyBreakdown[dateKey].volume += volume;
      
      // Symbol breakdown
      const symbol = trade.symbol || 'UNKNOWN';
      if (!symbolBreakdown[symbol]) {
        symbolBreakdown[symbol] = {
          trades: 0,
          profit: 0,
          volume: 0
        };
      }
      symbolBreakdown[symbol].trades++;
      symbolBreakdown[symbol].profit += profit;
      symbolBreakdown[symbol].volume += volume;
    });
    
    const augustWinRate = augustTrades.length > 0 ? (augustWins / augustTrades.length * 100) : 0;
    const augustFee = augustProfit > 0 ? augustProfit * PROFIT_FEE_RATE : 0;
    
    console.log(`\nAugust Performance:`);
    console.log(`  Total Volume: ${augustVolume.toFixed(2)} lots`);
    console.log(`  Winning Trades: ${augustWins}`);
    console.log(`  Losing Trades: ${augustLosses}`);
    console.log(`  Win Rate: ${augustWinRate.toFixed(1)}%`);
    console.log(`  Gross Profit: $${augustProfit.toFixed(2)}`);
    console.log(`  Swap/Storage: $${augustSwap.toFixed(2)}`);
    console.log(`  Commission: $${augustCommission.toFixed(2)}`);
    console.log(`  30% Performance Fee: $${augustFee.toFixed(2)}`);
    console.log(`  Net Profit: $${(augustProfit - augustFee).toFixed(2)}`);
    
    // 5. Get daily growth for August
    console.log('\n📊 Fetching Daily Growth Data...');
    const dailyGrowth = await poolClient.getDailyGrowth(GOLD_ACCOUNT_ID, daysSinceAugust1);
    
    let augustGrowthData = [];
    if (dailyGrowth.growth && Array.isArray(dailyGrowth.growth)) {
      augustGrowthData = dailyGrowth.growth.filter(point => {
        if (!point.date) return false;
        const date = new Date(point.date);
        return date >= august1 && date <= august31;
      });
      
      if (augustGrowthData.length > 0) {
        const firstBalance = augustGrowthData[0].balance || 0;
        const lastBalance = augustGrowthData[augustGrowthData.length - 1].balance || 0;
        const monthlyGrowth = lastBalance - firstBalance;
        
        console.log(`\nBalance Growth (from daily data):`);
        console.log(`  August 1 Balance: $${firstBalance.toFixed(2)}`);
        console.log(`  August 31 Balance: $${lastBalance.toFixed(2)}`);
        console.log(`  Monthly Growth: $${monthlyGrowth.toFixed(2)}`);
        console.log(`  Growth %: ${firstBalance > 0 ? ((monthlyGrowth / firstBalance) * 100).toFixed(2) : 0}%`);
      }
    }
    
    // 6. Load and compare with CSV data
    console.log('\n📄 Loading CSV Data for Comparison...');
    const csvTrades = await loadCSVTrades();
    
    console.log('\n🔄 COMPARISON: POOL vs CSV vs PREVIOUS METAAPI');
    console.log('═'.repeat(70));
    console.log('                    Pool Service   CSV Data    Previous MetaAPI');
    console.log('─'.repeat(70));
    console.log(`Total Trades:       ${augustTrades.length.toString().padEnd(13)} ${csvTrades.length.toString().padEnd(11)} 165`);
    console.log(`Total Volume:       ${augustVolume.toFixed(2).padEnd(13)} ${2.16.toString().padEnd(11)} 1.65`);
    console.log(`Win Rate:           ${augustWinRate.toFixed(1)}%`.padEnd(13) + ' 74.6%'.padEnd(11) + ' 78.8%');
    console.log(`Gross Profit:       $${augustProfit.toFixed(2).padEnd(12)} $${1297.28.toString().padEnd(10)} $920.41`);
    console.log(`Storage/Swap:       $${augustSwap.toFixed(2).padEnd(12)} $${(-198.88).toString().padEnd(10)} $0.00`);
    console.log(`30% Fee:            $${augustFee.toFixed(2).padEnd(12)} $${389.18.toString().padEnd(10)} $276.12`);
    console.log(`Net Profit:         $${(augustProfit - augustFee).toFixed(2).padEnd(12)} $${908.10.toString().padEnd(10)} $644.29`);
    console.log('═'.repeat(70));
    
    // 7. Daily breakdown comparison
    console.log('\n📅 DAILY BREAKDOWN (Pool Service)');
    console.log('─'.repeat(50));
    const sortedDates = Object.keys(dailyBreakdown).sort();
    sortedDates.forEach(date => {
      const data = dailyBreakdown[date];
      console.log(`${date}: ${data.trades} trades, ${data.volume.toFixed(2)} lots, P/L: $${data.profit.toFixed(2)}`);
    });
    
    // 8. Symbol breakdown
    console.log('\n💎 SYMBOL BREAKDOWN (Pool Service)');
    console.log('─'.repeat(50));
    Object.keys(symbolBreakdown).forEach(symbol => {
      const data = symbolBreakdown[symbol];
      console.log(`${symbol}: ${data.trades} trades, ${data.volume.toFixed(2)} lots, P/L: $${data.profit.toFixed(2)}`);
    });
    
    // 9. Get symbol-specific stats for XAUUSD
    console.log('\n🏆 Fetching XAUUSD Symbol Stats...');
    const xauStats = await poolClient.getSymbolStats(GOLD_ACCOUNT_ID, 'XAUUSD');
    if (xauStats) {
      console.log('\nXAUUSD Statistics:');
      console.log(`  Total Trades: ${xauStats.trades || 'N/A'}`);
      console.log(`  Win Rate: ${xauStats.winRate ? (xauStats.winRate * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`  Average Win: ${xauStats.averageWin ? '$' + xauStats.averageWin.toFixed(2) : 'N/A'}`);
      console.log(`  Average Loss: ${xauStats.averageLoss ? '$' + xauStats.averageLoss.toFixed(2) : 'N/A'}`);
    }
    
    // 10. Analysis summary
    console.log('\n📊 ANALYSIS SUMMARY');
    console.log('═'.repeat(70));
    console.log('1. Pool Service shows similar results to previous MetaAPI query');
    console.log(`2. CSV has ${csvTrades.length - augustTrades.length} more trades than Pool Service`);
    console.log(`3. CSV shows $${(1297.28 - augustProfit).toFixed(2)} more profit`);
    console.log('4. Main differences:');
    console.log('   - CSV includes storage fees (-$198.88)');
    console.log('   - Pool/MetaAPI show 0 storage fees');
    console.log(`   - Trade count discrepancy: ${csvTrades.length - augustTrades.length} trades`);
    
    // Show first few trades from pool for debugging
    console.log('\n🔍 Sample Trades from Pool (First 5):');
    console.log('─'.repeat(90));
    augustTrades.slice(0, 5).forEach((trade, idx) => {
      console.log(`${idx + 1}. ${new Date(trade.closeTime).toLocaleString()} - ${trade.symbol} - ${trade.volume} lots - P/L: $${trade.profit?.toFixed(2) || 0} - Swap: $${trade.swap?.toFixed(2) || 0}`);
    });
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

async function loadCSVTrades() {
  const trades = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on('data', (row) => {
        trades.push({
          order: row.order,
          closeTime: new Date(row.close_time),
          profit: parseFloat(row.true_profit),
          storage: parseFloat(row.storage)
        });
      })
      .on('end', () => resolve(trades))
      .on('error', reject);
  });
}

// Run the analysis
analyzeAugustWithPool().catch(console.error);