#!/usr/bin/env node

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';
import { GOLD_ACCOUNT_ID, ACCOUNT_CONFIGS } from './src/config/accounts.js';

dotenv.config();

async function analyzeGoldTradingFrequency() {
  console.log('📊 ANALYZING GOLD ACCOUNT TRADING FREQUENCY');
  console.log('═'.repeat(80));
  
  try {
    // 1. Get current positions with their open times
    const currentPositions = await poolClient.getPositions(GOLD_ACCOUNT_ID, 'london');
    console.log(`\n📍 Current Open Positions: ${currentPositions.length}`);
    
    if (currentPositions.length > 0) {
      // Sort by open time to find the most recent
      const sortedPositions = currentPositions.sort((a, b) => 
        new Date(b.time || b.openTime) - new Date(a.time || a.openTime)
      );
      
      console.log('\nCurrent positions (newest first):');
      sortedPositions.forEach(pos => {
        const openTime = new Date(pos.time || pos.openTime);
        const hoursAgo = ((Date.now() - openTime) / (1000 * 60 * 60)).toFixed(1);
        console.log(`  ${pos.symbol}: ${pos.volume} lots @ ${pos.openPrice?.toFixed(2)} - Opened ${hoursAgo} hours ago (${openTime.toLocaleString()})`);
      });
      
      const newestPosition = sortedPositions[0];
      const newestTime = new Date(newestPosition.time || newestPosition.openTime);
      console.log(`\n🔸 Most Recent Position: ${newestPosition.symbol} opened ${((Date.now() - newestTime) / (1000 * 60 * 60)).toFixed(1)} hours ago`);
    }
    
    // 2. Get trade history for analysis
    console.log('\n📈 HISTORICAL TRADE ANALYSIS');
    console.log('─'.repeat(60));
    
    // Get 30 days of history
    const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, 30, 1000);
    console.log(`\nTotal trades in last 30 days: ${tradeHistory.count || 0}`);
    
    if (tradeHistory.trades && tradeHistory.trades.length > 0) {
      // Group trades by day
      const tradesByDay = {};
      const tradesByHour = {};
      const tradeTimes = [];
      
      tradeHistory.trades.forEach(trade => {
        const tradeDate = new Date(trade.time || trade.openTime);
        const dayKey = tradeDate.toDateString();
        const hour = tradeDate.getUTCHours();
        
        // Track trades per day
        tradesByDay[dayKey] = (tradesByDay[dayKey] || 0) + 1;
        
        // Track trades per hour
        tradesByHour[hour] = (tradesByHour[hour] || 0) + 1;
        
        // Store all trade times for interval analysis
        tradeTimes.push(tradeDate.getTime());
      });
      
      // Calculate daily statistics
      const dailyTradeCounts = Object.values(tradesByDay);
      const avgTradesPerDay = dailyTradeCounts.reduce((a, b) => a + b, 0) / dailyTradeCounts.length;
      const maxTradesPerDay = Math.max(...dailyTradeCounts);
      const minTradesPerDay = Math.min(...dailyTradeCounts);
      
      console.log('\n📊 Daily Trading Statistics:');
      console.log(`  Average trades per day: ${avgTradesPerDay.toFixed(1)}`);
      console.log(`  Max trades in a day: ${maxTradesPerDay}`);
      console.log(`  Min trades in a day: ${minTradesPerDay}`);
      
      // Most active trading days
      const sortedDays = Object.entries(tradesByDay)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      console.log('\n📅 Most Active Trading Days:');
      sortedDays.forEach(([day, count]) => {
        console.log(`  ${day}: ${count} trades`);
      });
      
      // Trading hours analysis
      console.log('\n⏰ Trading Hours Analysis (UTC):');
      const sortedHours = Object.entries(tradesByHour)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
      
      sortedHours.forEach(([hour, count]) => {
        const percentage = ((count / tradeHistory.trades.length) * 100).toFixed(1);
        const bar = '█'.repeat(Math.round(count / 5));
        console.log(`  ${hour.padStart(2, '0')}:00 - ${bar} ${count} trades (${percentage}%)`);
      });
      
      // Calculate time between trades
      if (tradeTimes.length > 1) {
        tradeTimes.sort((a, b) => a - b);
        const intervals = [];
        
        for (let i = 1; i < tradeTimes.length; i++) {
          intervals.push(tradeTimes[i] - tradeTimes[i - 1]);
        }
        
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const minInterval = Math.min(...intervals);
        const maxInterval = Math.max(...intervals);
        
        console.log('\n⏱️ Time Between Trades:');
        console.log(`  Average: ${(avgInterval / (1000 * 60 * 60)).toFixed(1)} hours`);
        console.log(`  Minimum: ${(minInterval / (1000 * 60)).toFixed(1)} minutes`);
        console.log(`  Maximum: ${(maxInterval / (1000 * 60 * 60)).toFixed(1)} hours`);
      }
      
      // Pattern detection
      console.log('\n🎯 Trading Patterns:');
      
      // Check for martingale patterns (multiple trades at different lot sizes)
      const lotSizes = {};
      tradeHistory.trades.forEach(trade => {
        const size = trade.volume.toFixed(2);
        lotSizes[size] = (lotSizes[size] || 0) + 1;
      });
      
      console.log('\n📊 Position Size Distribution:');
      Object.entries(lotSizes)
        .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
        .forEach(([size, count]) => {
          const percentage = ((count / tradeHistory.trades.length) * 100).toFixed(1);
          console.log(`  ${size} lots: ${count} trades (${percentage}%)`);
        });
      
      // Estimate new trade frequency
      const hoursInPeriod = 30 * 24;
      const tradesPerHour = tradeHistory.trades.length / hoursInPeriod;
      const hoursBetweenTrades = 1 / tradesPerHour;
      
      console.log('\n📈 ESTIMATED TRADING FREQUENCY:');
      console.log(`  Based on 30-day history:`);
      console.log(`  - New trade every ${hoursBetweenTrades.toFixed(1)} hours on average`);
      console.log(`  - ${(tradesPerHour * 24).toFixed(1)} trades per day on average`);
      console.log(`  - Most active hours: ${Object.entries(tradesByHour).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => `${h}:00`).join(', ')} UTC`);
      
    } else {
      console.log('No trade history available');
    }
    
    // 3. Get open trades for more detail
    const openTrades = await poolClient.getOpenTrades(GOLD_ACCOUNT_ID);
    if (openTrades.open_trades && openTrades.open_trades.length > 0) {
      console.log('\n📂 Detailed Open Trade Analysis:');
      
      // Group by symbol
      const bySymbol = {};
      openTrades.open_trades.forEach(trade => {
        if (!bySymbol[trade.symbol]) bySymbol[trade.symbol] = [];
        bySymbol[trade.symbol].push(trade);
      });
      
      Object.entries(bySymbol).forEach(([symbol, trades]) => {
        console.log(`\n${symbol}: ${trades.length} positions`);
        trades.forEach(trade => {
          const openTime = new Date(trade.time);
          const hoursOpen = ((Date.now() - openTime) / (1000 * 60 * 60)).toFixed(1);
          console.log(`  - ${trade.volume} lots @ ${trade.openPrice} (${hoursOpen}h ago)`);
        });
      });
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

// Run the analysis
analyzeGoldTradingFrequency().catch(console.error);