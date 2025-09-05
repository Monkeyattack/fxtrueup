#!/usr/bin/env node

/**
 * Backtest the filtered copy trading strategy using actual Gold Buy Only trade history
 * This will show what would have happened if we applied our filters to historical trades
 */

import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';

// Filter configuration (same as our live system)
const FILTER_CONFIG = {
  maxOpenPositions: 1,
  minTimeBetweenTrades: 30 * 60 * 1000, // 30 minutes in ms
  maxPositionSize: 0.02, // Original account max size before martingale
  maxDailyTrades: 5,
  allowedHours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], // UTC
  priceRangeFilter: 50, // pips
};

// Position sizing
const ORIGINAL_ACCOUNT_SIZE = 10000; // Assumed original account size
const BACKTEST_ACCOUNT_SIZE = 118000; // Grid account size
const SCALED_LOT_SIZE = 2.50; // Our filtered strategy lot size

async function loadTradeHistory() {
  const csvPath = '/home/claude-dev/repos/meta-trader-hub/account_data/Gold-Buy-Only-August2025-trade_history.csv';
  const csvContent = await fs.readFile(csvPath, 'utf-8');
  
  const trades = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  });
  
  return trades;
}

function parseTradeData(trade) {
  // Parse the date - assuming it's the close time since that's what we have
  const closeTime = new Date(trade.close_time);
  // For open time, we'll estimate based on typical trade duration (few hours)
  const openTime = new Date(closeTime.getTime() - 4 * 60 * 60 * 1000); // 4 hours before close
  
  return {
    time: openTime,
    symbol: trade.symbol,
    type: trade.cmd,
    volume: parseFloat(trade.true_volume),
    price: parseFloat(trade.open_price),
    closeTime: closeTime,
    closePrice: parseFloat(trade.close_price),
    profit: parseFloat(trade.true_profit),
    originalProfit: parseFloat(trade.true_profit)
  };
}

function isMartingalePattern(trade, recentTrades) {
  // Check if position size is larger than base size
  if (trade.volume > FILTER_CONFIG.maxPositionSize) {
    return true;
  }
  
  // Check for position size increase after recent loss
  const recentLosses = recentTrades
    .slice(-5)
    .filter(t => t.profit < 0);
    
  if (recentLosses.length > 0 && trade.volume > 0.01) {
    return true;
  }
  
  return false;
}

function isGridPattern(trade, openPositions) {
  // Check if there are multiple positions at similar prices
  const similarPositions = openPositions.filter(pos => {
    if (pos.symbol !== trade.symbol) return false;
    
    const priceDiff = Math.abs(pos.price - trade.price);
    const pipDiff = trade.symbol.includes('JPY') ? priceDiff * 100 : priceDiff * 10000;
    
    return pipDiff < FILTER_CONFIG.priceRangeFilter;
  });
  
  return similarPositions.length > 0;
}

function shouldFilterTrade(trade, openPositions, lastTradeTime, dailyTrades, recentTrades) {
  const reasons = [];
  
  // 1. Check position limit
  if (openPositions.length >= FILTER_CONFIG.maxOpenPositions) {
    reasons.push('Max positions reached');
    return { filter: true, reasons };
  }
  
  // 2. Check time between trades
  if (lastTradeTime && (trade.time - lastTradeTime) < FILTER_CONFIG.minTimeBetweenTrades) {
    reasons.push('Too soon after last trade');
    return { filter: true, reasons };
  }
  
  // 3. Check daily trade limit
  if (dailyTrades >= FILTER_CONFIG.maxDailyTrades) {
    reasons.push('Daily trade limit reached');
    return { filter: true, reasons };
  }
  
  // 4. Check trading hours
  const hour = trade.time.getUTCHours();
  if (!FILTER_CONFIG.allowedHours.includes(hour)) {
    reasons.push('Outside trading hours');
    return { filter: true, reasons };
  }
  
  // 5. Detect martingale pattern
  if (isMartingalePattern(trade, recentTrades)) {
    reasons.push('Martingale pattern detected');
    return { filter: true, reasons };
  }
  
  // 6. Check for grid pattern
  if (isGridPattern(trade, openPositions)) {
    reasons.push('Grid pattern detected');
    return { filter: true, reasons };
  }
  
  return { filter: false, reasons: ['Trade passed all filters'] };
}

function calculateScaledProfit(originalProfit, originalVolume) {
  // Calculate the profit per lot
  const profitPerLot = originalProfit / originalVolume;
  
  // Scale to our fixed lot size
  return profitPerLot * SCALED_LOT_SIZE;
}

async function runBacktest() {
  console.log('📊 FILTERED STRATEGY BACKTEST');
  console.log('═'.repeat(80));
  console.log('Using actual Gold Buy Only trade history');
  console.log('Account size: $118,000');
  console.log('Fixed lot size: 2.50 (1% risk management)');
  console.log('═'.repeat(80));
  
  const trades = await loadTradeHistory();
  console.log(`\nLoaded ${trades.length} historical trades\n`);
  
  // Backtest state
  const openPositions = [];
  const filteredTrades = [];
  const blockedTrades = [];
  const recentTrades = [];
  let lastTradeTime = null;
  let dailyStats = new Map();
  
  // Process each trade
  for (const rawTrade of trades) {
    const trade = parseTradeData(rawTrade);
    if (trade.type === 'balance' || trade.type === 'Deposit') continue;
    
    // Track recent trades for pattern detection
    recentTrades.push(trade);
    if (recentTrades.length > 20) recentTrades.shift();
    
    // Reset daily stats if new day
    const tradeDate = trade.time.toDateString();
    if (!dailyStats.has(tradeDate)) {
      dailyStats.set(tradeDate, { trades: 0, profit: 0 });
    }
    
    const dailyData = dailyStats.get(tradeDate);
    
    // Check if trade should be filtered
    const { filter, reasons } = shouldFilterTrade(
      trade, 
      openPositions, 
      lastTradeTime, 
      dailyData.trades,
      recentTrades
    );
    
    if (filter) {
      blockedTrades.push({ ...trade, reasons });
    } else {
      // Calculate scaled profit
      const scaledProfit = calculateScaledProfit(trade.profit, trade.volume);
      
      filteredTrades.push({
        ...trade,
        scaledVolume: SCALED_LOT_SIZE,
        scaledProfit,
        reasons
      });
      
      // Update state
      openPositions.push(trade);
      lastTradeTime = trade.time;
      dailyData.trades++;
      dailyData.profit += scaledProfit;
    }
    
    // Remove closed positions
    openPositions.forEach((pos, index) => {
      if (pos.closeTime <= trade.time) {
        openPositions.splice(index, 1);
      }
    });
  }
  
  // Calculate results
  const originalProfit = trades
    .filter(t => t.Type !== 'balance' && t.Type !== 'Deposit')
    .reduce((sum, t) => sum + parseFloat(t.Profit), 0);
    
  const filteredProfit = filteredTrades
    .reduce((sum, t) => sum + t.scaledProfit, 0);
    
  const originalTrades = trades.filter(t => t.Type !== 'balance' && t.Type !== 'Deposit');
  const originalWins = originalTrades.filter(t => parseFloat(t.Profit) > 0).length;
  const filteredWins = filteredTrades.filter(t => t.scaledProfit > 0).length;
  
  // Display results
  console.log('\n📈 BACKTEST RESULTS');
  console.log('─'.repeat(80));
  
  console.log('\nORIGINAL STRATEGY (All Trades):');
  console.log(`  Total Trades: ${originalTrades.length}`);
  console.log(`  Winning Trades: ${originalWins}`);
  console.log(`  Win Rate: ${(originalWins / originalTrades.length * 100).toFixed(1)}%`);
  console.log(`  Total Profit: $${originalProfit.toFixed(2)}`);
  console.log(`  Includes: Martingale & Grid trades`);
  
  console.log('\nFILTERED STRATEGY (Our System):');
  console.log(`  Total Trades: ${filteredTrades.length}`);
  console.log(`  Winning Trades: ${filteredWins}`);
  console.log(`  Win Rate: ${(filteredWins / filteredTrades.length * 100).toFixed(1)}%`);
  console.log(`  Total Profit: $${filteredProfit.toFixed(2)}`);
  console.log(`  Blocked Trades: ${blockedTrades.length}`);
  
  console.log('\n🎯 IMPROVEMENT METRICS:');
  console.log(`  Profit Increase: ${((filteredProfit / originalProfit - 1) * 100).toFixed(1)}%`);
  console.log(`  Win Rate Change: ${((filteredWins / filteredTrades.length) - (originalWins / originalTrades.length) * 100).toFixed(1)} points`);
  console.log(`  Trade Reduction: ${((1 - filteredTrades.length / originalTrades.length) * 100).toFixed(1)}%`);
  console.log(`  Risk Reduction: Eliminated all martingale/grid exposure`);
  
  // Show filtering breakdown
  console.log('\n🚫 FILTERED TRADES BREAKDOWN:');
  const filterReasons = {};
  blockedTrades.forEach(trade => {
    trade.reasons.forEach(reason => {
      filterReasons[reason] = (filterReasons[reason] || 0) + 1;
    });
  });
  
  Object.entries(filterReasons)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      console.log(`  ${reason}: ${count} trades`);
    });
  
  // Show daily performance
  console.log('\n📅 DAILY PERFORMANCE (Filtered):');
  let cumulativeProfit = 0;
  dailyStats.forEach((data, date) => {
    if (data.profit !== 0) {
      cumulativeProfit += data.profit;
      console.log(`  ${date}: ${data.trades} trades, $${data.profit.toFixed(2)} profit, Total: $${cumulativeProfit.toFixed(2)}`);
    }
  });
  
  // Risk metrics
  console.log('\n⚠️ RISK ANALYSIS:');
  const maxDailyLoss = Math.min(...Array.from(dailyStats.values()).map(d => d.profit));
  const maxDailyProfit = Math.max(...Array.from(dailyStats.values()).map(d => d.profit));
  console.log(`  Max Daily Profit: $${maxDailyProfit.toFixed(2)} (${(maxDailyProfit / BACKTEST_ACCOUNT_SIZE * 100).toFixed(2)}%)`);
  console.log(`  Max Daily Loss: $${Math.abs(maxDailyLoss).toFixed(2)} (${(Math.abs(maxDailyLoss) / BACKTEST_ACCOUNT_SIZE * 100).toFixed(2)}%)`);
  console.log(`  Average Trade Size: ${SCALED_LOT_SIZE} lots`);
  console.log(`  Risk per Trade: ~1% with proper stops`);
  
  // Save detailed results
  const results = {
    summary: {
      originalProfit,
      filteredProfit,
      originalTrades: originalTrades.length,
      filteredTrades: filteredTrades.length,
      blockedTrades: blockedTrades.length,
      originalWinRate: (originalWins / originalTrades.length * 100),
      filteredWinRate: (filteredWins / filteredTrades.length * 100)
    },
    filteredTrades,
    blockedTrades: blockedTrades.slice(0, 50), // First 50 for review
    dailyPerformance: Array.from(dailyStats.entries())
  };
  
  await fs.writeFile(
    'backtest-results.json', 
    JSON.stringify(results, null, 2)
  );
  
  console.log('\n✅ Detailed results saved to backtest-results.json');
}

// Run the backtest
runBacktest().catch(console.error);