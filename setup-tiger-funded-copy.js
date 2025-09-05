#!/usr/bin/env node

/**
 * Tiger Funded Copy Trading Setup
 * Copies from Gold Buy Only Service with risk adjustments for prop firm rules
 */

import MetaApi from 'metaapi.cloud-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Source account (Gold Buy Only Service)
const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';

// Configuration for Tiger Funded
const TIGER_CONFIG = {
  // Account details (to be filled)
  targetAccountId: process.env.TIGER_ACCOUNT_ID,
  
  // Risk parameters based on Tiger Funded rules
  maxDailyLossPercent: 4.5,  // Stay under 5% daily limit
  maxTotalDrawdownPercent: 10,  // Stay under 12% total limit
  
  // Position sizing
  riskMultiplier: 0.65,  // Conservative: 65% of calculated size
  maxLotSize: 2.0,  // Cap individual positions
  maxTotalLots: 5.0,  // Cap total exposure
  
  // Martingale controls
  maxMartingaleDepth: 3,  // Limit grid levels
  martingaleMultiplier: 1.5,  // Less aggressive than original 2x
  
  // Trading filters
  minTimeBetweenTrades: 10 * 60 * 1000,  // 10 minutes
  maxPositionsPerSymbol: 3,  // Allow limited grid
  maxDailyTrades: 10,
  
  // Safety features
  enableEmergencyStop: true,
  emergencyStopLoss: 8,  // Stop at 8% loss
  profitProtection: true,
  protectProfitAfter: 5,  // Protect after 5% gain
  
  // Symbol mapping
  symbolMapping: {
    'XAUUSD': 'XAUUSD',
    'Gold': 'XAUUSD',
    'GOLD': 'XAUUSD'
  }
};

class TigerFundedCopyTrader {
  constructor(config) {
    this.config = config;
    this.metaApi = new MetaApi(process.env.METAAPI_TOKEN);
    this.sourceAccount = null;
    this.targetAccount = null;
    this.isRunning = false;
    this.dailyStats = {
      startBalance: 0,
      currentBalance: 0,
      trades: 0,
      openPositions: new Map()
    };
  }

  async initialize() {
    console.log('🐯 Tiger Funded Copy Trader - Initializing...');
    
    // Connect to source account
    this.sourceAccount = await this.metaApi.metatraderAccountApi.getAccount(GOLD_ACCOUNT_ID);
    const sourceConnection = await this.sourceAccount.connect();
    console.log('✅ Connected to Gold Buy Only Service');
    
    // Connect to target account
    this.targetAccount = await this.metaApi.metatraderAccountApi.getAccount(this.config.targetAccountId);
    const targetConnection = await this.targetAccount.connect();
    console.log('✅ Connected to Tiger Funded account');
    
    // Wait for synchronization
    await sourceConnection.waitSynchronized();
    await targetConnection.waitSynchronized();
    
    // Get initial account info
    const accountInfo = await targetConnection.getAccountInformation();
    this.dailyStats.startBalance = accountInfo.balance;
    this.dailyStats.currentBalance = accountInfo.balance;
    
    console.log(`\n📊 Tiger Funded Account Info:`);
    console.log(`   Balance: $${accountInfo.balance.toFixed(2)}`);
    console.log(`   Equity: $${accountInfo.equity.toFixed(2)}`);
    console.log(`   Max Daily Loss: $${(accountInfo.balance * this.config.maxDailyLossPercent / 100).toFixed(2)}`);
    console.log(`   Risk Multiplier: ${this.config.riskMultiplier}`);
  }

  calculateLotSize(sourceLots, sourceBalance = 5000) {
    const targetBalance = this.dailyStats.currentBalance;
    
    // Base calculation: scale by account size ratio
    let baseLots = sourceLots * (targetBalance / sourceBalance);
    
    // Apply risk multiplier for safety
    let adjustedLots = baseLots * this.config.riskMultiplier;
    
    // Apply position limits
    adjustedLots = Math.min(adjustedLots, this.config.maxLotSize);
    
    // Check total exposure
    let totalExposure = 0;
    this.dailyStats.openPositions.forEach(pos => {
      totalExposure += pos.volume;
    });
    
    if (totalExposure + adjustedLots > this.config.maxTotalLots) {
      adjustedLots = Math.max(0, this.config.maxTotalLots - totalExposure);
    }
    
    // Round to valid lot size (0.01 increments)
    adjustedLots = Math.round(adjustedLots * 100) / 100;
    
    return Math.max(0.01, adjustedLots);
  }

  async checkRiskLimits() {
    const accountInfo = await this.targetAccount.getAccountInformation();
    const currentBalance = accountInfo.balance;
    const currentEquity = accountInfo.equity;
    
    // Update balance
    this.dailyStats.currentBalance = currentBalance;
    
    // Check daily loss
    const dailyLoss = (this.dailyStats.startBalance - currentEquity) / this.dailyStats.startBalance * 100;
    if (dailyLoss > this.config.maxDailyLossPercent) {
      console.log(`⚠️  DAILY LOSS LIMIT REACHED: ${dailyLoss.toFixed(2)}%`);
      return false;
    }
    
    // Check total drawdown
    const totalDrawdown = (this.dailyStats.startBalance - currentEquity) / this.dailyStats.startBalance * 100;
    if (totalDrawdown > this.config.maxTotalDrawdownPercent) {
      console.log(`⚠️  TOTAL DRAWDOWN LIMIT REACHED: ${totalDrawdown.toFixed(2)}%`);
      return false;
    }
    
    // Check emergency stop
    if (this.config.enableEmergencyStop && dailyLoss > this.config.emergencyStopLoss) {
      console.log(`🛑 EMERGENCY STOP TRIGGERED: ${dailyLoss.toFixed(2)}% loss`);
      await this.closeAllPositions();
      return false;
    }
    
    // Check profit protection
    if (this.config.profitProtection) {
      const profit = (currentBalance - this.dailyStats.startBalance) / this.dailyStats.startBalance * 100;
      if (profit > this.config.protectProfitAfter && dailyLoss > 2) {
        console.log(`🛡️  PROFIT PROTECTION: Reducing risk after ${profit.toFixed(2)}% gain`);
        this.config.riskMultiplier *= 0.5;
      }
    }
    
    return true;
  }

  async shouldCopyTrade(position) {
    // Check if we're within risk limits
    if (!await this.checkRiskLimits()) {
      return false;
    }
    
    // Check daily trade limit
    if (this.dailyStats.trades >= this.config.maxDailyTrades) {
      console.log('Daily trade limit reached');
      return false;
    }
    
    // Check positions per symbol
    const symbolPositions = Array.from(this.dailyStats.openPositions.values())
      .filter(p => p.symbol === position.symbol).length;
    if (symbolPositions >= this.config.maxPositionsPerSymbol) {
      console.log(`Max positions for ${position.symbol} reached`);
      return false;
    }
    
    // Check time between trades
    const lastTradeTime = Math.max(...Array.from(this.dailyStats.openPositions.values())
      .map(p => p.openTime || 0));
    if (Date.now() - lastTradeTime < this.config.minTimeBetweenTrades) {
      console.log('Too soon since last trade');
      return false;
    }
    
    return true;
  }

  async copyPosition(sourcePosition) {
    try {
      const symbol = this.config.symbolMapping[sourcePosition.symbol] || sourcePosition.symbol;
      const lotSize = this.calculateLotSize(sourcePosition.volume);
      
      if (lotSize === 0) {
        console.log('❌ Lot size calculation resulted in 0, skipping trade');
        return;
      }
      
      // Check if we should copy this trade
      if (!await this.shouldCopyTrade(sourcePosition)) {
        return;
      }
      
      console.log(`\n📋 Copying trade:`);
      console.log(`   Symbol: ${symbol}`);
      console.log(`   Direction: ${sourcePosition.type}`);
      console.log(`   Source lots: ${sourcePosition.volume}`);
      console.log(`   Target lots: ${lotSize}`);
      
      // Execute trade
      const order = await this.targetAccount.createOrder({
        symbol: symbol,
        actionType: sourcePosition.type === 'POSITION_TYPE_BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
        volume: lotSize,
        comment: `Copy from Gold #${sourcePosition.id}`
      });
      
      // Track position
      this.dailyStats.openPositions.set(order.positionId, {
        id: order.positionId,
        symbol: symbol,
        volume: lotSize,
        openTime: Date.now(),
        sourceId: sourcePosition.id
      });
      
      this.dailyStats.trades++;
      
      console.log(`✅ Trade copied successfully: #${order.positionId}`);
      
    } catch (error) {
      console.error(`❌ Error copying position: ${error.message}`);
    }
  }

  async closePosition(sourcePositionId) {
    try {
      // Find corresponding position
      let targetPositionId = null;
      for (const [id, pos] of this.dailyStats.openPositions.entries()) {
        if (pos.sourceId === sourcePositionId) {
          targetPositionId = id;
          break;
        }
      }
      
      if (targetPositionId) {
        await this.targetAccount.closePosition(targetPositionId);
        this.dailyStats.openPositions.delete(targetPositionId);
        console.log(`✅ Closed position #${targetPositionId}`);
      }
    } catch (error) {
      console.error(`❌ Error closing position: ${error.message}`);
    }
  }

  async closeAllPositions() {
    console.log('🛑 Closing all positions...');
    const positions = await this.targetAccount.getPositions();
    
    for (const position of positions) {
      try {
        await this.targetAccount.closePosition(position.id);
        console.log(`✅ Closed position #${position.id}`);
      } catch (error) {
        console.error(`❌ Error closing position #${position.id}: ${error.message}`);
      }
    }
    
    this.dailyStats.openPositions.clear();
  }

  async startCopying() {
    this.isRunning = true;
    console.log('\n🚀 Starting copy trading...');
    
    // Monitor source account for trades
    const sourceConnection = await this.sourceAccount.connect();
    
    // Track existing positions
    const sourcePositions = await sourceConnection.getPositions();
    console.log(`Found ${sourcePositions.length} existing positions in source account`);
    
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
    
    // Daily reset at 8 PM EST (midnight UTC)
    setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
        console.log('\n📅 Daily reset - updating start balance');
        this.dailyStats.startBalance = this.dailyStats.currentBalance;
        this.dailyStats.trades = 0;
        
        // Reset risk multiplier if it was reduced
        this.config.riskMultiplier = TIGER_CONFIG.riskMultiplier;
      }
    }, 60000); // Check every minute
    
    // Status updates
    setInterval(async () => {
      if (!this.isRunning) return;
      
      const accountInfo = await this.targetAccount.getAccountInformation();
      const dailyPL = accountInfo.equity - this.dailyStats.startBalance;
      const dailyPLPercent = (dailyPL / this.dailyStats.startBalance) * 100;
      
      console.log(`\n📊 Status Update:`);
      console.log(`   Balance: $${accountInfo.balance.toFixed(2)}`);
      console.log(`   Equity: $${accountInfo.equity.toFixed(2)}`);
      console.log(`   Daily P/L: $${dailyPL.toFixed(2)} (${dailyPLPercent.toFixed(2)}%)`);
      console.log(`   Open Positions: ${this.dailyStats.openPositions.size}`);
      console.log(`   Daily Trades: ${this.dailyStats.trades}`);
    }, 300000); // Every 5 minutes
  }

  async stop() {
    console.log('\n⏹️  Stopping copy trader...');
    this.isRunning = false;
    await this.closeAllPositions();
  }
}

// Main execution
async function main() {
  if (!process.env.TIGER_ACCOUNT_ID) {
    console.error('❌ TIGER_ACCOUNT_ID environment variable not set');
    console.log('\nTo use this script:');
    console.log('1. Get your Tiger Funded MT4/MT5 account ID from MetaApi');
    console.log('2. Set: export TIGER_ACCOUNT_ID=your-account-id');
    console.log('3. Run this script again');
    return;
  }

  const copyTrader = new TigerFundedCopyTrader(TIGER_CONFIG);
  
  try {
    await copyTrader.initialize();
    await copyTrader.startCopying();
    
    console.log('\n✅ Copy trader is running. Press Ctrl+C to stop.');
    
    // Handle shutdown
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

export { TigerFundedCopyTrader, TIGER_CONFIG };