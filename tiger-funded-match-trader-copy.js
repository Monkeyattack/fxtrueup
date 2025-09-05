#!/usr/bin/env node

/**
 * Tiger Funded Match-Trader Copy Trading Setup
 * Uses Match-Trader Platform API instead of MetaApi
 */

import axios from 'axios';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Match-Trader API configuration
const MATCH_TRADER_API = {
  baseUrl: 'https://api.match-trade.com', // Update with actual URL from Tiger Funded
  wsUrl: 'wss://api.match-trade.com/ws', // WebSocket URL if available
  requestLimit: 500, // 500 requests per minute
  requestsThisMinute: 0,
  resetTime: Date.now() + 60000
};

// Source account (Gold Buy Only Service via MetaApi)
const GOLD_ACCOUNT_ID = '58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac';

// Hybrid configuration for Match-Trader
const MATCH_TRADER_CONFIG = {
  // Match-Trader credentials (to be filled)
  email: process.env.TIGER_EMAIL,
  password: process.env.TIGER_PASSWORD,
  accountId: process.env.TIGER_ACCOUNT_ID,
  
  // Same risk parameters as MT5 version
  phase: 1,
  phases: {
    1: { multiplier: 10, riskFactor: 1.0 },
    2: { multiplier: 15, riskFactor: 0.85 },
    3: { multiplier: 20, riskFactor: 0.85 }
  },
  
  maxDailyLossPercent: 3.0,
  emergencyStopPercent: 4.0,
  maxTotalDrawdownPercent: 8.0,
  
  maxLotSize: 2.0,
  maxTotalLots: 3.0,
  minLotSize: 0.01,
  
  maxMartingaleDepth: 2,
  maxMartingaleSize: 0.03,
  martingaleTimeLimit: 4 * 60 * 60 * 1000,
  
  minTimeBetweenTrades: 15 * 60 * 1000,
  maxPositionsPerSymbol: 2,
  maxDailyTrades: 8,
  maxConcurrentPositions: 3,
  
  symbolMapping: {
    'XAUUSD': 'XAUUSD',
    'Gold': 'XAUUSD',
    'GOLD': 'XAUUSD'
  }
};

class MatchTraderClient {
  constructor() {
    this.token = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.symbols = new Map();
    this.positions = new Map();
  }

  async checkRateLimit() {
    if (Date.now() > MATCH_TRADER_API.resetTime) {
      MATCH_TRADER_API.requestsThisMinute = 0;
      MATCH_TRADER_API.resetTime = Date.now() + 60000;
    }
    
    if (MATCH_TRADER_API.requestsThisMinute >= MATCH_TRADER_API.requestLimit - 10) {
      const waitTime = MATCH_TRADER_API.resetTime - Date.now();
      console.log(`⏳ Rate limit approaching, waiting ${Math.ceil(waitTime/1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    MATCH_TRADER_API.requestsThisMinute++;
  }

  async makeRequest(method, endpoint, data = null) {
    await this.checkRateLimit();
    
    const config = {
      method,
      url: `${MATCH_TRADER_API.baseUrl}${endpoint}`,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (this.token) {
      config.headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    if (data) {
      config.data = data;
    }
    
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response?.status === 401 && this.refreshToken) {
        await this.refreshAccessToken();
        return this.makeRequest(method, endpoint, data);
      }
      throw error;
    }
  }

  async login(email, password) {
    try {
      const response = await this.makeRequest('POST', '/auth/login', {
        email,
        password
      });
      
      this.token = response.token;
      this.refreshToken = response.refreshToken;
      this.tokenExpiry = Date.now() + (response.expiresIn * 1000);
      
      console.log('✅ Logged in to Match-Trader');
      return true;
    } catch (error) {
      console.error('❌ Login failed:', error.message);
      return false;
    }
  }

  async refreshAccessToken() {
    try {
      const response = await this.makeRequest('POST', '/auth/refresh', {
        refreshToken: this.refreshToken
      });
      
      this.token = response.token;
      this.tokenExpiry = Date.now() + (response.expiresIn * 1000);
      
      console.log('🔄 Token refreshed');
    } catch (error) {
      console.error('❌ Token refresh failed:', error.message);
      throw error;
    }
  }

  async getSymbols() {
    const symbols = await this.makeRequest('GET', '/symbols');
    symbols.forEach(symbol => {
      this.symbols.set(symbol.name, symbol);
    });
    return this.symbols;
  }

  async getPositions() {
    const positions = await this.makeRequest('GET', '/positions');
    this.positions.clear();
    positions.forEach(pos => {
      this.positions.set(pos.id, pos);
    });
    return this.positions;
  }

  async getBalance() {
    const balance = await this.makeRequest('GET', '/balance');
    return balance;
  }

  async openPosition(symbol, side, volume, comment = '') {
    const symbolInfo = this.symbols.get(symbol);
    if (!symbolInfo) {
      throw new Error(`Symbol ${symbol} not found`);
    }
    
    const position = await this.makeRequest('POST', '/positions/open', {
      symbol,
      side, // 'BUY' or 'SELL'
      volume,
      type: 'MARKET',
      comment
    });
    
    this.positions.set(position.id, position);
    return position;
  }

  async closePosition(positionId, volume = null) {
    const response = await this.makeRequest('POST', `/positions/${positionId}/close`, {
      volume // null = close full position
    });
    
    this.positions.delete(positionId);
    return response;
  }

  async editPosition(positionId, stopLoss = null, takeProfit = null) {
    const response = await this.makeRequest('PUT', `/positions/${positionId}`, {
      stopLoss,
      takeProfit
    });
    
    if (this.positions.has(positionId)) {
      this.positions.set(positionId, response);
    }
    return response;
  }
}

class TigerFundedMatchTraderCopyTrader {
  constructor(config) {
    this.config = config;
    this.matchTrader = new MatchTraderClient();
    this.metaApi = null; // Will be initialized for source account
    this.sourceAccount = null;
    this.isRunning = false;
    
    // Performance tracking (same as MT5 version)
    this.metrics = {
      startTime: Date.now(),
      startBalance: 0,
      currentBalance: 0,
      highWaterMark: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      consecutiveLosses: 0,
      phaseUpgradeDate: null
    };
    
    this.dailyStats = {
      date: new Date().toDateString(),
      startBalance: 0,
      currentBalance: 0,
      trades: 0,
      openPositions: new Map()
    };
    
    // Map MetaApi positions to Match-Trader positions
    this.positionMap = new Map();
  }

  async initialize() {
    console.log('🐯 Tiger Funded Match-Trader Copy Trader - Initializing...');
    console.log(`📊 Starting in Phase ${this.config.phase} (Conservative)`);
    
    try {
      // Connect to Match-Trader
      if (!this.config.email || !this.config.password) {
        throw new Error('TIGER_EMAIL and TIGER_PASSWORD must be set');
      }
      
      await this.matchTrader.login(this.config.email, this.config.password);
      await this.matchTrader.getSymbols();
      
      // Get initial balance
      const balance = await this.matchTrader.getBalance();
      this.metrics.startBalance = balance.balance;
      this.metrics.currentBalance = balance.balance;
      this.metrics.highWaterMark = balance.balance;
      this.dailyStats.startBalance = balance.balance;
      this.dailyStats.currentBalance = balance.balance;
      
      console.log(`\n📊 Tiger Funded Account Info:`);
      console.log(`   Balance: $${balance.balance.toFixed(2)}`);
      console.log(`   Equity: $${balance.equity.toFixed(2)}`);
      console.log(`   Margin: $${balance.margin.toFixed(2)}`);
      console.log(`   Free Margin: $${balance.freeMargin.toFixed(2)}`);
      
      console.log(`\n🎯 Targets:`);
      console.log(`   Phase 1: $${(balance.balance * 1.08).toFixed(2)} (+8%)`);
      console.log(`   Phase 2: $${(balance.balance * 1.13).toFixed(2)} (+13% total)`);
      
      // Initialize MetaApi for source account
      const MetaApi = (await import('metaapi.cloud-sdk')).default;
      this.metaApi = new MetaApi(process.env.METAAPI_TOKEN);
      this.sourceAccount = await this.metaApi.metatraderAccountApi.getAccount(GOLD_ACCOUNT_ID);
      const sourceConnection = await this.sourceAccount.connect();
      await sourceConnection.waitSynchronized();
      console.log('✅ Connected to Gold Buy Only Service (source)');
      
      return { matchTrader: this.matchTrader, sourceConnection };
      
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
    
    // Same calculation as MT5 version
    let baseLots = sourceLots * (targetBalance / sourceBalance) / phaseConfig.multiplier;
    let adjustedLots = baseLots * phaseConfig.riskFactor;
    
    if (this.metrics.consecutiveLosses > 0) {
      adjustedLots *= Math.pow(0.5, this.metrics.consecutiveLosses);
    }
    
    adjustedLots = Math.min(adjustedLots, this.config.maxLotSize);
    adjustedLots = Math.max(adjustedLots, this.config.minLotSize);
    
    // Check total exposure
    let totalExposure = 0;
    this.dailyStats.openPositions.forEach(pos => {
      totalExposure += pos.volume;
    });
    
    if (totalExposure + adjustedLots > this.config.maxTotalLots) {
      adjustedLots = Math.max(0, this.config.maxTotalLots - totalExposure);
    }
    
    return Math.round(adjustedLots * 100) / 100;
  }

  async checkRiskLimits() {
    const balance = await this.matchTrader.getBalance();
    const currentBalance = balance.balance;
    const currentEquity = balance.equity;
    
    this.metrics.currentBalance = currentBalance;
    this.dailyStats.currentBalance = currentBalance;
    
    const dailyLossPercent = (this.dailyStats.startBalance - currentEquity) / this.dailyStats.startBalance * 100;
    const totalDrawdownPercent = (this.metrics.highWaterMark - currentEquity) / this.metrics.highWaterMark * 100;
    
    console.log(`\n📊 Risk Status:`);
    console.log(`   Daily P/L: ${dailyLossPercent.toFixed(2)}%`);
    console.log(`   Drawdown: ${totalDrawdownPercent.toFixed(2)}%`);
    
    if (dailyLossPercent > this.config.emergencyStopPercent) {
      console.log(`🛑 EMERGENCY STOP at ${dailyLossPercent.toFixed(2)}% loss!`);
      await this.emergencyCloseAll();
      this.isRunning = false;
      return false;
    }
    
    if (dailyLossPercent > this.config.maxDailyLossPercent) {
      console.log(`⚠️  DAILY LOSS LIMIT REACHED`);
      return false;
    }
    
    return true;
  }

  async copyPosition(sourcePosition) {
    try {
      if (!await this.checkRiskLimits()) {
        return;
      }
      
      // Check if we should copy
      if (this.dailyStats.trades >= this.config.maxDailyTrades) {
        return;
      }
      
      const symbol = this.config.symbolMapping[sourcePosition.symbol] || sourcePosition.symbol;
      const lotSize = this.calculateLotSize(sourcePosition.volume);
      
      if (lotSize < this.config.minLotSize) {
        return;
      }
      
      console.log(`\n📋 Copying trade (Phase ${this.config.phase}):`);
      console.log(`   Symbol: ${symbol}`);
      console.log(`   Direction: ${sourcePosition.type}`);
      console.log(`   Source lots: ${sourcePosition.volume}`);
      console.log(`   Target lots: ${lotSize}`);
      
      // Convert MetaApi position type to Match-Trader side
      const side = sourcePosition.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL';
      
      // Open position on Match-Trader
      const position = await this.matchTrader.openPosition(
        symbol,
        side,
        lotSize,
        `Copy P${this.config.phase} #${sourcePosition.id}`
      );
      
      // Track position mapping
      this.positionMap.set(sourcePosition.id, position.id);
      this.dailyStats.openPositions.set(position.id, {
        id: position.id,
        symbol: symbol,
        volume: lotSize,
        openTime: Date.now(),
        sourceId: sourcePosition.id
      });
      
      this.dailyStats.trades++;
      this.metrics.totalTrades++;
      
      console.log(`✅ Trade copied: #${position.id}`);
      
    } catch (error) {
      console.error(`❌ Error copying position: ${error.message}`);
    }
  }

  async closePosition(sourcePositionId) {
    try {
      const targetPositionId = this.positionMap.get(sourcePositionId);
      
      if (!targetPositionId) {
        return;
      }
      
      // Get current positions to check P/L
      await this.matchTrader.getPositions();
      const position = this.matchTrader.positions.get(targetPositionId);
      
      if (!position) {
        this.positionMap.delete(sourcePositionId);
        return;
      }
      
      // Close position
      await this.matchTrader.closePosition(targetPositionId);
      
      // Update metrics
      const profit = position.profit || 0;
      if (profit > 0) {
        this.metrics.winningTrades++;
        this.metrics.consecutiveLosses = 0;
      } else if (profit < 0) {
        this.metrics.losingTrades++;
        this.metrics.consecutiveLosses++;
      }
      
      // Clean up tracking
      this.positionMap.delete(sourcePositionId);
      this.dailyStats.openPositions.delete(targetPositionId);
      
      console.log(`✅ Closed position #${targetPositionId} | P/L: $${profit.toFixed(2)}`);
      
      // Update high water mark
      const balance = await this.matchTrader.getBalance();
      if (balance.balance > this.metrics.highWaterMark) {
        this.metrics.highWaterMark = balance.balance;
      }
      
    } catch (error) {
      console.error(`❌ Error closing position: ${error.message}`);
    }
  }

  async emergencyCloseAll() {
    console.log('🛑 EMERGENCY CLOSE - Closing all positions!');
    await this.matchTrader.getPositions();
    
    for (const [id, position] of this.matchTrader.positions) {
      try {
        await this.matchTrader.closePosition(id);
        console.log(`✅ Emergency closed position #${id}`);
      } catch (error) {
        console.error(`❌ Failed to close position #${id}: ${error.message}`);
      }
    }
    
    this.dailyStats.openPositions.clear();
    this.positionMap.clear();
  }

  async startCopying() {
    this.isRunning = true;
    console.log('\n🚀 Starting Match-Trader copy trading...');
    
    const sourceConnection = await this.sourceAccount.connect();
    
    // Subscribe to MetaApi position updates
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
    
    // Periodic status updates
    setInterval(async () => {
      if (!this.isRunning) return;
      
      const balance = await this.matchTrader.getBalance();
      const profit = balance.balance - this.metrics.startBalance;
      const profitPercent = (profit / this.metrics.startBalance * 100);
      
      console.log(`\n📊 Status - Phase ${this.config.phase}`);
      console.log(`Balance: $${balance.balance.toFixed(2)} (${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);
      console.log(`Positions: ${this.dailyStats.openPositions.size}`);
      console.log(`Daily trades: ${this.dailyStats.trades}`);
    }, 300000); // Every 5 minutes
    
    // Daily reset at 8 PM EST (1 AM UTC)
    setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === 1 && now.getUTCMinutes() === 0) {
        console.log('\n📅 Daily reset');
        this.dailyStats = {
          date: new Date().toDateString(),
          startBalance: this.metrics.currentBalance,
          currentBalance: this.metrics.currentBalance,
          trades: 0,
          openPositions: new Map(this.dailyStats.openPositions)
        };
      }
    }, 60000);
  }

  async stop() {
    console.log('\n⏹️  Stopping copy trader...');
    this.isRunning = false;
    await this.emergencyCloseAll();
  }
}

// Main execution
async function main() {
  console.log('🐯 Tiger Funded Match-Trader Copy Trading System');
  console.log('═'.repeat(50));
  
  if (!process.env.TIGER_EMAIL || !process.env.TIGER_PASSWORD) {
    console.error('\n❌ Missing Match-Trader credentials');
    console.log('\n📋 Setup Instructions:');
    console.log('1. Get your Tiger Funded Match-Trader login credentials');
    console.log('2. Set environment variables:');
    console.log('   export TIGER_EMAIL=your-email@example.com');
    console.log('   export TIGER_PASSWORD=your-password');
    console.log('3. Run this script again\n');
    return;
  }

  const copyTrader = new TigerFundedMatchTraderCopyTrader(MATCH_TRADER_CONFIG);
  
  try {
    await copyTrader.initialize();
    await copyTrader.startCopying();
    
    console.log('\n✅ Match-Trader copy trader is running. Press Ctrl+C to stop.\n');
    
    process.on('SIGINT', async () => {
      await copyTrader.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { TigerFundedMatchTraderCopyTrader, MATCH_TRADER_CONFIG };