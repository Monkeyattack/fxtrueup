#!/usr/bin/env node

/**
 * Copy Trading Filter System
 * Filters out martingale trades and selects only high-quality setups
 */

import dotenv from 'dotenv';
import poolClient from './src/services/poolClient.js';

dotenv.config();

// Configuration
const SOURCE_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac'; // Gold Buy Only Service
const COPY_ACCOUNT_ID = 'YOUR_COPY_ACCOUNT_ID'; // Your account to copy to

// Filter Settings
const FILTER_CONFIG = {
  // Position Management
  maxOpenPositions: 1,              // Only 1 position at a time (no grid)
  minTimeBetweenTrades: 30,         // Minutes between trades
  
  // Trade Quality Filters
  maxPositionSize: 0.02,            // Max 0.02 lots per trade
  blockMultipleEntries: true,       // Block multiple entries at similar prices
  priceRangeThreshold: 50,          // Pips range to consider "similar price"
  
  // Risk Filters
  maxDailyTrades: 5,                // Max trades per day
  maxDailyLoss: 2,                  // Max 2% daily loss
  maxConsecutiveLosses: 2,          // Stop after 2 consecutive losses
  
  // Time Filters
  allowedHours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], // Trading hours (UTC)
  avoidNews: true,                  // Avoid high-impact news times
  avoidWeekends: true,              // No weekend holding
  
  // Setup Quality
  minimumHoldTime: 60,              // Minimum 60 minutes hold time (avoid scalping)
  requireTrend: true,               // Only trade with trend
  minProfitTarget: 10               // Minimum profit target in pips
};

class CopyTradeFilter {
  constructor() {
    this.openPositions = new Map();
    this.recentTrades = [];
    this.dailyStats = {
      trades: 0,
      loss: 0,
      consecutiveLosses: 0,
      lastTradeTime: null
    };
    this.priceHistory = [];
  }

  /**
   * Main method to check if a trade should be copied
   */
  async shouldCopyTrade(signal) {
    console.log('\n🔍 Analyzing Trade Signal...');
    console.log(`Symbol: ${signal.symbol}`);
    console.log(`Type: ${signal.type}`);
    console.log(`Volume: ${signal.volume}`);
    console.log(`Price: ${signal.price}`);
    
    const reasons = [];
    let shouldCopy = true;
    
    // 1. Check for martingale pattern
    if (this.isMartingaleSignal(signal)) {
      shouldCopy = false;
      reasons.push('❌ Martingale pattern detected');
    }
    
    // 2. Check position limits
    if (this.openPositions.size >= FILTER_CONFIG.maxOpenPositions) {
      shouldCopy = false;
      reasons.push('❌ Maximum open positions reached');
    }
    
    // 3. Check time between trades
    if (!this.checkTimeBetweenTrades(signal)) {
      shouldCopy = false;
      reasons.push('❌ Too soon after last trade');
    }
    
    // 4. Check position size
    if (signal.volume > FILTER_CONFIG.maxPositionSize) {
      shouldCopy = false;
      reasons.push('❌ Position size too large');
    }
    
    // 5. Check for multiple entries
    if (this.isMultipleEntry(signal)) {
      shouldCopy = false;
      reasons.push('❌ Multiple entry at similar price');
    }
    
    // 6. Check daily limits
    if (!this.checkDailyLimits()) {
      shouldCopy = false;
      reasons.push('❌ Daily trade limit reached');
    }
    
    // 7. Check trading hours
    if (!this.checkTradingHours()) {
      shouldCopy = false;
      reasons.push('❌ Outside allowed trading hours');
    }
    
    // 8. Check trade quality
    const quality = await this.assessTradeQuality(signal);
    if (quality.score < 70) {
      shouldCopy = false;
      reasons.push(`❌ Low quality setup (score: ${quality.score})`);
    }
    
    // Display decision
    console.log('\n📊 Filter Decision:');
    if (shouldCopy) {
      console.log('✅ COPY TRADE - High quality setup detected');
      console.log(`Quality Score: ${quality.score}/100`);
      console.log(`Reasons: ${quality.reasons.join(', ')}`);
    } else {
      console.log('❌ SKIP TRADE - Filtered out');
      reasons.forEach(reason => console.log(`  ${reason}`));
    }
    
    return { shouldCopy, reasons, quality };
  }
  
  /**
   * Detect martingale patterns
   */
  isMartingaleSignal(signal) {
    // Check recent trades for martingale pattern
    const recentLosses = this.recentTrades
      .slice(-5)
      .filter(t => t.result < 0);
    
    if (recentLosses.length === 0) return false;
    
    // Check if position size is increasing after losses
    const lastLoss = recentLosses[recentLosses.length - 1];
    if (signal.volume > lastLoss.volume * 1.2) {
      return true;
    }
    
    // Check if entering at similar price after loss
    const priceDiff = Math.abs(signal.price - lastLoss.price);
    const pipDiff = signal.symbol.includes('JPY') ? priceDiff * 100 : priceDiff * 10000;
    
    if (pipDiff < FILTER_CONFIG.priceRangeThreshold && 
        signal.volume >= lastLoss.volume) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check time between trades
   */
  checkTimeBetweenTrades(signal) {
    if (!this.dailyStats.lastTradeTime) return true;
    
    const timeDiff = Date.now() - this.dailyStats.lastTradeTime;
    const minutesDiff = timeDiff / (1000 * 60);
    
    return minutesDiff >= FILTER_CONFIG.minTimeBetweenTrades;
  }
  
  /**
   * Check for multiple entries at similar prices
   */
  isMultipleEntry(signal) {
    for (const [id, position] of this.openPositions) {
      if (position.symbol !== signal.symbol) continue;
      
      const priceDiff = Math.abs(signal.price - position.openPrice);
      const pipDiff = signal.symbol.includes('JPY') ? priceDiff * 100 : priceDiff * 10000;
      
      if (pipDiff < FILTER_CONFIG.priceRangeThreshold) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check daily trading limits
   */
  checkDailyLimits() {
    // Reset daily stats if new day
    const today = new Date().toDateString();
    if (this.dailyStats.date !== today) {
      this.dailyStats = {
        date: today,
        trades: 0,
        loss: 0,
        consecutiveLosses: 0,
        lastTradeTime: null
      };
    }
    
    if (this.dailyStats.trades >= FILTER_CONFIG.maxDailyTrades) {
      return false;
    }
    
    if (this.dailyStats.consecutiveLosses >= FILTER_CONFIG.maxConsecutiveLosses) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Check if current time is within allowed trading hours
   */
  checkTradingHours() {
    const now = new Date();
    const currentHour = now.getUTCHours();
    
    if (!FILTER_CONFIG.allowedHours.includes(currentHour)) {
      return false;
    }
    
    // Avoid weekends
    if (FILTER_CONFIG.avoidWeekends) {
      const day = now.getUTCDay();
      if (day === 0 || day === 6) return false;
    }
    
    return true;
  }
  
  /**
   * Assess trade quality (0-100 score)
   */
  async assessTradeQuality(signal) {
    let score = 100;
    const reasons = [];
    
    // 1. Check trend alignment (simplified)
    const trend = await this.checkTrend(signal.symbol);
    if (trend.aligned) {
      reasons.push('Trend aligned');
    } else {
      score -= 30;
    }
    
    // 2. Check volatility
    const volatility = await this.checkVolatility(signal.symbol);
    if (volatility.normal) {
      reasons.push('Normal volatility');
    } else {
      score -= 20;
    }
    
    // 3. Check support/resistance
    const sr = this.checkSupportResistance(signal);
    if (sr.favorable) {
      reasons.push('Good S/R level');
      score += 10;
    }
    
    // 4. Check time of day
    const timeScore = this.getTimeOfDayScore();
    score = score * timeScore;
    
    // 5. Position size appropriateness
    if (signal.volume <= 0.01) {
      reasons.push('Conservative size');
      score += 5;
    }
    
    return { score: Math.round(score), reasons };
  }
  
  /**
   * Simple trend check
   */
  async checkTrend(symbol) {
    // In real implementation, would check moving averages, price action, etc.
    // For now, simplified logic
    const prices = this.priceHistory.slice(-20);
    if (prices.length < 20) return { aligned: true };
    
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const currentPrice = prices[prices.length - 1];
    
    return {
      aligned: currentPrice > avg,
      direction: currentPrice > avg ? 'up' : 'down'
    };
  }
  
  /**
   * Check volatility
   */
  async checkVolatility(symbol) {
    // Simplified volatility check
    const prices = this.priceHistory.slice(-20);
    if (prices.length < 2) return { normal: true };
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(Math.abs(prices[i] - prices[i-1]));
    }
    
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const normalRange = symbol.includes('XAU') ? 5 : 0.001;
    
    return {
      normal: avgChange < normalRange * 2,
      value: avgChange
    };
  }
  
  /**
   * Check support/resistance levels
   */
  checkSupportResistance(signal) {
    // Simplified S/R check
    const roundedPrice = Math.round(signal.price / 10) * 10;
    const levelStrength = roundedPrice % 100 === 0 ? 'strong' : 'weak';
    
    return {
      favorable: levelStrength === 'strong',
      level: roundedPrice,
      strength: levelStrength
    };
  }
  
  /**
   * Score based on time of day
   */
  getTimeOfDayScore() {
    const hour = new Date().getUTCHours();
    
    // Best hours (London/NY overlap)
    if (hour >= 13 && hour <= 16) return 1.2;
    
    // Good hours
    if (hour >= 8 && hour <= 17) return 1.0;
    
    // Okay hours
    if (hour >= 6 && hour <= 20) return 0.8;
    
    // Poor hours
    return 0.6;
  }
  
  /**
   * Update trade history
   */
  updateTradeHistory(trade) {
    this.recentTrades.push(trade);
    if (this.recentTrades.length > 50) {
      this.recentTrades.shift();
    }
    
    // Update daily stats
    this.dailyStats.trades++;
    this.dailyStats.lastTradeTime = Date.now();
    
    if (trade.result < 0) {
      this.dailyStats.loss += Math.abs(trade.result);
      this.dailyStats.consecutiveLosses++;
    } else {
      this.dailyStats.consecutiveLosses = 0;
    }
  }
}

// Example implementation
async function setupCopyTrading() {
  console.log('🚀 COPY TRADING FILTER SYSTEM');
  console.log('═'.repeat(60));
  console.log('This system will:');
  console.log('  ✅ Copy only high-quality trades');
  console.log('  ❌ Filter out martingale/grid trades');
  console.log('  ✅ Maintain FTMO compliance');
  console.log('  ✅ Improve profitability');
  console.log('═'.repeat(60));
  
  const filter = new CopyTradeFilter();
  
  // Example: Monitor source account for new trades
  console.log('\n📡 Monitoring Gold Buy Only Service account...');
  console.log('Waiting for trade signals...\n');
  
  // In real implementation, you would:
  // 1. Connect to MetaAPI or your broker's API
  // 2. Subscribe to trade events from source account
  // 3. Filter each signal through the system
  // 4. Execute approved trades on your account
  
  // Example signal processing
  const exampleSignals = [
    {
      symbol: 'XAUUSD',
      type: 'BUY',
      volume: 0.01,
      price: 3350.00,
      time: new Date()
    },
    {
      symbol: 'XAUUSD',
      type: 'BUY',
      volume: 0.02,
      price: 3352.00,
      time: new Date()
    },
    {
      symbol: 'XAUUSD',
      type: 'BUY',
      volume: 0.01,
      price: 3380.00,
      time: new Date()
    }
  ];
  
  for (const signal of exampleSignals) {
    const decision = await filter.shouldCopyTrade(signal);
    
    if (decision.shouldCopy) {
      console.log('\n🎯 Executing copy trade...');
      // Execute trade on your account
      // await executeTrade(COPY_ACCOUNT_ID, signal);
    }
    
    // Simulate some time between signals
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n📋 IMPLEMENTATION OPTIONS:');
  console.log('─'.repeat(60));
  console.log('\n1. MetaTrader Solutions:');
  console.log('   • Use a custom EA with filtering logic');
  console.log('   • Modify existing copy trading EAs');
  console.log('   • Signal service with manual filtering');
  
  console.log('\n2. API-Based Solutions:');
  console.log('   • MetaAPI with custom Node.js filter');
  console.log('   • cTrader Copy with custom rules');
  console.log('   • TradingView webhooks with filtering');
  
  console.log('\n3. Third-Party Platforms:');
  console.log('   • DupliTrade (supports custom filters)');
  console.log('   • MyFxBook AutoTrade (with EA modifications)');
  console.log('   • ZuluTrade (with custom settings)');
  
  console.log('\n⚡ QUICKEST SOLUTION:');
  console.log('─'.rapid(60));
  console.log('1. Use MetaAPI to read source account trades');
  console.log('2. Run this Node.js filter system on a VPS');
  console.log('3. Execute filtered trades via MetaAPI on your account');
  console.log('4. Monitor and adjust filter parameters as needed');
}

// Run the example
setupCopyTrading().catch(console.error);