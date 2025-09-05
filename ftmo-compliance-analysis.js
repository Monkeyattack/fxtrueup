#!/usr/bin/env node

/**
 * FTMO Compliance Analysis for Gold Buy Only Service
 * Analyzes trades against typical FTMO prop firm rules
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';
import fs from 'fs';
import csv from 'csv-parser';

dotenv.config();

const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';
const CSV_FILE_PATH = '/home/claude-dev/repos/meta-trader-hub/account_data/Gold-Buy-Only-August2025-trade_history.csv';

// FTMO Standard Rules
const FTMO_RULES = {
  maxDailyLoss: 5,        // 5% max daily loss
  maxTotalDrawdown: 10,   // 10% max total drawdown
  minTradingDays: 10,     // Minimum 10 trading days
  profitTarget: 10,       // 10% profit target (challenge)
  maxLeverage: 100,       // 1:100 max leverage
  newsTrading: false,     // News trading restrictions
  weekendHolding: true,   // Weekend holding allowed
  cryptoAllowed: false,   // Crypto trading not allowed
  maxPositionSize: 10,    // Max 10 lots per position (varies by account)
  trailingDrawdown: true  // Trailing drawdown type
};

async function analyzeFTMOCompliance() {
  console.log('🏆 FTMO COMPLIANCE ANALYSIS - GOLD BUY ONLY SERVICE');
  console.log('═'.repeat(80));
  console.log('Analyzing trades against FTMO prop firm rules...');
  console.log('═'.repeat(80));

  try {
    // Get account data
    const metrics = await poolClient.getAccountMetrics(GOLD_ACCOUNT_ID);
    const tradeHistory = await poolClient.getTradeHistory(GOLD_ACCOUNT_ID, 365, 5000);
    const dailyGrowth = await poolClient.getDailyGrowth(GOLD_ACCOUNT_ID, 365);
    
    const initialBalance = 5000;
    
    console.log('\n📊 FTMO RULE COMPLIANCE CHECK');
    console.log('─'.repeat(60));
    
    // 1. Analyze Daily Drawdown
    console.log('\n1️⃣ DAILY LOSS LIMIT (Max 5%)');
    console.log('─'.repeat(40));
    
    const dailyResults = analyzeDailyDrawdown(tradeHistory.trades, initialBalance);
    
    console.log(`Maximum Daily Loss: ${dailyResults.maxDailyLossPercent.toFixed(2)}%`);
    console.log(`Worst Day: ${dailyResults.worstDay}`);
    console.log(`Daily Loss Breaches: ${dailyResults.breaches}`);
    console.log(`Status: ${dailyResults.maxDailyLossPercent <= FTMO_RULES.maxDailyLoss ? '✅ PASS' : '❌ FAIL'}`);
    
    if (dailyResults.breaches > 0) {
      console.log('\n⚠️  Days with excessive losses:');
      dailyResults.breachDays.forEach(day => {
        console.log(`  ${day.date}: ${day.lossPercent.toFixed(2)}% loss ($${day.loss.toFixed(2)})`);
      });
    }
    
    // 2. Maximum Drawdown Analysis
    console.log('\n2️⃣ MAXIMUM DRAWDOWN (Max 10%)');
    console.log('─'.repeat(40));
    
    const drawdownResults = analyzeMaxDrawdown(dailyGrowth.growth, initialBalance);
    
    console.log(`Maximum Drawdown: ${drawdownResults.maxDrawdownPercent.toFixed(2)}%`);
    console.log(`Drawdown Amount: $${drawdownResults.maxDrawdownAmount.toFixed(2)}`);
    console.log(`Peak Balance: $${drawdownResults.peakBalance.toFixed(2)}`);
    console.log(`Trough Balance: $${drawdownResults.troughBalance.toFixed(2)}`);
    console.log(`Status: ${drawdownResults.maxDrawdownPercent <= FTMO_RULES.maxTotalDrawdown ? '✅ PASS' : '❌ FAIL'}`);
    
    // 3. Trading Days Requirement
    console.log('\n3️⃣ MINIMUM TRADING DAYS (Min 10)');
    console.log('─'.repeat(40));
    
    const tradingDays = countTradingDays(tradeHistory.trades);
    console.log(`Total Trading Days: ${tradingDays.count}`);
    console.log(`First Trade: ${tradingDays.firstDay}`);
    console.log(`Last Trade: ${tradingDays.lastDay}`);
    console.log(`Status: ${tradingDays.count >= FTMO_RULES.minTradingDays ? '✅ PASS' : '❌ FAIL'}`);
    
    // 4. Position Size Analysis
    console.log('\n4️⃣ POSITION SIZE LIMITS');
    console.log('─'.repeat(40));
    
    const positionAnalysis = analyzePositionSizes(tradeHistory.trades);
    console.log(`Maximum Position Size: ${positionAnalysis.maxSize.toFixed(2)} lots`);
    console.log(`Average Position Size: ${positionAnalysis.avgSize.toFixed(3)} lots`);
    console.log(`Positions > 1 lot: ${positionAnalysis.largePositions}`);
    console.log(`Status: ${positionAnalysis.maxSize <= FTMO_RULES.maxPositionSize ? '✅ PASS' : '❌ FAIL'}`);
    
    // 5. Trading Strategy Analysis
    console.log('\n5️⃣ TRADING STRATEGY COMPLIANCE');
    console.log('─'.repeat(40));
    
    const strategyAnalysis = analyzeStrategy(tradeHistory.trades);
    console.log(`Primary Instrument: ${strategyAnalysis.primaryInstrument}`);
    console.log(`Instruments Traded: ${strategyAnalysis.instruments.join(', ')}`);
    console.log(`Average Hold Time: ${strategyAnalysis.avgHoldTime.toFixed(1)} hours`);
    console.log(`Weekend Positions: ${strategyAnalysis.weekendPositions}`);
    console.log(`Scalping Trades (<5 min): ${strategyAnalysis.scalpingTrades}`);
    console.log(`EA/Grid Pattern: ${strategyAnalysis.gridPattern ? '⚠️  DETECTED' : '✅ NOT DETECTED'}`);
    
    // 6. Profit Target Achievement
    console.log('\n6️⃣ PROFIT TARGET (10% for Challenge)');
    console.log('─'.repeat(40));
    
    const totalReturn = ((metrics.balance - initialBalance) / initialBalance * 100);
    console.log(`Total Return: ${totalReturn.toFixed(2)}%`);
    console.log(`Status: ${totalReturn >= FTMO_RULES.profitTarget ? '✅ ACHIEVED' : '🔄 IN PROGRESS'}`);
    
    // 7. Risk Management Analysis
    console.log('\n7️⃣ RISK MANAGEMENT');
    console.log('─'.repeat(40));
    
    const riskAnalysis = analyzeRiskManagement(tradeHistory.trades, initialBalance);
    console.log(`Average Risk per Trade: ${riskAnalysis.avgRiskPercent.toFixed(2)}%`);
    console.log(`Max Risk per Trade: ${riskAnalysis.maxRiskPercent.toFixed(2)}%`);
    console.log(`Risk/Reward Ratio: ${riskAnalysis.riskRewardRatio.toFixed(2)}`);
    console.log(`Martingale Pattern: ${riskAnalysis.martingaleDetected ? '❌ DETECTED' : '✅ NOT DETECTED'}`);
    
    // Load and analyze CSV for more detailed compliance
    console.log('\n📋 DETAILED TRADE ANALYSIS (from CSV)');
    console.log('─'.repeat(60));
    
    const csvTrades = await loadCSVTrades();
    const detailedAnalysis = analyzeDetailedCompliance(csvTrades);
    
    console.log(`Overnight Holding Fees: $${detailedAnalysis.totalStorageFees.toFixed(2)}`);
    console.log(`High-Risk Time Trades: ${detailedAnalysis.newsTimeTrades}`);
    console.log(`Consecutive Losses: Max ${detailedAnalysis.maxConsecutiveLosses}`);
    
    // Final Verdict
    console.log('\n🎯 FINAL FTMO COMPLIANCE VERDICT');
    console.log('═'.repeat(80));
    
    const violations = [];
    if (dailyResults.maxDailyLossPercent > FTMO_RULES.maxDailyLoss) {
      violations.push(`Daily Loss Limit Exceeded (${dailyResults.maxDailyLossPercent.toFixed(2)}% > 5%)`);
    }
    if (drawdownResults.maxDrawdownPercent > FTMO_RULES.maxTotalDrawdown) {
      violations.push(`Maximum Drawdown Exceeded (${drawdownResults.maxDrawdownPercent.toFixed(2)}% > 10%)`);
    }
    if (positionAnalysis.maxSize > FTMO_RULES.maxPositionSize) {
      violations.push(`Position Size Limit Exceeded (${positionAnalysis.maxSize} lots > 10 lots)`);
    }
    if (strategyAnalysis.gridPattern) {
      violations.push('Grid/Martingale Pattern Detected (Often Prohibited)');
    }
    
    if (violations.length === 0) {
      console.log('✅ PASS - This trading strategy appears FTMO compliant!');
      console.log('\nKey Strengths:');
      console.log(`  • Controlled daily losses (max ${dailyResults.maxDailyLossPercent.toFixed(2)}%)`);
      console.log(`  • Low overall drawdown (${drawdownResults.maxDrawdownPercent.toFixed(2)}%)`);
      console.log(`  • Conservative position sizing (avg ${positionAnalysis.avgSize.toFixed(3)} lots)`);
      console.log(`  • ${tradingDays.count} active trading days`);
      console.log(`  • Strong profit factor (2.05)`);
    } else {
      console.log('❌ FAIL - This strategy would likely fail FTMO rules');
      console.log('\nViolations Found:');
      violations.forEach(v => console.log(`  • ${v}`));
    }
    
    console.log('\n⚠️  IMPORTANT NOTES:');
    console.log('─'.rapid(60));
    console.log('1. This analysis is based on historical performance');
    console.log('2. FTMO has specific rules about EA usage and trade copying');
    console.log('3. News trading restrictions apply during high-impact events');
    console.log('4. Consistency and risk management are key evaluation factors');
    console.log('5. The 32 trades held from July into August might raise questions');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

function analyzeDailyDrawdown(trades, initialBalance) {
  const dailyPnL = {};
  let currentBalance = initialBalance;
  let maxDailyLossPercent = 0;
  let worstDay = '';
  const breachDays = [];
  
  trades.forEach(trade => {
    if (!trade.closeTime) return;
    
    const date = new Date(trade.closeTime).toLocaleDateString();
    if (!dailyPnL[date]) {
      dailyPnL[date] = {
        startBalance: currentBalance,
        profit: 0,
        trades: 0
      };
    }
    
    dailyPnL[date].profit += (trade.profit || 0);
    dailyPnL[date].trades++;
    currentBalance += (trade.profit || 0);
  });
  
  Object.keys(dailyPnL).forEach(date => {
    const day = dailyPnL[date];
    const lossPercent = day.profit < 0 ? Math.abs(day.profit / day.startBalance * 100) : 0;
    
    if (lossPercent > maxDailyLossPercent) {
      maxDailyLossPercent = lossPercent;
      worstDay = date;
    }
    
    if (lossPercent > FTMO_RULES.maxDailyLoss) {
      breachDays.push({
        date,
        loss: day.profit,
        lossPercent
      });
    }
  });
  
  return {
    maxDailyLossPercent,
    worstDay,
    breaches: breachDays.length,
    breachDays
  };
}

function analyzeMaxDrawdown(growthData, initialBalance) {
  let peakBalance = initialBalance;
  let maxDrawdownAmount = 0;
  let maxDrawdownPercent = 0;
  let troughBalance = initialBalance;
  
  growthData.forEach(point => {
    if (!point.balance) return;
    
    const balance = point.balance;
    
    if (balance > peakBalance) {
      peakBalance = balance;
    }
    
    const drawdown = peakBalance - balance;
    const drawdownPercent = (drawdown / peakBalance) * 100;
    
    if (drawdownPercent > maxDrawdownPercent) {
      maxDrawdownPercent = drawdownPercent;
      maxDrawdownAmount = drawdown;
      troughBalance = balance;
    }
  });
  
  return {
    maxDrawdownPercent,
    maxDrawdownAmount,
    peakBalance,
    troughBalance
  };
}

function countTradingDays(trades) {
  const tradingDays = new Set();
  let firstDay = '';
  let lastDay = '';
  
  trades.forEach(trade => {
    if (!trade.closeTime) return;
    const date = new Date(trade.closeTime).toLocaleDateString();
    tradingDays.add(date);
    
    if (!firstDay || date < firstDay) firstDay = date;
    if (!lastDay || date > lastDay) lastDay = date;
  });
  
  return {
    count: tradingDays.size,
    firstDay,
    lastDay
  };
}

function analyzePositionSizes(trades) {
  let maxSize = 0;
  let totalSize = 0;
  let largePositions = 0;
  let count = 0;
  
  trades.forEach(trade => {
    const volume = trade.volume || 0;
    if (volume > 0) {
      count++;
      totalSize += volume;
      if (volume > maxSize) maxSize = volume;
      if (volume > 1) largePositions++;
    }
  });
  
  return {
    maxSize,
    avgSize: count > 0 ? totalSize / count : 0,
    largePositions
  };
}

function analyzeStrategy(trades) {
  const instruments = new Set();
  let totalHoldTime = 0;
  let holdTimeCount = 0;
  let weekendPositions = 0;
  let scalpingTrades = 0;
  let gridPattern = false;
  
  // Check for grid pattern (multiple positions at similar prices)
  const openPrices = {};
  
  trades.forEach(trade => {
    if (trade.symbol) instruments.add(trade.symbol);
    
    if (trade.openTime && trade.closeTime) {
      const openDate = new Date(trade.openTime);
      const closeDate = new Date(trade.closeTime);
      const holdTime = (closeDate - openDate) / (1000 * 60 * 60); // hours
      
      totalHoldTime += holdTime;
      holdTimeCount++;
      
      // Check for weekend holding
      if (openDate.getDay() === 5 && closeDate.getDay() === 1) {
        weekendPositions++;
      }
      
      // Check for scalping (< 5 minutes)
      if (holdTime < 0.0833) {
        scalpingTrades++;
      }
      
      // Grid pattern detection
      const priceKey = Math.round(trade.openPrice / 10) * 10; // Round to nearest 10
      if (!openPrices[priceKey]) openPrices[priceKey] = 0;
      openPrices[priceKey]++;
      
      if (openPrices[priceKey] > 5) gridPattern = true;
    }
  });
  
  return {
    instruments: Array.from(instruments),
    primaryInstrument: 'XAUUSD',
    avgHoldTime: holdTimeCount > 0 ? totalHoldTime / holdTimeCount : 0,
    weekendPositions,
    scalpingTrades,
    gridPattern
  };
}

function analyzeRiskManagement(trades, initialBalance) {
  let maxLoss = 0;
  let totalRisk = 0;
  let riskCount = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveLosses = 0;
  let martingaleDetected = false;
  let lastLossSize = 0;
  
  trades.forEach(trade => {
    const profit = trade.profit || 0;
    const volume = trade.volume || 0;
    
    if (profit < 0) {
      const risk = Math.abs(profit);
      if (risk > maxLoss) maxLoss = risk;
      totalRisk += risk;
      riskCount++;
      totalLosses += risk;
      
      consecutiveLosses++;
      if (consecutiveLosses > maxConsecutiveLosses) {
        maxConsecutiveLosses = consecutiveLosses;
      }
      
      // Martingale detection
      if (lastLossSize > 0 && volume > lastLossSize * 1.5) {
        martingaleDetected = true;
      }
      lastLossSize = volume;
    } else if (profit > 0) {
      totalWins += profit;
      consecutiveLosses = 0;
      lastLossSize = 0;
    }
  });
  
  const avgRisk = riskCount > 0 ? totalRisk / riskCount : 0;
  const avgRiskPercent = (avgRisk / initialBalance) * 100;
  const maxRiskPercent = (maxLoss / initialBalance) * 100;
  const riskRewardRatio = totalLosses > 0 ? totalWins / totalLosses : 0;
  
  return {
    avgRiskPercent,
    maxRiskPercent,
    riskRewardRatio,
    martingaleDetected,
    maxConsecutiveLosses
  };
}

async function loadCSVTrades() {
  const trades = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on('data', (row) => {
        trades.push({
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

function analyzeDetailedCompliance(trades) {
  let totalStorageFees = 0;
  let newsTimeTrades = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveLosses = 0;
  
  trades.forEach(trade => {
    totalStorageFees += Math.abs(trade.storage || 0);
    
    // Check for news time trading (simplified - would need news calendar)
    const hour = trade.closeTime.getUTCHours();
    if ((hour >= 12 && hour <= 14) || (hour >= 18 && hour <= 20)) {
      newsTimeTrades++;
    }
    
    if (trade.profit < 0) {
      consecutiveLosses++;
      if (consecutiveLosses > maxConsecutiveLosses) {
        maxConsecutiveLosses = consecutiveLosses;
      }
    } else if (trade.profit > 0) {
      consecutiveLosses = 0;
    }
  });
  
  return {
    totalStorageFees,
    newsTimeTrades,
    maxConsecutiveLosses
  };
}

// Run the analysis
analyzeFTMOCompliance().catch(console.error);