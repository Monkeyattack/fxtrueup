/**
 * Streaming Copy Trader using MetaAPI real-time events
 * Ensures no trades are missed by using event-driven architecture
 */

import MetaApi from 'metaapi.cloud-sdk';
import poolClient from './poolClient.js';
import { logger } from '../utils/logger.js';
import { tradeTracker } from '../utils/tradeTracker.js';

class StreamingCopyTrader {
  constructor(sourceAccountId, destAccountId, destRegion = 'new-york', config = {}) {
    this.sourceAccountId = sourceAccountId;
    this.destAccountId = destAccountId;
    this.destRegion = destRegion;

    // MetaAPI setup
    this.token = process.env.METAAPI_TOKEN;
    this.api = new MetaApi(this.token, { region: 'london' }); // Source is in London

    // Tracking state
    this.sourcePositions = new Map();
    this.processedTrades = new Set();
    this.isConnected = false;
    this.lastHeartbeat = Date.now();

    // Configuration with defaults
    this.config = {
      fixedLotSize: config.fixedLotSize || null, // null = proportional
      maxDailyTrades: config.maxDailyTrades || 5,
      dailyLossLimit: config.dailyLossLimit || 3540,
      allowedHours: config.allowedHours || [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
      minTimeBetweenTrades: config.minTimeBetweenTrades || 30 * 60 * 1000,
      ...config
    };

    // Daily stats
    this.resetDailyStats();

    // Account info for proportional sizing
    this.sourceAccountInfo = null;
    this.destAccountInfo = null;
  }

  resetDailyStats() {
    const now = new Date();
    this.dailyStats = {
      date: now.toDateString(),
      trades: 0,
      profit: 0,
      loss: 0,
      lastTradeTime: 0
    };
  }

  /**
   * Start streaming connection and monitoring
   */
  async start() {
    logger.info('🚀 Starting Streaming Copy Trader');
    logger.info(`Source: ${this.sourceAccountId} (London)`);
    logger.info(`Destination: ${this.destAccountId} (${this.destRegion})`);

    try {
      // Get source account
      this.account = await this.api.metatraderAccountApi.getAccount(this.sourceAccountId);
      await this.account.waitConnected();

      // Create streaming connection
      this.connection = account.getStreamingConnection();

      // Add event listeners
      this.connection.addSynchronizationListener({
        onConnected: () => {
          logger.info('✅ Streaming connection established');
          this.isConnected = true;
          this.lastHeartbeat = Date.now();
        },

        onDisconnected: () => {
          logger.warn('⚠️  Streaming connection lost');
          this.isConnected = false;
        },

        onDealAdded: async (deal) => {
          logger.info(`📊 New deal detected: ${deal.type} ${deal.symbol} ${deal.volume} lots`);
          await this.handleNewDeal(deal);
        },

        onPositionUpdated: async (position) => {
          await this.handlePositionUpdate(position);
        },

        onPositionRemoved: async (position) => {
          logger.info(`📉 Position closed: ${position.symbol}`);
          this.sourcePositions.delete(position.id);
        },

        onAccountInformationUpdated: (info) => {
          this.sourceAccountInfo = info;
          logger.info(`💰 Account updated - Balance: $${info.balance}, Equity: $${info.equity}`);
        }
      });

      // Get initial account info
      await this.connection.connect();
      await this.connection.waitSynchronized();

      // Get destination account info for proportional sizing
      this.destAccountInfo = await poolClient.getAccountInfo(this.destAccountId, this.destRegion);

      // Initial positions sync
      const positions = await this.connection.getPositions();
      positions.forEach(pos => {
        this.sourcePositions.set(pos.id, pos);
        this.processedTrades.add(pos.id); // Don't copy existing positions
      });

      logger.info(`📊 Initial positions: ${positions.length}`);

      // Start heartbeat monitor
      this.startHeartbeatMonitor();

      // Daily reset timer
      this.startDailyReset();

    } catch (error) {
      logger.error('Failed to start streaming copy trader:', error);
      throw error;
    }
  }

  /**
   * Handle new deal (trade execution)
   */
  async handleNewDeal(deal) {
    try {
      // Only process DEAL_TYPE_BUY or DEAL_TYPE_SELL
      if (deal.type !== 'DEAL_TYPE_BUY' && deal.type !== 'DEAL_TYPE_SELL') {
        return;
      }

      // Check if already processed
      if (this.processedTrades.has(deal.positionId)) {
        return;
      }

      // Apply filters
      if (!this.shouldCopyTrade(deal)) {
        logger.info(`🚫 Trade filtered out: ${deal.symbol}`);
        return;
      }

      // Mark as processed
      this.processedTrades.add(deal.positionId);

      // Calculate lot size
      const lotSize = this.calculateLotSize(deal.volume);

      // Execute copy trade
      const action = deal.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL';

      logger.info(`📋 Copying trade: ${action} ${lotSize} ${deal.symbol}`);

      const result = await poolClient.executeTrade(
        this.destAccountId,
        this.destRegion,
        {
          symbol: deal.symbol,
          volume: lotSize,
          action: action,
          comment: `Copy from ${this.sourceAccountId.substring(0, 8)}`
        }
      );

      if (result.success) {
        this.dailyStats.trades++;
        this.dailyStats.lastTradeTime = Date.now();
        logger.info(`✅ Trade copied successfully: ${result.orderId}`);
      } else {
        logger.error(`❌ Failed to copy trade: ${result.error}`);
      }

    } catch (error) {
      logger.error('Error handling new deal:', error);
    }
  }

  /**
   * Handle position updates
   */
  async handlePositionUpdate(position) {
    // Track position updates for monitoring
    this.sourcePositions.set(position.id, position);

    // Update P&L tracking
    if (position.profit !== undefined) {
      if (position.profit < 0) {
        this.dailyStats.loss = Math.abs(position.profit);
      }
    }
  }

  /**
   * Apply trade filters
   */
  shouldCopyTrade(deal) {
    // Check daily trade limit
    if (this.dailyStats.trades >= this.config.maxDailyTrades) {
      logger.info(`Daily trade limit reached (${this.config.maxDailyTrades})`);
      return false;
    }

    // Check daily loss limit
    if (this.dailyStats.loss >= this.config.dailyLossLimit) {
      logger.info(`Daily loss limit reached ($${this.config.dailyLossLimit})`);
      return false;
    }

    // Check time between trades
    if (this.dailyStats.lastTradeTime > 0) {
      const timeSinceLastTrade = Date.now() - this.dailyStats.lastTradeTime;
      if (timeSinceLastTrade < this.config.minTimeBetweenTrades) {
        logger.info(`Too soon since last trade (${Math.round(timeSinceLastTrade / 60000)} minutes)`);
        return false;
      }
    }

    // Check allowed hours
    const hour = new Date().getUTCHours();
    if (!this.config.allowedHours.includes(hour)) {
      logger.info(`Outside allowed trading hours (current: ${hour} UTC)`);
      return false;
    }

    return true;
  }

  /**
   * Calculate lot size (fixed or proportional)
   */
  calculateLotSize(sourceLots) {
    if (this.config.fixedLotSize) {
      return this.config.fixedLotSize;
    }

    // Proportional sizing based on account equity
    if (this.sourceAccountInfo && this.destAccountInfo) {
      const ratio = this.destAccountInfo.equity / this.sourceAccountInfo.equity;
      const calculatedLots = sourceLots * ratio;

      // Round to 2 decimal places
      return Math.round(calculatedLots * 100) / 100;
    }

    // Default to source lot size if can't calculate
    return sourceLots;
  }

  /**
   * Monitor connection health
   */
  startHeartbeatMonitor() {
    this.heartbeatInterval = setInterval(() => {
      const timeSinceHeartbeat = Date.now() - this.lastHeartbeat;

      if (timeSinceHeartbeat > 60000 && this.isConnected) {
        logger.warn('⚠️  No heartbeat for 60 seconds, checking connection...');
        this.checkConnection();
      }

      // Log stats every 30 seconds
      logger.info(`📊 Daily stats - Trades: ${this.dailyStats.trades}, Loss: $${this.dailyStats.loss}`);

    }, 30000);
  }

  /**
   * Check and restore connection if needed
   */
  async checkConnection() {
    try {
      const account = await this.connection.getAccountInformation();
      if (account) {
        this.lastHeartbeat = Date.now();
        logger.info('✅ Connection verified');
      }
    } catch (error) {
      logger.error('❌ Connection check failed:', error);
      // Try to reconnect
      await this.reconnect();
    }
  }

  /**
   * Reconnect to streaming API
   */
  async reconnect() {
    logger.info('🔄 Attempting to reconnect...');
    try {
      await this.connection.close();
      await this.connection.connect();
      await this.connection.waitSynchronized();
      logger.info('✅ Reconnected successfully');
    } catch (error) {
      logger.error('❌ Reconnection failed:', error);
    }
  }

  /**
   * Daily stats reset
   */
  startDailyReset() {
    // Calculate milliseconds until midnight UTC
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    const msUntilMidnight = midnight - now;

    // Reset at midnight
    setTimeout(() => {
      this.resetDailyStats();
      logger.info('📅 Daily stats reset');

      // Set up daily interval
      this.dailyResetInterval = setInterval(() => {
        this.resetDailyStats();
        logger.info('📅 Daily stats reset');
      }, 24 * 60 * 60 * 1000);

    }, msUntilMidnight);
  }

  /**
   * Stop the copy trader
   */
  async stop() {
    logger.info('🛑 Stopping streaming copy trader...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.dailyResetInterval) {
      clearInterval(this.dailyResetInterval);
    }

    if (this.connection) {
      await this.connection.close();
    }

    logger.info('✅ Streaming copy trader stopped');
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      isConnected: this.isConnected,
      sourcePositions: this.sourcePositions.size,
      processedTrades: this.processedTrades.size,
      dailyTrades: this.dailyStats.trades,
      dailyLoss: this.dailyStats.loss,
      lastTradeTime: this.dailyStats.lastTradeTime
    };
  }
}

export default StreamingCopyTrader;