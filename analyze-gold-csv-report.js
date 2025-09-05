#!/usr/bin/env node

/**
 * Analyze Gold Buy Only Service CSV Trade History
 * Calculate monthly profits with 30% fee breakdown
 */

import fs from 'fs';
import csv from 'csv-parser';

const CSV_FILE_PATH = '/home/claude-dev/repos/meta-trader-hub/account_data/Gold-Buy-Only-August2025-trade_history.csv';
const PROFIT_FEE_RATE = 0.30;

console.log('🏆 GOLD BUY ONLY SERVICE - CSV TRADE HISTORY ANALYSIS');
console.log('═'.repeat(70));
console.log(`CSV File: Gold-Buy-Only-August2025-trade_history.csv`);
console.log(`Account Login: 3052705`);
console.log(`Profit Fee Rate: ${PROFIT_FEE_RATE * 100}%`);
console.log('═'.repeat(70));

// Read and analyze CSV data
const trades = [];
let totalProfit = 0;
let totalCommission = 0;
let totalStorage = 0;
let winningTrades = 0;
let losingTrades = 0;
let totalVolume = 0;

fs.createReadStream(CSV_FILE_PATH)
  .pipe(csv())
  .on('data', (row) => {
    const trade = {
      order: row.order,
      closeTime: new Date(row.close_time),
      cmd: row.cmd,
      symbol: row.symbol,
      volume: parseFloat(row.true_volume),
      openPrice: parseFloat(row.open_price),
      closePrice: parseFloat(row.close_price),
      storage: parseFloat(row.storage),
      commission: parseFloat(row.commission),
      profit: parseFloat(row.true_profit)
    };
    
    trades.push(trade);
    totalProfit += trade.profit;
    totalCommission += trade.commission;
    totalStorage += trade.storage;
    totalVolume += trade.volume;
    
    if (trade.profit > 0) winningTrades++;
    else if (trade.profit < 0) losingTrades++;
  })
  .on('end', () => {
    console.log('\n📊 ACCOUNT SUMMARY');
    console.log('─'.repeat(50));
    console.log(`Total Trades: ${trades.length}`);
    console.log(`Total Volume: ${totalVolume.toFixed(2)} lots`);
    console.log(`Winning Trades: ${winningTrades}`);
    console.log(`Losing Trades: ${losingTrades}`);
    console.log(`Win Rate: ${((winningTrades / trades.length) * 100).toFixed(1)}%`);
    console.log(`Total Storage Fees: $${totalStorage.toFixed(2)}`);
    console.log(`Total Commission: $${totalCommission.toFixed(2)}`);
    
    // Calculate monthly breakdown
    const monthlyStats = {};
    
    trades.forEach(trade => {
      const monthKey = `${trade.closeTime.getFullYear()}-${String(trade.closeTime.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = {
          trades: 0,
          volume: 0,
          profit: 0,
          storage: 0,
          commission: 0,
          winning: 0,
          losing: 0
        };
      }
      
      monthlyStats[monthKey].trades++;
      monthlyStats[monthKey].volume += trade.volume;
      monthlyStats[monthKey].profit += trade.profit;
      monthlyStats[monthKey].storage += trade.storage;
      monthlyStats[monthKey].commission += trade.commission;
      
      if (trade.profit > 0) monthlyStats[monthKey].winning++;
      else if (trade.profit < 0) monthlyStats[monthKey].losing++;
    });
    
    console.log('\n💰 MONTHLY PROFIT BREAKDOWN');
    console.log('═'.repeat(90));
    console.log('Month\t\tTrades\tVolume\tGross P/L\tStorage\t\t30% Fee\t\tNet Profit');
    console.log('─'.repeat(90));
    
    let totalMonthlyProfit = 0;
    let totalFees = 0;
    
    Object.keys(monthlyStats).sort().forEach(monthKey => {
      const stats = monthlyStats[monthKey];
      const fee = stats.profit > 0 ? stats.profit * PROFIT_FEE_RATE : 0;
      const netProfit = stats.profit - fee;
      
      totalMonthlyProfit += stats.profit;
      totalFees += fee;
      
      const monthName = new Date(monthKey + '-01').toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short' 
      });
      
      console.log(
        `${monthName.padEnd(15)}\t${stats.trades}\t${stats.volume.toFixed(2)}\t$${stats.profit.toFixed(2).padStart(10)}\t$${stats.storage.toFixed(2).padStart(8)}\t$${fee.toFixed(2).padStart(8)}\t$${netProfit.toFixed(2).padStart(10)}`
      );
    });
    
    console.log('═'.repeat(90));
    console.log(`TOTAL\t\t${trades.length}\t${totalVolume.toFixed(2)}\t$${totalProfit.toFixed(2).padStart(10)}\t$${totalStorage.toFixed(2).padStart(8)}\t$${totalFees.toFixed(2).padStart(8)}\t$${(totalProfit - totalFees).toFixed(2).padStart(10)}`);
    
    console.log('\n📈 PROFIT ANALYSIS');
    console.log('─'.repeat(50));
    console.log(`Gross Profit (excluding storage): $${totalProfit.toFixed(2)}`);
    console.log(`Net Profit after storage: $${(totalProfit + totalStorage).toFixed(2)}`);
    console.log(`30% Performance Fee: $${totalFees.toFixed(2)}`);
    console.log(`Final Net Profit: $${(totalProfit - totalFees).toFixed(2)}`);
    
    // Price range analysis
    const openPrices = trades.map(t => t.openPrice);
    const minPrice = Math.min(...openPrices);
    const maxPrice = Math.max(...openPrices);
    const avgPrice = openPrices.reduce((a, b) => a + b, 0) / openPrices.length;
    
    console.log('\n💎 GOLD TRADING METRICS');
    console.log('─'.repeat(50));
    console.log(`Entry Price Range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`);
    console.log(`Average Entry Price: $${avgPrice.toFixed(2)}`);
    console.log(`Average Trade Size: ${(totalVolume / trades.length).toFixed(3)} lots`);
    console.log(`Average Profit per Trade: $${(totalProfit / trades.length).toFixed(2)}`);
    
    // Time analysis
    const tradingDates = new Set(trades.map(t => t.closeTime.toDateString()));
    console.log(`Trading Days: ${tradingDates.size}`);
    console.log(`Trades per Day: ${(trades.length / tradingDates.size).toFixed(1)}`);
    
    // Trading session breakdown
    const dateBreakdown = {};
    trades.forEach(trade => {
      const dateKey = trade.closeTime.toLocaleDateString();
      if (!dateBreakdown[dateKey]) {
        dateBreakdown[dateKey] = {
          trades: 0,
          profit: 0
        };
      }
      dateBreakdown[dateKey].trades++;
      dateBreakdown[dateKey].profit += trade.profit;
    });
    
    console.log('\n📅 DAILY BREAKDOWN');
    console.log('─'.repeat(50));
    Object.keys(dateBreakdown).sort().forEach(date => {
      const data = dateBreakdown[date];
      console.log(`${date}: ${data.trades} trades, P/L: $${data.profit.toFixed(2)}`);
    });
  })
  .on('error', (err) => {
    console.error('Error reading CSV file:', err);
  });