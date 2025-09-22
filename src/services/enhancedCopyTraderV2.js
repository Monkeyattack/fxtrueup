import { logger } from '../utils/logger.js';
import poolClient from './poolClient.js';
import shortSqueezeClient from './shortSqueezeClient.js';
import MetaApi from 'metaapi.cloud-sdk';

/**
 * Event-driven Enhanced Copy Trader
 * Listens for position events instead of polling
 */
class EnhancedCopyTraderV2 {
  constructor(config = {}) {
    this.config = {
      fixedLotSize: config.fixedLotSize || 0.01,
      stopLossBuffer: config.stopLossBuffer || 10,
      takeProfitBuffer: config.takeProfitBuffer || -5,
      maxOpenPositions: config.maxOpenPositions || 10,
      allowedSymbols: config.allowedSymbols || [],
      minTimeBetweenTrades: config.minTimeBetweenTrades || 5000,
      maxDailyTrades: config.maxDailyTrades || 20,
      allowedHours: config.allowedHours || Array.from({length: 24}, (_, i) => i),
      shortSqueeze: {
        enabled: config.shortSqueeze?.enabled || false,
        minSqueezeScore: config.shortSqueeze?.minSqueezeScore || 0.5,
        squeezeStopLossBuffer: config.shortSqueeze?.squeezeStopLossBuffer || 5,
        squeezeLotMultiplier: config.shortSqueeze?.squeezeLotMultiplier || 1.2,
        allowedSymbols: config.shortSqueeze?.allowedSymbols || ['XAU', 'GOLD']
      },
      metaApiToken: process.env.METAAPI_TOKEN,
      ...config
    };

    this.sourceAccountId = null;
    this.destAccountId = null;
    this.destRegion = 'new-york';

    // Event-driven state
    this.streamingConnection = null;
    this.synchronizationListener = null;
    this.sourcePositions = new Map();
    this.destPositions = new Map();
    this.copiedPositions = new Set(); // Track which positions we've already copied

    // Stats tracking
    this.dailyStats = { date: new Date().toDateString(), trades: 0, profit: 0, squeezeTrades: 0 };
    this.lastTradeTime = 0;
  }

  /**
   * Initialize event-driven copy trader
   */
  async initialize(sourceAccountId, destAccountId, destRegion = 'new-york') {
    this.sourceAccountId = sourceAccountId;
    this.destAccountId = destAccountId;
    this.destRegion = destRegion;

    logger.info('🚀 Initializing Event-Driven Enhanced Copy Trader');
    logger.info(`Source: ${sourceAccountId}`);
    logger.info(`Destination: ${destAccountId}`);

    // Initialize MetaAPI connection for streaming
    const api = new MetaApi(this.config.metaApiToken);
    const account = await api.metatraderAccountApi.getAccount(this.sourceAccountId);

    // Ensure account is deployed
    if (account.state !== 'DEPLOYED') {
      logger.info('Deploying source account...');
      await account.deploy();
    }

    // Wait for connection
    logger.info('Waiting for source account connection...');
    await account.waitConnected();

    // Create streaming connection
    this.streamingConnection = account.getStreamingConnection();

    // Create synchronization listener
    this.synchronizationListener = {
      // Called when a new position is opened
      onPositionUpdate: async (position) => {
        try {
          await this.handlePositionUpdate(position);
        } catch (error) {
          logger.error('Error handling position update:', error);
        }
      },

      // Called when a position is closed
      onPositionRemoved: async (positionId) => {
        try {
          logger.info(`Position closed: ${positionId}`);
          this.sourcePositions.delete(positionId);
          this.copiedPositions.delete(positionId);
        } catch (error) {
          logger.error('Error handling position removal:', error);
        }
      },

      // Called for account updates
      onAccountInformationUpdate: (accountInfo) => {
        logger.debug('Account info updated:', accountInfo.equity);
      }
    };

    // Add listener
    this.streamingConnection.addSynchronizationListener(this.synchronizationListener);

    // Connect and synchronize
    logger.info('Connecting to streaming API...');
    await this.streamingConnection.connect();
    await this.streamingConnection.waitSynchronized();

    logger.info('✅ Event-driven copy trader initialized successfully');

    // Get initial positions
    await this.syncInitialPositions();
  }

  /**
   * Sync initial positions on startup
   */
  async syncInitialPositions() {
    try {
      // Get current positions from both accounts
      const sourcePositions = await poolClient.getPositions(this.sourceAccountId, 'london');
      const destPositions = await poolClient.getPositions(this.destAccountId, this.destRegion);

      // Update maps
      sourcePositions.forEach(pos => {
        this.sourcePositions.set(pos.id, pos);
      });

      destPositions.forEach(pos => {
        this.destPositions.set(pos.id, pos);
        // Mark as copied if it has a source reference in comment
        if (pos.comment && pos.comment.includes('Copy_')) {
          const sourceId = this.extractSourceId(pos.comment);
          if (sourceId) {
            this.copiedPositions.add(sourceId);
          }
        }
      });

      logger.info(`📊 Initial sync: ${sourcePositions.length} source, ${destPositions.length} dest positions`);
    } catch (error) {
      logger.error('Error syncing initial positions:', error);
    }
  }

  /**
   * Handle position update event
   */
  async handlePositionUpdate(position) {
    logger.info(`📈 Position update event: ${position.symbol} ${position.type} (${position.id})`);

    // Update source positions map
    this.sourcePositions.set(position.id, position);

    // Check if already copied
    if (this.copiedPositions.has(position.id)) {
      logger.debug(`Position ${position.id} already copied, skipping`);
      return;
    }

    // Process new position
    await this.processNewPosition(position);
  }

  /**
   * Process a new position for copying
   */
  async processNewPosition(position) {
    try {
      // Check filters
      const { shouldCopy, reasons, squeezeData } = await this.shouldCopyTrade(position);

      if (!shouldCopy) {
        logger.info(`❌ Not copying position: ${reasons.join(', ')}`);
        return;
      }

      // Real-time check: Query destination to ensure no duplicate
      const currentDestPositions = await poolClient.getPositions(this.destAccountId, this.destRegion);
      const alreadyExists = currentDestPositions.some(pos =>
        pos.comment && pos.comment.includes(position.id)
      );

      if (alreadyExists) {
        logger.warn(`Position ${position.id} already exists in destination, skipping`);
        this.copiedPositions.add(position.id);
        return;
      }

      // Execute copy trade
      const result = await this.executeCopyTrade(position, squeezeData);

      if (result.success) {
        this.copiedPositions.add(position.id);
        logger.info(`✅ Successfully copied position ${position.id} -> ${result.orderId}`);
      }

    } catch (error) {
      logger.error(`Error processing position ${position.id}:`, error);
    }
  }

  /**
   * Determine if a trade should be copied
   */
  async shouldCopyTrade(trade) {
    const reasons = [];
    let squeezeData = null;

    // Run basic filters
    if (!await this.runBasicFilters(trade, reasons)) {
      return { shouldCopy: false, reasons, squeezeData };
    }

    // Check for short squeeze opportunity if enabled
    if (this.config.shortSqueeze.enabled &&
        this.config.shortSqueeze.allowedSymbols.some(s => trade.symbol.includes(s))) {

      squeezeData = await this.getShortSqueezeData(trade.symbol);

      if (squeezeData) {
        logger.info(`🔍 Short squeeze analysis for ${trade.symbol}:`, {
          score: squeezeData.squeezeScore,
          recommendation: squeezeData.recommendation
        });

        // For BUY trades with high squeeze potential
        if (trade.type === 'POSITION_TYPE_BUY' &&
            squeezeData.squeezeScore >= this.config.shortSqueeze.minSqueezeScore) {
          reasons.push(`High squeeze potential detected (score: ${squeezeData.squeezeScore.toFixed(2)})`);
        }

        // For SELL trades with high squeeze potential, skip
        if (trade.type === 'POSITION_TYPE_SELL' &&
            squeezeData.squeezeScore >= this.config.shortSqueeze.minSqueezeScore) {
          reasons.push('⚠️ Avoiding SELL - high squeeze risk');
          return { shouldCopy: false, reasons, squeezeData };
        }
      }
    }

    return { shouldCopy: true, reasons, squeezeData };
  }

  /**
   * Run basic filters
   */
  async runBasicFilters(trade, reasons) {
    // 1. Check position limit
    if (this.destPositions.size >= this.config.maxOpenPositions) {
      reasons.push('⚠️ Max positions reached');
      return false;
    }

    // 2. Check time since last trade
    const timeSinceLastTrade = Date.now() - this.lastTradeTime;
    if (timeSinceLastTrade < this.config.minTimeBetweenTrades) {
      reasons.push('⚠️ Too soon after last trade');
      return false;
    }

    // 3. Check daily trade limit
    if (this.dailyStats.trades >= this.config.maxDailyTrades) {
      reasons.push('⚠️ Daily trade limit reached');
      return false;
    }

    // 4. Check trading hours
    const hour = new Date().getUTCHours();
    if (!this.config.allowedHours.includes(hour)) {
      reasons.push('⚠️ Outside trading hours');
      return false;
    }

    // 5. Check allowed symbols
    if (this.config.allowedSymbols.length > 0 &&
        !this.config.allowedSymbols.includes(trade.symbol)) {
      reasons.push('⚠️ Symbol not allowed');
      return false;
    }

    // 6. Detect martingale pattern
    if (this.isMartingalePattern(trade)) {
      reasons.push('⚠️ Martingale pattern detected');
      return false;
    }

    return true;
  }

  /**
   * Execute the copy trade
   */
  async executeCopyTrade(sourceTrade, squeezeData) {
    try {
      logger.info(`📋 Copying trade: ${sourceTrade.symbol} ${sourceTrade.type}`);

      // Calculate position size based on squeeze confidence
      let volume = this.config.fixedLotSize;
      let stopLossBuffer = this.config.stopLossBuffer;
      let comment = `Copy_${sourceTrade.id}`;

      if (squeezeData && squeezeData.squeezeScore >= this.config.shortSqueeze.minSqueezeScore) {
        // For high confidence squeeze setups on BUY trades
        if (sourceTrade.type === 'POSITION_TYPE_BUY') {
          // Apply confidence-based size adjustment
          const sizeMultiplier = 1 + (squeezeData.squeezeScore - 0.5) * 0.4;
          volume = this.config.fixedLotSize * Math.min(sizeMultiplier, this.config.shortSqueeze.squeezeLotMultiplier);
          stopLossBuffer = this.config.shortSqueeze.squeezeStopLossBuffer;
          comment = `Copy_${sourceTrade.id}_SQUEEZE_${squeezeData.squeezeScore.toFixed(2)}`;

          logger.info(`🚀 Squeeze trade enhancement: volume=${volume.toFixed(2)}, score=${squeezeData.squeezeScore.toFixed(2)}`);
          this.dailyStats.squeezeTrades++;
        }
      }

      // Prepare trade data
      const tradeData = {
        symbol: sourceTrade.symbol,
        action: sourceTrade.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
        volume: Number(volume.toFixed(2)),
        stopLoss: this.calculateStopLoss(sourceTrade, stopLossBuffer),
        takeProfit: this.calculateTakeProfit(sourceTrade),
        comment: comment
      };

      // Execute trade
      const result = await poolClient.executeTrade(
        this.destAccountId,
        this.destRegion,
        tradeData
      );

      if (result.success) {
        this.lastTradeTime = Date.now();
        this.dailyStats.trades++;

        // Update destination positions
        const newPosition = {
          id: result.orderId,
          symbol: sourceTrade.symbol,
          type: sourceTrade.type,
          volume: volume,
          comment: comment
        };
        this.destPositions.set(result.orderId, newPosition);

        return { success: true, orderId: result.orderId, squeezeData };
      } else {
        logger.error(`❌ Failed to copy trade: ${result.error}`);
        return { success: false, error: result.error };
      }

    } catch (error) {
      logger.error('Error executing copy trade:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get short squeeze data
   */
  async getShortSqueezeData(symbol) {
    if (shortSqueezeClient) {
      return await shortSqueezeClient.analyzeShortSqueeze(symbol);
    }
    return null;
  }

  /**
   * Calculate stop loss with buffer
   */
  calculateStopLoss(trade, bufferOverride) {
    if (!trade.stopLoss) return null;

    const buffer = bufferOverride || this.config.stopLossBuffer;
    const pipSize = trade.symbol.includes('JPY') ? 0.01 : 0.0001;

    if (trade.type === 'POSITION_TYPE_BUY') {
      return trade.stopLoss - (buffer * pipSize);
    } else {
      return trade.stopLoss + (buffer * pipSize);
    }
  }

  /**
   * Calculate take profit with buffer
   */
  calculateTakeProfit(trade) {
    if (!trade.takeProfit) return null;

    const buffer = this.config.takeProfitBuffer;
    const pipSize = trade.symbol.includes('JPY') ? 0.01 : 0.0001;

    if (trade.type === 'POSITION_TYPE_BUY') {
      return trade.takeProfit + (buffer * pipSize);
    } else {
      return trade.takeProfit - (buffer * pipSize);
    }
  }

  /**
   * Detect martingale pattern
   */
  isMartingalePattern(trade) {
    if (trade.volume > this.config.fixedLotSize * 1.5) {
      return true;
    }

    if (trade.volume > 0.02) {
      return true;
    }

    return false;
  }

  /**
   * Extract source ID from comment
   */
  extractSourceId(comment) {
    const match = comment.match(/Copy_([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  /**
   * Stop the copy trader
   */
  async stop() {
    logger.info('🛑 Stopping event-driven copy trader...');

    if (this.streamingConnection && this.synchronizationListener) {
      this.streamingConnection.removeSynchronizationListener(this.synchronizationListener);
      await this.streamingConnection.close();
    }

    logger.info('✅ Event-driven copy trader stopped');
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      daily: this.dailyStats,
      sourcePositions: this.sourcePositions.size,
      destPositions: this.destPositions.size,
      copiedPositions: this.copiedPositions.size,
      connected: !!this.streamingConnection
    };
  }
}

export default EnhancedCopyTraderV2;
