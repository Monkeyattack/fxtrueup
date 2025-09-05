#!/usr/bin/env node

/**
 * Tiger Funded Hybrid Copy Trading Setup
 * Conservative start with phase-in approach based on agent recommendations
 */

import MetaApi from 'metaapi.cloud-sdk';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Source account (Gold Buy Only Service)
const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';

// Hybrid configuration balancing Risk Manager caution with Quant Analyst optimization
const HYBRID_CONFIG = {
  // Account details (to be filled when you provide)
  targetAccountId: process.env.TIGER_ACCOUNT_ID,
  
  // Phase-in approach (starts conservative)
  phase: 1, // Will increase based on performance
  phases: {
    1: { multiplier: 10, riskFactor: 1.0 },   // Week 1-2: Conservative
    2: { multiplier: 15, riskFactor: 0.85 },  // Week 3: Scale up if profitable
    3: { multiplier: 20, riskFactor: 0.85 }   // Week 4+: Full sizing
  },
  
  // Risk parameters (strict controls both agents agreed on)
  maxDailyLossPercent: 3.0,  // Hard stop (more conservative than 5%)
  emergencyStopPercent: 4.0,  // Emergency close all positions
  maxTotalDrawdownPercent: 8.0,  // Well under 12% limit
  
  // Position sizing controls
  maxLotSize: 2.0,  // Cap individual positions
  maxTotalLots: 3.0,  // Start conservative (not 5.0)
  minLotSize: 0.01,
  
  // Martingale controls (Risk Manager's concerns)
  maxMartingaleDepth: 2,  // Strict limit (not 3)
  maxMartingaleSize: 0.03,  // Skip sequences exceeding this
  martingaleTimeLimit: 4 * 60 * 60 * 1000,  // 4 hour max duration
  
  // Trading filters
  minTimeBetweenTrades: 15 * 60 * 1000,  // 15 minutes
  maxPositionsPerSymbol: 2,  // Allow limited grid
  maxDailyTrades: 8,
  maxConcurrentPositions: 3,
  
  // Volatility controls
  pauseAfterConsecutiveLosses: 2,
  sizeReductionAfterLoss: 0.5,  // 50% reduction
  maxDailyVolatility: 500,  // Pause if daily swings exceed $500
  
  // Performance tracking
  targetPhase1: 8,  // 8% profit target
  targetPhase2: 5,  // 5% profit target
  minWinRateForScaleUp: 60,  // Need 60%+ to scale up
  evaluationDays: 30,
  
  // Symbol configuration
  symbolMapping: {
    'XAUUSD': 'XAUUSD',
    'Gold': 'XAUUSD',
    'GOLD': 'XAUUSD'
  },
  
  // Logging and monitoring
  logFile: './tiger-funded-trades.log',
  metricsFile: './tiger-funded-metrics.json'
};

class TigerFundedHybridCopyTrader {
  constructor(config) {
    this.config = config;
    this.metaApi = new MetaApi(process.env.METAAPI_TOKEN);
    this.sourceAccount = null;
    this.targetAccount = null;
    this.isRunning = false;
    
    // Performance tracking
    this.metrics = {
      startTime: Date.now(),
      startBalance: 0,
      currentBalance: 0,
      highWaterMark: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      consecutiveLosses: 0,
      largestWin: 0,
      largestLoss: 0,
      dailyStats: {},
      martingaleSequences: new Map(),
      phaseUpgradeDate: null
    };
    
    // Daily tracking
    this.dailyStats = {
      date: new Date().toDateString(),
      startBalance: 0,
      currentBalance: 0,
      trades: 0,
      openPositions: new Map(),
      highPoint: 0,
      lowPoint: 0,
      volatility: 0
    };
  }

  async initialize() {
    console.log('🐯 Tiger Funded Hybrid Copy Trader - Initializing...');
    console.log(`📊 Starting in Phase ${this.config.phase} (Conservative)`);
    
    try {
      // Connect to source account
      this.sourceAccount = await this.metaApi.metatraderAccountApi.getAccount(GOLD_ACCOUNT_ID);
      const sourceConnection = await this.sourceAccount.connect();
      await sourceConnection.waitSynchronized();
      console.log('✅ Connected to Gold Buy Only Service');
      
      // Connect to target account
      if (!this.config.targetAccountId) {
        throw new Error('TIGER_ACCOUNT_ID not configured');
      }
      
      this.targetAccount = await this.metaApi.metatraderAccountApi.getAccount(this.config.targetAccountId);
      const targetConnection = await this.targetAccount.connect();
      await targetConnection.waitSynchronized();
      console.log('✅ Connected to Tiger Funded account');
      
      // Get initial account info
      const accountInfo = await targetConnection.getAccountInformation();
      this.metrics.startBalance = accountInfo.balance;
      this.metrics.currentBalance = accountInfo.balance;
      this.metrics.highWaterMark = accountInfo.balance;
      this.dailyStats.startBalance = accountInfo.balance;
      this.dailyStats.currentBalance = accountInfo.balance;
      
      console.log(`\n📊 Tiger Funded Account Info:`);
      console.log(`   Balance: $${accountInfo.balance.toFixed(2)}`);
      console.log(`   Equity: $${accountInfo.equity.toFixed(2)}`);
      console.log(`   Leverage: 1:${accountInfo.leverage}`);
      console.log(`\n🎯 Targets:`);
      console.log(`   Phase 1: $${(accountInfo.balance * 1.08).toFixed(2)} (+8%)`);
      console.log(`   Phase 2: $${(accountInfo.balance * 1.13).toFixed(2)} (+13% total)`);
      console.log(`\n⚠️  Risk Limits:`);
      console.log(`   Daily Stop: $${(accountInfo.balance * 0.03).toFixed(2)} (3%)`);
      console.log(`   Emergency Stop: $${(accountInfo.balance * 0.04).toFixed(2)} (4%)`);
      console.log(`   Max Drawdown: $${(accountInfo.balance * 0.08).toFixed(2)} (8%)`);
      
      // Load existing metrics if any
      this.loadMetrics();
      
      return targetConnection;
      
    } catch (error) {
      console.error('❌ Initialization error:', error.message);
      throw error;
    }
  }

  getCurrentPhaseConfig() {
    return this.config.phases[this.config.phase];
  }

  calculateLotSize(sourceLots, sourceBalance = 5000) {
    const phaseConfig = this.getCurrentPhaseConfig();
    const targetBalance = this.dailyStats.currentBalance;
    
    // Base calculation with phase-in multiplier
    let baseLots = sourceLots * (targetBalance / sourceBalance) / phaseConfig.multiplier;
    
    // Apply risk factor
    let adjustedLots = baseLots * phaseConfig.riskFactor;
    
    // Apply consecutive loss reduction
    if (this.metrics.consecutiveLosses > 0) {
      adjustedLots *= Math.pow(this.config.sizeReductionAfterLoss, this.metrics.consecutiveLosses);
      console.log(`📉 Reduced size due to ${this.metrics.consecutiveLosses} consecutive losses`);
    }
    
    // Check position limits
    adjustedLots = Math.min(adjustedLots, this.config.maxLotSize);
    adjustedLots = Math.max(adjustedLots, this.config.minLotSize);
    
    // Check total exposure
    let totalExposure = 0;
    this.dailyStats.openPositions.forEach(pos => {
      totalExposure += pos.volume;
    });
    
    if (totalExposure + adjustedLots > this.config.maxTotalLots) {
      adjustedLots = Math.max(0, this.config.maxTotalLots - totalExposure);
      console.log(`⚠️  Reduced lot size due to total exposure limit`);
    }
    
    // Round to valid lot size
    adjustedLots = Math.round(adjustedLots * 100) / 100;
    
    return adjustedLots;
  }

  async checkRiskLimits() {
    const accountInfo = await this.targetAccount.getAccountInformation();
    const currentBalance = accountInfo.balance;
    const currentEquity = accountInfo.equity;
    
    // Update metrics
    this.metrics.currentBalance = currentBalance;
    this.dailyStats.currentBalance = currentBalance;
    
    // Track high/low points
    if (currentEquity > this.dailyStats.highPoint) {
      this.dailyStats.highPoint = currentEquity;
    }
    if (currentEquity < this.dailyStats.lowPoint || this.dailyStats.lowPoint === 0) {
      this.dailyStats.lowPoint = currentEquity;
    }
    
    // Calculate volatility
    this.dailyStats.volatility = this.dailyStats.highPoint - this.dailyStats.lowPoint;
    
    // Check daily loss
    const dailyLossPercent = (this.dailyStats.startBalance - currentEquity) / this.dailyStats.startBalance * 100;
    const totalDrawdownPercent = (this.metrics.highWaterMark - currentEquity) / this.metrics.highWaterMark * 100;
    
    console.log(`\n📊 Risk Status:`);
    console.log(`   Daily P/L: ${dailyLossPercent.toFixed(2)}% (Limit: -${this.config.maxDailyLossPercent}%)`);
    console.log(`   Drawdown: ${totalDrawdownPercent.toFixed(2)}% (Limit: ${this.config.maxTotalDrawdownPercent}%)`);
    console.log(`   Volatility: $${this.dailyStats.volatility.toFixed(2)}`);
    
    // Emergency stop
    if (dailyLossPercent > this.config.emergencyStopPercent) {
      console.log(`🛑 EMERGENCY STOP TRIGGERED at ${dailyLossPercent.toFixed(2)}% loss!`);
      await this.emergencyCloseAll();
      this.isRunning = false;
      return false;
    }
    
    // Daily loss limit
    if (dailyLossPercent > this.config.maxDailyLossPercent) {
      console.log(`⚠️  DAILY LOSS LIMIT REACHED: ${dailyLossPercent.toFixed(2)}%`);
      return false;
    }
    
    // Total drawdown limit
    if (totalDrawdownPercent > this.config.maxTotalDrawdownPercent) {
      console.log(`⚠️  TOTAL DRAWDOWN LIMIT REACHED: ${totalDrawdownPercent.toFixed(2)}%`);
      return false;
    }
    
    // Volatility check
    if (this.dailyStats.volatility > this.config.maxDailyVolatility) {
      console.log(`⚠️  HIGH VOLATILITY: $${this.dailyStats.volatility.toFixed(2)} - Pausing new trades`);
      return false;
    }
    
    // Consecutive losses check
    if (this.metrics.consecutiveLosses >= this.config.pauseAfterConsecutiveLosses) {
      console.log(`⚠️  ${this.metrics.consecutiveLosses} consecutive losses - Pausing new trades`);
      return false;
    }
    
    return true;
  }

  async shouldCopyTrade(sourcePosition) {
    // Check risk limits first
    if (!await this.checkRiskLimits()) {
      return false;
    }
    
    // Check daily trade limit
    if (this.dailyStats.trades >= this.config.maxDailyTrades) {
      console.log('📋 Daily trade limit reached');
      return false;
    }
    
    // Check concurrent positions
    if (this.dailyStats.openPositions.size >= this.config.maxConcurrentPositions) {
      console.log('📋 Maximum concurrent positions reached');
      return false;
    }
    
    // Check positions per symbol
    const symbolPositions = Array.from(this.dailyStats.openPositions.values())
      .filter(p => p.symbol === sourcePosition.symbol).length;
    if (symbolPositions >= this.config.maxPositionsPerSymbol) {
      console.log(`📋 Max positions for ${sourcePosition.symbol} reached`);
      return false;
    }
    
    // Check if this is part of a martingale sequence
    if (sourcePosition.volume > this.config.maxMartingaleSize) {
      console.log(`⚠️  Skipping martingale trade with size ${sourcePosition.volume}`);
      return false;
    }
    
    // Check time between trades
    const lastTradeTime = Math.max(...Array.from(this.dailyStats.openPositions.values())
      .map(p => p.openTime || 0));
    if (Date.now() - lastTradeTime < this.config.minTimeBetweenTrades) {
      console.log('⏱️  Too soon since last trade');
      return false;
    }
    
    // Check martingale sequence duration
    for (const [id, sequence] of this.metrics.martingaleSequences) {
      if (Date.now() - sequence.startTime > this.config.martingaleTimeLimit) {
        console.log(`⚠️  Martingale sequence ${id} exceeded time limit`);
        this.metrics.martingaleSequences.delete(id);
      }
    }
    
    return true;
  }

  async copyPosition(sourcePosition) {
    try {
      if (!await this.shouldCopyTrade(sourcePosition)) {
        return;
      }
      
      const symbol = this.config.symbolMapping[sourcePosition.symbol] || sourcePosition.symbol;
      const lotSize = this.calculateLotSize(sourcePosition.volume);
      
      if (lotSize < this.config.minLotSize) {
        console.log(`❌ Calculated lot size ${lotSize} below minimum`);
        return;
      }
      
      console.log(`\n📋 Copying trade (Phase ${this.config.phase}):`);
      console.log(`   Symbol: ${symbol}`);
      console.log(`   Direction: ${sourcePosition.type}`);
      console.log(`   Source lots: ${sourcePosition.volume}`);
      console.log(`   Target lots: ${lotSize}`);
      console.log(`   Phase multiplier: ${this.getCurrentPhaseConfig().multiplier}x`);
      
      // Execute trade
      const order = await this.targetAccount.createOrder({
        symbol: symbol,
        actionType: sourcePosition.type === 'POSITION_TYPE_BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
        volume: lotSize,
        comment: `Tiger-Hybrid P${this.config.phase} #${sourcePosition.id}`
      });
      
      // Track position
      this.dailyStats.openPositions.set(order.positionId, {
        id: order.positionId,
        symbol: symbol,
        volume: lotSize,
        openTime: Date.now(),
        sourceId: sourcePosition.id,
        type: sourcePosition.type
      });
      
      // Update metrics
      this.dailyStats.trades++;
      this.metrics.totalTrades++;
      
      // Check for martingale pattern
      const recentSameSymbol = Array.from(this.dailyStats.openPositions.values())
        .filter(p => p.symbol === symbol && p.id !== order.positionId)
        .length;
      if (recentSameSymbol > 0) {
        if (!this.metrics.martingaleSequences.has(symbol)) {
          this.metrics.martingaleSequences.set(symbol, {
            startTime: Date.now(),
            positions: []
          });
        }
        this.metrics.martingaleSequences.get(symbol).positions.push(order.positionId);
      }
      
      console.log(`✅ Trade copied successfully: #${order.positionId}`);
      
      // Log trade
      this.logTrade({
        time: new Date().toISOString(),
        phase: this.config.phase,
        sourcePosition: sourcePosition.id,
        targetPosition: order.positionId,
        symbol: symbol,
        type: sourcePosition.type,
        sourceLots: sourcePosition.volume,
        targetLots: lotSize,
        balance: this.dailyStats.currentBalance
      });
      
    } catch (error) {
      console.error(`❌ Error copying position: ${error.message}`);
    }
  }

  async closePosition(sourcePositionId) {
    try {
      // Find corresponding position
      let targetPosition = null;
      for (const [id, pos] of this.dailyStats.openPositions.entries()) {
        if (pos.sourceId === sourcePositionId) {
          targetPosition = { id, ...pos };
          break;
        }
      }
      
      if (!targetPosition) {
        return;
      }
      
      // Get position details before closing
      const positions = await this.targetAccount.getPositions();
      const positionDetails = positions.find(p => p.id === targetPosition.id);
      
      if (!positionDetails) {
        this.dailyStats.openPositions.delete(targetPosition.id);
        return;
      }
      
      // Close position
      await this.targetAccount.closePosition(targetPosition.id);
      this.dailyStats.openPositions.delete(targetPosition.id);
      
      // Update metrics based on profit/loss
      const profit = positionDetails.profit || 0;
      if (profit > 0) {
        this.metrics.winningTrades++;
        this.metrics.consecutiveLosses = 0;
        if (profit > this.metrics.largestWin) {
          this.metrics.largestWin = profit;
        }
      } else if (profit < 0) {
        this.metrics.losingTrades++;
        this.metrics.consecutiveLosses++;
        if (Math.abs(profit) > Math.abs(this.metrics.largestLoss)) {
          this.metrics.largestLoss = profit;
        }
      }
      
      console.log(`✅ Closed position #${targetPosition.id} | P/L: $${profit.toFixed(2)}`);
      
      // Update high water mark
      const accountInfo = await this.targetAccount.getAccountInformation();
      if (accountInfo.balance > this.metrics.highWaterMark) {
        this.metrics.highWaterMark = accountInfo.balance;
      }
      
      // Check for phase upgrade
      this.checkPhaseUpgrade();
      
    } catch (error) {
      console.error(`❌ Error closing position: ${error.message}`);
    }
  }

  checkPhaseUpgrade() {
    // Only upgrade after minimum evaluation period
    const daysSinceStart = (Date.now() - this.metrics.startTime) / (1000 * 60 * 60 * 24);
    if (daysSinceStart < 7) return; // Wait at least 1 week
    
    const winRate = this.metrics.totalTrades > 0 
      ? (this.metrics.winningTrades / this.metrics.totalTrades * 100) 
      : 0;
    
    const profitPercent = ((this.metrics.currentBalance - this.metrics.startBalance) / this.metrics.startBalance * 100);
    
    // Phase upgrade criteria
    if (this.config.phase === 1 && winRate >= this.config.minWinRateForScaleUp && profitPercent > 2) {
      this.config.phase = 2;
      this.metrics.phaseUpgradeDate = new Date().toISOString();
      console.log(`\n🎯 PHASE UPGRADE: Moving to Phase 2 (Moderate)`);
      console.log(`   Win Rate: ${winRate.toFixed(1)}%`);
      console.log(`   Profit: ${profitPercent.toFixed(2)}%`);
      this.saveMetrics();
    } else if (this.config.phase === 2 && daysSinceStart > 14 && winRate >= 65 && profitPercent > 5) {
      this.config.phase = 3;
      console.log(`\n🎯 PHASE UPGRADE: Moving to Phase 3 (Full Size)`);
      this.saveMetrics();
    }
  }

  async emergencyCloseAll() {
    console.log('🛑 EMERGENCY CLOSE - Closing all positions immediately!');
    const positions = await this.targetAccount.getPositions();
    
    for (const position of positions) {
      try {
        await this.targetAccount.closePosition(position.id);
        console.log(`✅ Emergency closed position #${position.id}`);
      } catch (error) {
        console.error(`❌ Failed to close position #${position.id}: ${error.message}`);
      }
    }
    
    this.dailyStats.openPositions.clear();
    this.saveMetrics();
  }

  logTrade(trade) {
    const logEntry = JSON.stringify(trade) + '\n';
    fs.appendFileSync(this.config.logFile, logEntry);
  }

  saveMetrics() {
    const metricsData = {
      ...this.metrics,
      currentPhase: this.config.phase,
      lastUpdate: new Date().toISOString()
    };
    fs.writeFileSync(this.config.metricsFile, JSON.stringify(metricsData, null, 2));
  }

  loadMetrics() {
    try {
      if (fs.existsSync(this.config.metricsFile)) {
        const data = JSON.parse(fs.readFileSync(this.config.metricsFile, 'utf8'));
        // Restore relevant metrics
        this.metrics.totalTrades = data.totalTrades || 0;
        this.metrics.winningTrades = data.winningTrades || 0;
        this.metrics.losingTrades = data.losingTrades || 0;
        this.config.phase = data.currentPhase || 1;
        console.log(`📊 Loaded existing metrics - Phase ${this.config.phase}`);
      }
    } catch (error) {
      console.log('📊 Starting fresh metrics tracking');
    }
  }

  async displayStatus() {
    const accountInfo = await this.targetAccount.getAccountInformation();
    const profit = accountInfo.balance - this.metrics.startBalance;
    const profitPercent = (profit / this.metrics.startBalance * 100);
    const winRate = this.metrics.totalTrades > 0 
      ? (this.metrics.winningTrades / this.metrics.totalTrades * 100) 
      : 0;
    
    console.log(`\n📊 PERFORMANCE UPDATE - Phase ${this.config.phase}`);
    console.log('═'.repeat(50));
    console.log(`Balance: $${accountInfo.balance.toFixed(2)} (${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);
    console.log(`Equity: $${accountInfo.equity.toFixed(2)}`);
    console.log(`Profit: $${profit.toFixed(2)}`);
    console.log(`Win Rate: ${winRate.toFixed(1)}% (${this.metrics.winningTrades}/${this.metrics.totalTrades})`);
    console.log(`Open Positions: ${this.dailyStats.openPositions.size}`);
    console.log(`Daily Trades: ${this.dailyStats.trades}/${this.config.maxDailyTrades}`);
    
    // Progress to targets
    const phase1Progress = (profitPercent / this.config.targetPhase1 * 100);
    const phase2Progress = Math.max(0, (profitPercent - this.config.targetPhase1) / this.config.targetPhase2 * 100);
    
    console.log(`\n🎯 Progress:`);
    console.log(`Phase 1 (8%): ${phase1Progress.toFixed(1)}% complete`);
    if (profitPercent > this.config.targetPhase1) {
      console.log(`Phase 2 (5%): ${phase2Progress.toFixed(1)}% complete`);
    }
  }

  async startCopying() {
    this.isRunning = true;
    console.log('\n🚀 Starting hybrid copy trading...');
    
    // Connect to source account
    const sourceConnection = await this.sourceAccount.connect();
    
    // Subscribe to position updates
    sourceConnection.addSynchronizationListener({
      onPositionUpdate: async (position) => {
        if (!this.isRunning) return;
        
        if (position.updateType === 'created') {
          console.log(`\n🆕 New position detected in Gold account`);
          await this.copyPosition(position);
        } else if (position.updateType === 'closed') {
          console.log(`\n🔚 Position closed in Gold account`);
          await this.closePosition(position.id);
        }
      }
    });
    
    // Daily reset (8 PM EST = 1 AM UTC)
    setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === 1 && now.getUTCMinutes() === 0) {
        console.log('\n📅 Daily reset');
        this.dailyStats = {
          date: new Date().toDateString(),
          startBalance: this.metrics.currentBalance,
          currentBalance: this.metrics.currentBalance,
          trades: 0,
          openPositions: new Map(this.dailyStats.openPositions),
          highPoint: this.metrics.currentBalance,
          lowPoint: this.metrics.currentBalance,
          volatility: 0
        };
        this.saveMetrics();
      }
    }, 60000);
    
    // Status updates every 5 minutes
    setInterval(async () => {
      if (!this.isRunning) return;
      await this.displayStatus();
    }, 300000);
    
    // Save metrics every hour
    setInterval(() => {
      this.saveMetrics();
    }, 3600000);
  }

  async stop() {
    console.log('\n⏹️  Stopping copy trader...');
    this.isRunning = false;
    await this.emergencyCloseAll();
    this.saveMetrics();
  }
}

// Main execution
async function main() {
  console.log('🐯 Tiger Funded Hybrid Copy Trading System');
  console.log('═'.repeat(50));
  console.log('Balancing Risk Manager caution with Quant Analyst optimization');
  console.log('═'.repeat(50));
  
  if (!process.env.TIGER_ACCOUNT_ID) {
    console.error('\n❌ TIGER_ACCOUNT_ID environment variable not set');
    console.log('\n📋 Setup Instructions:');
    console.log('1. Get your Tiger Funded MT4/MT5 account credentials');
    console.log('2. Add the account to MetaApi.cloud');
    console.log('3. Get the account ID from MetaApi dashboard');
    console.log('4. Set environment variable:');
    console.log('   export TIGER_ACCOUNT_ID=your-account-id');
    console.log('5. Run this script again\n');
    return;
  }

  const copyTrader = new TigerFundedHybridCopyTrader(HYBRID_CONFIG);
  
  try {
    await copyTrader.initialize();
    await copyTrader.startCopying();
    
    console.log('\n✅ Hybrid copy trader is running. Press Ctrl+C to stop.');
    console.log('\n📊 Phase Progression:');
    console.log('   Phase 1 (Week 1-2): Conservative - 10x multiplier');
    console.log('   Phase 2 (Week 3): Scale up if 60%+ win rate');
    console.log('   Phase 3 (Week 4+): Full size if profitable\n');
    
    // Initial status
    await copyTrader.displayStatus();
    
    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      await copyTrader.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { TigerFundedHybridCopyTrader, HYBRID_CONFIG };