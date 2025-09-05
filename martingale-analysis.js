#!/usr/bin/env node

/**
 * Martingale Analysis - Gold Buy Only Service
 * Analyzes profitability with and without martingale/grid elements
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';
import fs from 'fs';
import csv from 'csv-parser';

dotenv.config();

const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';
const CSV_FILE_PATH = '/home/claude-dev/repos/meta-trader-hub/account_data/Gold-Buy-Only-August2025-trade_history.csv';

async function analyzeMartingaleImpact() {
  console.log('🎰 MARTINGALE/GRID IMPACT ANALYSIS');
  console.log('═'.repeat(80));
  console.log('Analyzing profitability with and without martingale/grid elements...');
  console.log('═'.repeat(80));

  try {
    // Load CSV data for detailed analysis
    const csvTrades = await loadCSVTrades();
    
    // Identify martingale/grid sequences
    const sequences = identifyMartingaleSequences(csvTrades);
    
    console.log('\n🔍 MARTINGALE/GRID PATTERN DETECTION');
    console.log('─'.repeat(60));
    console.log(`Total Trades: ${csvTrades.length}`);
    console.log(`Martingale Sequences Found: ${sequences.length}`);
    console.log(`Trades in Martingale Sequences: ${sequences.reduce((sum, seq) => sum + seq.trades.length, 0)}`);
    
    // Separate trades
    const martingaleTrades = [];
    const nonMartingaleTrades = [];
    const martingaleTradeIds = new Set();
    
    sequences.forEach(seq => {
      seq.trades.forEach(trade => {
        martingaleTrades.push(trade);
        martingaleTradeIds.add(trade.order);
      });
    });
    
    csvTrades.forEach(trade => {
      if (!martingaleTradeIds.has(trade.order)) {
        nonMartingaleTrades.push(trade);
      }
    });
    
    console.log(`Non-Martingale Trades: ${nonMartingaleTrades.length}`);
    
    // Analyze each group
    console.log('\n📊 PERFORMANCE COMPARISON');
    console.log('═'.repeat(80));
    
    // 1. Full Strategy (All Trades)
    const fullStats = calculateStats(csvTrades, 'FULL STRATEGY (WITH MARTINGALE)');
    displayStats(fullStats);
    
    // 2. Martingale Trades Only
    const martingaleStats = calculateStats(martingaleTrades, 'MARTINGALE/GRID TRADES ONLY');
    displayStats(martingaleStats);
    
    // 3. Non-Martingale Trades Only
    const nonMartingaleStats = calculateStats(nonMartingaleTrades, 'NON-MARTINGALE TRADES ONLY');
    displayStats(nonMartingaleStats);
    
    // Show martingale sequences in detail
    console.log('\n🎯 MARTINGALE SEQUENCE DETAILS');
    console.log('─'.repeat(80));
    console.log('Showing first 5 martingale sequences:');
    
    sequences.slice(0, 5).forEach((seq, idx) => {
      console.log(`\nSequence ${idx + 1}:`);
      console.log(`  Start Time: ${seq.startTime.toLocaleString()}`);
      console.log(`  End Time: ${seq.endTime.toLocaleString()}`);
      console.log(`  Duration: ${seq.duration.toFixed(1)} hours`);
      console.log(`  Trades: ${seq.trades.length}`);
      console.log(`  Total Volume: ${seq.totalVolume.toFixed(2)} lots`);
      console.log(`  Price Range: $${seq.minPrice.toFixed(2)} - $${seq.maxPrice.toFixed(2)}`);
      console.log(`  Sequence P/L: $${seq.totalProfit.toFixed(2)}`);
      console.log(`  Recovery: ${seq.recovered ? '✅ Yes' : '❌ No'}`);
    });
    
    // Key findings
    console.log('\n💡 KEY FINDINGS');
    console.log('═'.repeat(80));
    
    const martingaleProfitPercent = (martingaleStats.totalProfit / fullStats.totalProfit * 100);
    const nonMartingaleProfitPercent = (nonMartingaleStats.totalProfit / fullStats.totalProfit * 100);
    
    console.log(`\n1. PROFIT CONTRIBUTION:`);
    console.log(`   • Martingale trades: $${martingaleStats.totalProfit.toFixed(2)} (${martingaleProfitPercent.toFixed(1)}% of total)`);
    console.log(`   • Non-martingale trades: $${nonMartingaleStats.totalProfit.toFixed(2)} (${nonMartingaleProfitPercent.toFixed(1)}% of total)`);
    
    console.log(`\n2. RISK ANALYSIS:`);
    console.log(`   • Largest martingale loss: $${martingaleStats.largestLoss.toFixed(2)}`);
    console.log(`   • Largest non-martingale loss: $${nonMartingaleStats.largestLoss.toFixed(2)}`);
    console.log(`   • Martingale risk multiplier: ${(Math.abs(martingaleStats.largestLoss) / Math.abs(nonMartingaleStats.largestLoss)).toFixed(1)}x`);
    
    console.log(`\n3. EFFICIENCY:`);
    console.log(`   • Martingale avg profit per trade: $${martingaleStats.avgProfit.toFixed(2)}`);
    console.log(`   • Non-martingale avg profit per trade: $${nonMartingaleStats.avgProfit.toFixed(2)}`);
    console.log(`   • Martingale win rate: ${martingaleStats.winRate.toFixed(1)}%`);
    console.log(`   • Non-martingale win rate: ${nonMartingaleStats.winRate.toFixed(1)}%`);
    
    // Final verdict
    console.log('\n🎯 VERDICT: WOULD IT BE PROFITABLE WITHOUT MARTINGALE?');
    console.log('═'.repeat(80));
    
    if (nonMartingaleStats.totalProfit > 0) {
      const monthlyReturn = nonMartingaleStats.totalProfit / 5000 * 100 / 3; // 3 months
      console.log(`✅ YES - The strategy would still be profitable without martingale!`);
      console.log(`\nWithout martingale:`);
      console.log(`  • Total Profit: $${nonMartingaleStats.totalProfit.toFixed(2)}`);
      console.log(`  • Return: ${(nonMartingaleStats.totalProfit / 5000 * 100).toFixed(2)}%`);
      console.log(`  • Monthly Average: ${monthlyReturn.toFixed(2)}%`);
      console.log(`  • Win Rate: ${nonMartingaleStats.winRate.toFixed(1)}%`);
      console.log(`  • Profit Factor: ${nonMartingaleStats.profitFactor.toFixed(2)}`);
      
      console.log(`\nHowever:`);
      console.log(`  • Profit would be ${((1 - nonMartingaleStats.totalProfit / fullStats.totalProfit) * 100).toFixed(1)}% lower`);
      console.log(`  • From $${fullStats.totalProfit.toFixed(2)} to $${nonMartingaleStats.totalProfit.toFixed(2)}`);
    } else {
      console.log(`❌ NO - The strategy would NOT be profitable without martingale!`);
      console.log(`\nWithout martingale:`);
      console.log(`  • Total Loss: $${nonMartingaleStats.totalProfit.toFixed(2)}`);
      console.log(`  • The martingale recoveries are essential for profitability`);
    }
    
    // Risk comparison
    console.log('\n⚠️  RISK COMPARISON');
    console.log('─'.repeat(60));
    console.log('With Martingale:');
    console.log(`  • Max position size: ${fullStats.maxVolume.toFixed(2)} lots`);
    console.log(`  • Largest drawdown in sequence: $${Math.abs(martingaleStats.largestLoss).toFixed(2)}`);
    console.log(`  • Risk of account blow-up: HIGH`);
    
    console.log('\nWithout Martingale:');
    console.log(`  • Max position size: ${nonMartingaleStats.maxVolume.toFixed(2)} lots`);
    console.log(`  • Largest single loss: $${Math.abs(nonMartingaleStats.largestLoss).toFixed(2)}`);
    console.log(`  • Risk of account blow-up: LOW`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

function identifyMartingaleSequences(trades) {
  const sequences = [];
  let currentSequence = null;
  const priceThreshold = 50; // $50 price range for grid
  const timeThreshold = 30 * 60 * 1000; // 30 minutes between trades
  
  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    
    // Check if this could be part of a martingale sequence
    if (currentSequence) {
      const timeDiff = trade.closeTime - currentSequence.lastTime;
      const priceInRange = Math.abs(trade.openPrice - currentSequence.avgPrice) < priceThreshold;
      const quickEntry = timeDiff < timeThreshold;
      
      if (priceInRange && quickEntry && trade.volume >= currentSequence.lastVolume) {
        // Add to current sequence
        currentSequence.trades.push(trade);
        currentSequence.totalVolume += trade.volume;
        currentSequence.totalProfit += trade.profit;
        currentSequence.lastTime = trade.closeTime;
        currentSequence.lastVolume = trade.volume;
        currentSequence.endTime = trade.closeTime;
        
        // Update price range
        if (trade.openPrice < currentSequence.minPrice) currentSequence.minPrice = trade.openPrice;
        if (trade.openPrice > currentSequence.maxPrice) currentSequence.maxPrice = trade.openPrice;
        
        // Check if sequence recovered
        if (currentSequence.totalProfit > 0) {
          currentSequence.recovered = true;
        }
      } else {
        // End current sequence if it has multiple trades
        if (currentSequence.trades.length > 2) {
          currentSequence.duration = (currentSequence.endTime - currentSequence.startTime) / (1000 * 60 * 60);
          sequences.push(currentSequence);
        }
        currentSequence = null;
      }
    }
    
    // Start new sequence if this looks like a losing trade
    if (!currentSequence && trade.profit < 0) {
      currentSequence = {
        trades: [trade],
        startTime: trade.closeTime,
        endTime: trade.closeTime,
        lastTime: trade.closeTime,
        totalVolume: trade.volume,
        lastVolume: trade.volume,
        totalProfit: trade.profit,
        avgPrice: trade.openPrice,
        minPrice: trade.openPrice,
        maxPrice: trade.openPrice,
        recovered: false,
        duration: 0
      };
    }
  }
  
  // Don't forget the last sequence
  if (currentSequence && currentSequence.trades.length > 2) {
    currentSequence.duration = (currentSequence.endTime - currentSequence.startTime) / (1000 * 60 * 60);
    sequences.push(currentSequence);
  }
  
  return sequences;
}

function calculateStats(trades, label) {
  const stats = {
    label,
    count: trades.length,
    totalProfit: 0,
    totalVolume: 0,
    wins: 0,
    losses: 0,
    totalWinAmount: 0,
    totalLossAmount: 0,
    largestWin: 0,
    largestLoss: 0,
    maxVolume: 0,
    totalStorage: 0
  };
  
  trades.forEach(trade => {
    stats.totalProfit += trade.profit;
    stats.totalVolume += trade.volume;
    stats.totalStorage += trade.storage;
    
    if (trade.volume > stats.maxVolume) {
      stats.maxVolume = trade.volume;
    }
    
    if (trade.profit > 0) {
      stats.wins++;
      stats.totalWinAmount += trade.profit;
      if (trade.profit > stats.largestWin) {
        stats.largestWin = trade.profit;
      }
    } else if (trade.profit < 0) {
      stats.losses++;
      stats.totalLossAmount += Math.abs(trade.profit);
      if (trade.profit < stats.largestLoss) {
        stats.largestLoss = trade.profit;
      }
    }
  });
  
  stats.winRate = stats.count > 0 ? (stats.wins / stats.count) * 100 : 0;
  stats.avgProfit = stats.count > 0 ? stats.totalProfit / stats.count : 0;
  stats.profitFactor = stats.totalLossAmount > 0 ? stats.totalWinAmount / stats.totalLossAmount : 0;
  
  return stats;
}

function displayStats(stats) {
  console.log(`\n${stats.label}`);
  console.log('─'.repeat(60));
  console.log(`Trades: ${stats.count}`);
  console.log(`Total Profit: $${stats.totalProfit.toFixed(2)}`);
  console.log(`Win Rate: ${stats.winRate.toFixed(1)}%`);
  console.log(`Wins/Losses: ${stats.wins}/${stats.losses}`);
  console.log(`Average Profit per Trade: $${stats.avgProfit.toFixed(2)}`);
  console.log(`Profit Factor: ${stats.profitFactor.toFixed(2)}`);
  console.log(`Largest Win: $${stats.largestWin.toFixed(2)}`);
  console.log(`Largest Loss: $${stats.largestLoss.toFixed(2)}`);
  console.log(`Max Position Size: ${stats.maxVolume.toFixed(2)} lots`);
  console.log(`Storage Fees: $${stats.totalStorage.toFixed(2)}`);
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
          volume: parseFloat(row.true_volume),
          profit: parseFloat(row.true_profit),
          storage: parseFloat(row.storage),
          openPrice: parseFloat(row.open_price),
          closePrice: parseFloat(row.close_price)
        });
      })
      .on('end', () => resolve(trades))
      .on('error', reject);
  });
}

// Run the analysis
analyzeMartingaleImpact().catch(console.error);