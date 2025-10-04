/**
 * Filtered Copy Trader using existing MetaAPI setup
 * Copies trades from Gold account with martingale filtering
 */

import unifiedPoolClient from './unifiedPoolClient.js';
import positionMapper from './positionMapper.js';
import OptimizedPositionMonitor from './optimizedPositionMonitor.js';
import { logger } from '../utils/logger.js';
import { tradeTracker } from '../utils/tradeTracker.js';
import telegram from '../utils/telegram.js';

class FilteredCopyTrader {
  constructor(sourceAccountId, destAccountId, destRegion = 'new-york', sourceRegion = 'new-york', routeConfig = null) {
    this.sourceAccountId = sourceAccountId;
    this.destAccountId = destAccountId;
    this.destRegion = destRegion;
    this.sourceRegion = sourceRegion;
    this.routeConfig = routeConfig;

    // Tracking state
    this.sourcePositions = new Map(); // Track source positions
    this.processedTrades = new Set(); // Track which trades we've processed
    this.activeMartingaleCycles = new Map(); // Track martingale sequences
    this.recentTradesBySymbol = new Map(); // Track recent trades per symbol for martingale detection
    this.consecutiveSourceLosses = 0; // Track source account losing streak
    this.lastTradeTime = 0;
    this.tradeTimestamps = []; // Track timestamps for frequency checking

    // Notification methods (can be overridden by advancedRouter)
    this.telegramOverrides = null;
    this.dailyStats = {
      date: new Date().toDateString(),
      trades: 0,
      profit: 0,
      dailyLoss: 0
    };
    
    // Position monitor
    this.positionMonitor = null;
    this.monitorListeners = new Map();

    // Filter configuration
    this.config = {
      maxOpenPositions: 1,
      minTimeBetweenTrades: 30 * 60 * 1000, // 30 minutes
      fixedLotSize: 2.50, // Will be replaced by degressive scaling
      maxDailyTrades: 5,
      priceRangeFilter: 50, // pips
      allowedHours: [], // Empty array means 24/7 trading allowed
      stopLossBuffer: 20, // pips
      takeProfitBuffer: 30, // pips
      dailyLossLimit: 3540, // 3% of $118k
      maxConcurrentCycles: 2, // Max martingale cycles
      // Degressive scaling for martingale
      martingaleScaling: {
        0.01: { multiplier: 8, maxLots: 0.08 },
        0.02: { multiplier: 6, maxLots: 0.12 },
        0.03: { multiplier: 4, maxLots: 0.12 }
      }
    };
  }

  /**
   * Start monitoring and copying trades
   */
  async start() {
    logger.info('🚀 Starting Filtered Copy Trader with Optimized Monitoring');
    logger.info(`Source: ${this.sourceAccountId}`);
    logger.info(`Destination: ${this.destAccountId}`);
    logger.info(`Daily Loss Limit: $${this.config.dailyLossLimit}`);

    // Initial sync of source positions only
    const initialPositions = await unifiedPoolClient.getPositions(this.sourceAccountId, this.sourceRegion);
    const copyExisting = this.copyExistingPositions || this.routeConfig?.copyExistingPositions || false;

    initialPositions.forEach(pos => {
      this.sourcePositions.set(pos.id, pos);
      // Mark existing positions as already processed UNLESS copyExistingPositions is true
      if (!copyExisting) {
        this.processedTrades.add(pos.id);
      }
    });
    logger.info(`📊 Initial source positions: ${initialPositions.length}${copyExisting ? ' (will copy existing)' : ' (skipping existing)'}`);

    // Initialize position monitor
    if (!this.positionMonitor) {
      this.positionMonitor = new OptimizedPositionMonitor(unifiedPoolClient);
    }

    // Set up event listeners
    this.setupMonitorListeners();

    // Start monitoring
    this.positionMonitor.startMonitoring(this.sourceAccountId, this.sourceRegion);

    logger.info('✅ Copy trader started successfully with optimized monitoring');
  }

  /**
   * Set up position monitor event listeners
   */
  setupMonitorListeners() {
    // Handle new positions
    const openHandler = async (event) => {
      if (event.accountId === this.sourceAccountId) {
        const position = event.position;
        if (!this.processedTrades.has(position.id)) {
          // Mark as processed IMMEDIATELY to prevent duplicate triggers
          this.processedTrades.add(position.id);
          this.sourcePositions.set(position.id, position);

          // Get account nickname from config
          const accountNickname = this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId.slice(0, 8);
          logger.info(`🎯 New trade detected from ${accountNickname} (${this.sourceAccountId}):`);
          logger.info(`   Symbol: ${position.symbol}`);
          logger.info(`   Volume: ${position.volume} lots`);
          logger.info(`   Price: ${position.openPrice}`);
          logger.info(`   Position ID: ${position.id}`);
          tradeTracker.detected(position);

          // Send Telegram notification (only once per position)
          await this.notify('notifyPositionDetected', position, this.sourceAccountId);

          // Check daily stats before processing
          if (this.checkDailyStats()) {
            // Process the new trade
            logger.info(`🔄 Processing detected trade ${position.id} for route ${this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId} → ${this.routeConfig?.accounts?.[this.destAccountId]?.nickname || this.destAccountId}`);
            await this.executeCopyTrade(position);
          } else {
            logger.warn(`⚠️ Trade ${position.id} not copied due to daily loss limit`);
          }
        }
      }
    };

    // Handle closed positions
    const closeHandler = async (event) => {
      if (event.accountId === this.sourceAccountId) {
        logger.info(`📉 Position ${event.positionId} closed on ${this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId}`);

        // Get the mapping for this position
        const mapping = await positionMapper.getMapping(this.sourceAccountId, event.positionId);

        if (mapping) {
          // Copy the exit to destination
          await this.copyPositionExit(mapping, event.closeInfo);
        } else {
          logger.warn(`⚠️ No mapping found for closed position ${event.positionId}`);
        }

        // Remove from tracked positions
        this.sourcePositions.delete(event.positionId);
      }
    };

    // Handle position updates (partial close, SL/TP changes)
    const updateHandler = async (event) => {
      if (event.accountId === this.sourceAccountId) {
        const oldPos = event.oldPosition;
        const newPos = event.newPosition;

        // Check for partial close
        if (oldPos.volume > newPos.volume) {
          logger.info(`🔄 Partial close detected for position ${newPos.id}: ${oldPos.volume} → ${newPos.volume}`);
          // Handle partial close if needed
        }

        // Update tracked position
        this.sourcePositions.set(newPos.id, newPos);
      }
    };

    // Store listeners for cleanup
    this.monitorListeners.set('positionOpened', openHandler);
    this.monitorListeners.set('positionClosed', closeHandler);
    this.monitorListeners.set('positionUpdated', updateHandler);

    // Add listeners
    this.positionMonitor.on('positionOpened', openHandler);
    this.positionMonitor.on('positionClosed', closeHandler);
    this.positionMonitor.on('positionUpdated', updateHandler);
  }

  /**
   * Stop the copy trader
   */
  stop() {
    // Remove monitor listeners
    if (this.positionMonitor) {
      for (const [event, handler] of this.monitorListeners) {
        this.positionMonitor.removeListener(event, handler);
      }
      this.positionMonitor.stopMonitoring(this.sourceAccountId);
    }

    logger.info('🛑 Copy trader stopped');
  }

  /**
   * Daily stats check (called by monitor events)
   */
  checkDailyStats() {
    const today = new Date().toDateString();
    if (this.dailyStats.date !== today) {
      this.dailyStats = { date: today, trades: 0, profit: 0, dailyLoss: 0 };
      this.processedTrades.clear(); // Reset processed trades for new day
      logger.info(`📅 New trading day started: ${today}`);
    }

    // Check if we've hit daily loss limit
    if (this.dailyStats.dailyLoss >= this.config.dailyLossLimit) {
      logger.warn(`⚠️ Daily loss limit reached: $${this.dailyStats.dailyLoss}`);
      return false; // Cannot trade
    }

    return true; // Can trade
  }

  /**
   * Get close information for a position from deal history
   */
  async getPositionCloseInfo(positionId) {
    // Position close details are captured in real-time via position monitoring
    // No need to query history API which may not be available
    logger.debug(`Position ${positionId} closed - using real-time data`);
    return {
      closeTime: new Date().toISOString(),
      reason: 'CLOSED',
      profit: 0
    };
  }

  /**
   * Determine the reason for position closure
   */
  determineCloseReason(deal) {
    // Check deal comment for clues
    const comment = (deal.comment || '').toLowerCase();

    if (comment.includes('[tp]') || comment.includes('take profit')) {
      return 'TAKE_PROFIT';
    } else if (comment.includes('[sl]') || comment.includes('stop loss')) {
      return 'STOP_LOSS';
    } else if (comment.includes('so:') || comment.includes('stop out')) {
      return 'STOP_OUT';
    } else if (deal.reason === 'CLIENT') {
      return 'MANUAL';
    } else if (deal.reason === 'EXPERT') {
      return 'EA_CLOSE';
    }

    return 'OTHER';
  }

  /**
   * Determine if a trade should be copied
   */
  async shouldCopyTrade(trade) {
    const reasons = [];

    // 1. Check if we've already processed this trade
    if (this.processedTrades.has(trade.id)) {
      logger.debug(`⏭️ Skipping trade ${trade.id} - already processed (${this.processedTrades.size} trades in set)`);
      return false; // Silent skip - already processed
    }

    // 2. Check daily loss limit
    if (this.dailyStats.dailyLoss >= this.config.dailyLossLimit * 0.8) {
      reasons.push('Approaching daily loss limit');
      tradeTracker.rejected(trade, reasons);
      return false;
    }

    // 3. Check concurrent martingale cycles
    if (this.activeMartingaleCycles.size >= this.config.maxConcurrentCycles) {
      reasons.push('Max martingale cycles reached');
      tradeTracker.rejected(trade, reasons);
      return false;
    }

    // 4. Check time since last trade
    const timeSinceLastTrade = Date.now() - this.lastTradeTime;
    if (timeSinceLastTrade < this.config.minTimeBetweenTrades) {
      reasons.push('Too soon after last trade');
      tradeTracker.rejected(trade, reasons);
      return false;
    }

    // 5. Check daily trade limit
    if (this.dailyStats.trades >= this.config.maxDailyTrades) {
      reasons.push('Daily trade limit reached');
      tradeTracker.rejected(trade, reasons);
      return false;
    }

    // 6. Check trading hours (skip if allowedHours is empty)
    if (this.config.allowedHours.length > 0) {
      const hour = new Date().getUTCHours();
      if (!this.config.allowedHours.includes(hour)) {
        reasons.push('Outside trading hours');
        tradeTracker.rejected(trade, reasons);
        return false;
      }
    }

    // 7. Detect martingale pattern
    if (this.isMartingalePattern(trade)) {
      reasons.push('Martingale pattern detected');
      tradeTracker.rejected(trade, reasons);
      return false;
    }

    // 8. Check for grid pattern (multiple positions at similar prices)
    if (await this.isGridPattern(trade)) {
      reasons.push('Grid pattern detected');
      tradeTracker.rejected(trade, reasons);
      return false;
    }

    // ===== JSON CONFIG FILTER ENFORCEMENT =====
    // Apply filters from routing-config.json if activeFilters is configured
    if (this.config.activeFilters && Array.isArray(this.config.activeFilters)) {
      for (const filter of this.config.activeFilters) {
        const filterResult = await this.applyFilter(filter, trade);
        if (!filterResult.passed) {
          reasons.push(filterResult.reason);
          tradeTracker.rejected(trade, reasons);
          return false;
        }
      }
    }
    
    // Log decision with enhanced details
    const sourceNickname = this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId;
    const destNickname = this.routeConfig?.accounts?.[this.destAccountId]?.nickname || this.destAccountId;

    if (reasons.length > 0) {
      logger.info(`❌ Trade REJECTED for route ${sourceNickname} → ${destNickname}:`);
      logger.info(`   Trade ID: ${trade.id}`);
      logger.info(`   Symbol: ${trade.symbol}`);
      logger.info(`   Volume: ${trade.volume} lots`);
      logger.info(`   Rejection reasons:`);
      reasons.forEach(reason => logger.info(`   - ${reason}`));

      // Send Telegram notification about filter rejection
      await this.notify('notifyFilterRejection', trade, reasons);
    } else {
      logger.info(`✅ Trade ${trade.id} PASSED all filters for route ${sourceNickname} → ${destNickname}`);
    }

    return reasons.length === 0;
  }

  /**
   * Detect martingale pattern - repeated opens on same symbol with escalating lot sizes
   */
  isMartingalePattern(trade) {
    const symbol = trade.symbol;

    // Get recent trades for this symbol
    if (!this.recentTradesBySymbol.has(symbol)) {
      this.recentTradesBySymbol.set(symbol, []);
    }

    const symbolTrades = this.recentTradesBySymbol.get(symbol);

    // Clean up trades older than 1 hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentTrades = symbolTrades.filter(t => t.timestamp > oneHourAgo);
    this.recentTradesBySymbol.set(symbol, recentTrades);

    // Check if we have recent trades on same symbol
    if (recentTrades.length === 0) {
      // First trade on this symbol, record it
      recentTrades.push({ volume: trade.volume, timestamp: Date.now(), type: trade.type });
      return false;
    }

    // Check for escalating lot sizes (martingale pattern)
    const lastTrade = recentTrades[recentTrades.length - 1];

    // Same direction and increasing volume = martingale
    if (lastTrade.type === trade.type && trade.volume > lastTrade.volume * 1.5) {
      logger.info(`⚠️ Martingale pattern detected on ${symbol}:`);
      logger.info(`   Previous: ${lastTrade.volume} lots`);
      logger.info(`   Current: ${trade.volume} lots (${((trade.volume / lastTrade.volume - 1) * 100).toFixed(1)}% increase)`);
      logger.info(`   Pattern: Repeated opens with escalating size`);
      return true;
    }

    // Check for rapid-fire same direction trades (3+ in 30 min)
    const thirtyMinAgo = Date.now() - (30 * 60 * 1000);
    const rapidTrades = recentTrades.filter(t =>
      t.timestamp > thirtyMinAgo && t.type === trade.type
    );

    if (rapidTrades.length >= 2) {
      logger.info(`⚠️ Potential martingale: ${rapidTrades.length + 1} ${trade.type} trades on ${symbol} in 30 minutes`);
      // Don't reject yet, but log it
    }

    // Record this trade
    recentTrades.push({ volume: trade.volume, timestamp: Date.now(), type: trade.type });

    return false;
  }

  /**
   * Detect grid pattern
   */
  async isGridPattern(trade) {
    // Get all open positions on source account
    const sourcePositions = await unifiedPoolClient.getPositions(this.sourceAccountId, 'london');
    
    // Check if there are multiple positions at similar prices
    const similarPricePositions = sourcePositions.filter(pos => {
      if (pos.symbol !== trade.symbol) return false;
      
      const priceDiff = Math.abs(pos.openPrice - trade.openPrice);
      const pipDiff = trade.symbol.includes('JPY') ? priceDiff * 100 : priceDiff * 10000;
      
      return pipDiff < this.config.priceRangeFilter;
    });
    
    return similarPricePositions.length > 1;
  }

  /**
   * Calculate position size with proportional scaling
   */
  calculatePositionSize(sourceLots) {
    // Use configured multiplier from rule set
    const accountSizeMultiplier = this.config.multiplier || 1.0;

    // Calculate proportional lot size
    let destLots = sourceLots * accountSizeMultiplier;

    // Apply daily loss adjustment if needed
    if (this.dailyStats.dailyLoss > 1500) {
      destLots *= 0.7; // Reduce by 30% when approaching loss limit
      logger.info(`📉 Reducing lot size due to daily loss: ${this.dailyStats.dailyLoss}`);
    }

    // Round to 2 decimal places
    destLots = Math.round(destLots * 100) / 100;

    logger.info(`📊 Position sizing: ${sourceLots} lots × ${accountSizeMultiplier} = ${destLots} lots`);
    return destLots;
  }
  
  /**
   * Detect martingale level
   */
  detectMartingaleLevel(trade) {
    // Check if part of existing cycle
    for (const [cycleId, positions] of this.activeMartingaleCycles) {
      const firstPosition = positions[0];
      
      // Same direction and within 50 pips
      if (trade.type === firstPosition.type &&
          Math.abs(trade.openPrice - firstPosition.openPrice) < 0.50) {
        return positions.length + 1; // Next level in cycle
      }
    }
    
    // New cycle if base size
    if (trade.volume === 0.01) {
      return 1;
    }
    
    // Standalone larger position (skip)
    return -1;
  }
  
  /**
   * Execute the copy trade
   */
  async executeCopyTrade(sourceTrade) {
    try {
      // Check if we should copy this trade
      if (!await this.shouldCopyTrade(sourceTrade)) {
        return { success: false, reason: 'Failed validation' };
      }
      
      // NOW check destination (only when needed)
      const destPositions = await unifiedPoolClient.getPositions(this.destAccountId, this.destRegion);
      
      // Check if already copied
      const alreadyCopied = destPositions.some(
        pos => pos.comment && pos.comment.includes(sourceTrade.id)
      );
      if (alreadyCopied) {
        this.processedTrades.add(sourceTrade.id);
        tradeTracker.duplicate(sourceTrade);
        telegram.notifyCopyFailure(sourceTrade, 'Already copied', 'Position already exists in destination account');
        return { success: false, reason: 'Already copied' };
      }
      
      // Calculate position size with degressive scaling
      const destVolume = this.calculatePositionSize(sourceTrade.volume);
      if (destVolume === 0) {
        this.processedTrades.add(sourceTrade.id);
        tradeTracker.rejected(sourceTrade, ['invalid position size']);
        telegram.notifyCopyFailure(sourceTrade, 'Invalid position size', 'Calculated volume is 0');
        return { success: false, reason: 'Invalid position size' };
      }
      
      // Detect martingale level
      const martingaleLevel = this.detectMartingaleLevel(sourceTrade);
      
      const sourceNickname = this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId;
      const destNickname = this.routeConfig?.accounts?.[this.destAccountId]?.nickname || this.destAccountId;
      const multiplier = destVolume / sourceTrade.volume;

      logger.info(`📋 COPYING trade for route ${sourceNickname} → ${destNickname}:`);
      logger.info(`   Symbol: ${sourceTrade.symbol}`);
      logger.info(`   Type: ${sourceTrade.type}`);
      logger.info(`   Source volume: ${sourceTrade.volume} lots`);
      logger.info(`   Destination volume: ${destVolume} lots (${multiplier.toFixed(2)}x multiplier, L${martingaleLevel})`);;
      tradeTracker.sized(sourceTrade, destVolume, martingaleLevel);
      
      // Prepare trade data
      const isBuy = sourceTrade.type === 'POSITION_TYPE_BUY';
      const tradeData = {
        symbol: sourceTrade.symbol,
        action: isBuy ? 'BUY' : 'SELL',
        actionType: isBuy ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
        volume: destVolume,
        stopLoss: this.calculateStopLoss(sourceTrade),
        takeProfit: this.calculateTakeProfit(sourceTrade),
        comment: `Copy_${sourceTrade.id}_L${sourceTrade.volume * 100}`
      };
      
      // Execute trade with retry logic
      const result = await this.executeTradeWithRetry(tradeData, sourceTrade);

      if (result.success) {
        logger.info(`✅ Trade COPIED SUCCESSFULLY!`);
        logger.info(`   Order ID: ${result.orderId}`);
        logger.info(`   Final volume: ${destVolume} lots`);
        tradeTracker.copied(sourceTrade, destVolume, result.orderId);

        // Update tracking
        const now = Date.now();
        this.lastTradeTime = now;
        this.tradeTimestamps.push(now); // For frequency filter
        this.dailyStats.trades++;

        // Create position mapping for exit tracking
        await positionMapper.createMapping(this.sourceAccountId, sourceTrade.id, {
          accountId: this.destAccountId,
          positionId: result.orderId,
          sourceSymbol: sourceTrade.symbol,
          destSymbol: sourceTrade.symbol,
          sourceVolume: sourceTrade.volume,
          destVolume: destVolume,
          openTime: sourceTrade.openTime,
          sourceOpenPrice: sourceTrade.openPrice,
          destOpenPrice: result.openPrice || sourceTrade.openPrice
        });

        // Send Telegram success notification
        await this.notify('notifyCopySuccess', sourceTrade, this.destAccountId, {
          orderId: result.orderId,
          volume: destVolume
        });

        // Mark this trade as processed
        this.processedTrades.add(sourceTrade.id);
        
        // Track martingale cycle
        if (martingaleLevel === 1) {
          // Start new cycle
          const cycleId = `${sourceTrade.symbol}_${Date.now()}`;
          this.activeMartingaleCycles.set(cycleId, [sourceTrade]);
        } else if (martingaleLevel > 1) {
          // Add to existing cycle
          for (const [cycleId, positions] of this.activeMartingaleCycles) {
            if (positions[0].symbol === sourceTrade.symbol) {
              positions.push(sourceTrade);
              break;
            }
          }
        }
        
        return { success: true, orderId: result.orderId };
      } else {
        logger.error(`❌ Failed to copy trade: ${result.error}`);
        tradeTracker.error(sourceTrade, result.error);

        // Send Telegram failure notification
        await this.notify('notifyCopyFailure', sourceTrade, 'Execution failed', result.error);

        return { success: false, error: result.error };
      }
      
    } catch (error) {
      logger.error('Error executing copy trade:', error);
      tradeTracker.error(sourceTrade, error.message);
    }
  }

  /**
   * Execute trade with retry logic for connection issues
   */
  async executeTradeWithRetry(tradeData, sourceTrade, maxRetries = 3) {
    const retryDelays = [5000, 10000, 15000]; // 5s, 10s, 15s

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`🔄 Trade execution attempt ${attempt}/${maxRetries}`);

        const result = await unifiedPoolClient.executeTrade(
          this.destAccountId,
          this.destRegion,
          tradeData
        );

        if (result.success) {
          if (attempt > 1) {
            logger.info(`✅ Trade succeeded on retry attempt ${attempt}`);
          }
          return result;
        }

        // Check if error is retryable
        const isRetryable = this.isRetryableError(result.error);

        if (!isRetryable) {
          logger.error(`❌ Non-retryable error: ${result.error}`);
          return result;
        }

        if (attempt < maxRetries) {
          const delay = retryDelays[attempt - 1];
          logger.warn(`⚠️ Attempt ${attempt} failed: ${result.error}`);
          logger.info(`⏳ Retrying in ${delay/1000}s... (${maxRetries - attempt} attempts remaining)`);
          await this.sleep(delay);
        } else {
          logger.error(`❌ All ${maxRetries} attempts failed`);
          return result;
        }

      } catch (error) {
        const isRetryable = this.isRetryableError(error.message);

        if (!isRetryable || attempt === maxRetries) {
          logger.error(`❌ Fatal error on attempt ${attempt}: ${error.message}`);
          return { success: false, error: error.message };
        }

        const delay = retryDelays[attempt - 1];
        logger.warn(`⚠️ Attempt ${attempt} threw error: ${error.message}`);
        logger.info(`⏳ Retrying in ${delay/1000}s...`);
        await this.sleep(delay);
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }

  /**
   * Check if error is retryable (connection/timeout issues)
   */
  isRetryableError(errorMessage) {
    if (!errorMessage) return false;

    const retryablePatterns = [
      'timeout',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ECONNRESET',
      'Connection refused',
      'no response',
      'socket hang up',
      'network',
      'ESOCKETTIMEDOUT'
    ];

    const errorLower = errorMessage.toLowerCase();
    return retryablePatterns.some(pattern =>
      errorLower.includes(pattern.toLowerCase())
    );
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate stop loss with buffer
   */
  calculateStopLoss(trade) {
    const pipSize = trade.symbol.includes('JPY') ? 0.01 : 0.0001;
    const buffer = this.config.stopLossBuffer;

    // If trade has SL, use it with buffer
    if (trade.stopLoss) {
      if (trade.type === 'POSITION_TYPE_BUY') {
        return trade.stopLoss - (buffer * pipSize);
      } else {
        return trade.stopLoss + (buffer * pipSize);
      }
    }

    // Check for account-level default SL (percentage-based)
    const sourceAccount = this.routeConfig?.accounts?.[this.sourceAccountId];
    if (sourceAccount?.defaultStopLoss?.enabled) {
      const slPercent = sourceAccount.defaultStopLoss.value / 100; // Convert to decimal
      const slDistance = trade.openPrice * slPercent;

      if (trade.type === 'POSITION_TYPE_BUY') {
        return trade.openPrice - slDistance;
      } else {
        return trade.openPrice + slDistance;
      }
    }

    // Otherwise, use default SL based on symbol (fallback)
    const defaultSL = trade.symbol === 'XAUUSD' ? 50 : 40; // pips
    const slDistance = defaultSL * pipSize;

    if (trade.type === 'POSITION_TYPE_BUY') {
      return trade.openPrice - slDistance;
    } else {
      return trade.openPrice + slDistance;
    }
  }

  /**
   * Calculate take profit with buffer
   */
  calculateTakeProfit(trade) {
    const pipSize = trade.symbol.includes('JPY') ? 0.01 : 0.0001;
    const buffer = this.config.takeProfitBuffer;

    // If trade has TP, use it with buffer
    if (trade.takeProfit) {
      if (trade.type === 'POSITION_TYPE_BUY') {
        return trade.takeProfit + (buffer * pipSize);
      } else {
        return trade.takeProfit - (buffer * pipSize);
      }
    }

    // Check for account-level default TP (percentage-based)
    const sourceAccount = this.routeConfig?.accounts?.[this.sourceAccountId];
    if (sourceAccount?.defaultTakeProfit?.enabled) {
      const tpPercent = sourceAccount.defaultTakeProfit.value / 100; // Convert to decimal
      const tpDistance = trade.openPrice * tpPercent;

      if (trade.type === 'POSITION_TYPE_BUY') {
        return trade.openPrice + tpDistance;
      } else {
        return trade.openPrice - tpDistance;
      }
    }

    // Otherwise, use default TP based on symbol (2:1 risk/reward, fallback)
    const defaultTP = trade.symbol === 'XAUUSD' ? 100 : 80; // pips
    const tpDistance = defaultTP * pipSize;

    if (trade.type === 'POSITION_TYPE_BUY') {
      return trade.openPrice + tpDistance;
    } else {
      return trade.openPrice - tpDistance;
    }
  }

  /**
   * Copy position exit to destination account
   */
  async copyPositionExit(mapping, closeInfo) {
    try {
      const sourceNickname = this.routeConfig?.accounts?.[mapping.sourceAccountId]?.nickname || mapping.sourceAccountId;
      const destNickname = this.routeConfig?.accounts?.[mapping.destAccountId]?.nickname || mapping.destAccountId;

      logger.info(`📋 COPYING EXIT for route ${sourceNickname} → ${destNickname}:`);
      logger.info(`   Source position: ${mapping.sourcePositionId}`);
      logger.info(`   Destination position: ${mapping.destPositionId}`);
      logger.info(`   Close reason: ${closeInfo.reason}`);
      logger.info(`   Source profit: $${closeInfo.profit?.toFixed(2) || '0.00'}`);

      // Check if destination position is still open
      const destPositions = await unifiedPoolClient.getPositions(mapping.destAccountId, this.destRegion);
      const destPosition = destPositions.find(pos => pos.id === mapping.destPositionId);

      if (!destPosition) {
        logger.warn(`⚠️ Destination position ${mapping.destPositionId} already closed or not found`);
        await positionMapper.deleteMapping(mapping.sourceAccountId, mapping.sourcePositionId);
        return;
      }

      // Close the destination position
      const closeResult = await unifiedPoolClient.closePosition(
        mapping.destAccountId,
        this.destRegion,
        mapping.destPositionId
      );

      if (closeResult.success) {
        const destProfit = destPosition.profit || 0;
        const profitRatio = mapping.destVolume / mapping.sourceVolume;
        const expectedProfit = closeInfo.profit * profitRatio;

        logger.info(`✅ EXIT COPIED SUCCESSFULLY!`);
        logger.info(`   Destination profit: $${destProfit.toFixed(2)}`);
        logger.info(`   Expected profit: $${expectedProfit.toFixed(2)}`);
        logger.info(`   Profit variance: ${((destProfit - expectedProfit) / expectedProfit * 100).toFixed(1)}%`);

        // Send telegram notification
        telegram.notifyExitCopied(mapping, closeInfo, {
          destProfit,
          closeReason: closeInfo.reason
        });

        // Record the close for tracking
        await positionMapper.recordPositionClose(
          mapping.sourceAccountId,
          mapping.sourcePositionId,
          {
            ...closeInfo,
            destProfit,
            destCloseTime: new Date().toISOString()
          }
        );

        // Delete the mapping
        await positionMapper.deleteMapping(mapping.sourceAccountId, mapping.sourcePositionId);
      } else {
        logger.error(`❌ Failed to copy exit for position ${mapping.destPositionId}`);
        telegram.notifyExitCopyFailure(mapping, 'Failed to close position');
      }
    } catch (error) {
      logger.error('Error copying position exit:', error);
      telegram.notifyExitCopyFailure(mapping, error.message);
    }
  }

  /**
   * Apply individual filter from routing-config.json
   */
  async applyFilter(filter, trade) {
    const type = filter.type;

    try {
      switch (type) {
        case 'stop_loss_filter':
          return this.checkStopLossFilter(filter, trade);

        case 'symbol_filter':
          return this.checkSymbolFilter(filter, trade);

        case 'hedging_filter':
          return await this.checkHedgingFilter(filter, trade);

        case 'frequency_filter':
          return this.checkFrequencyFilter(filter, trade);

        case 'source_performance_filter':
          return this.checkSourceStreakFilter(filter, trade);

        case 'position_size_filter':
          return await this.checkPositionSizeFilter(filter, trade);

        case 'news_filter':
          return this.checkNewsFilter(filter, trade);

        case 'lot_size_filter':
          return this.checkLotSizeFilter(filter, trade);

        case 'exposure_filter':
          return await this.checkExposureFilter(filter, trade);

        default:
          logger.warn(`Unknown filter type: ${type}`);
          return { passed: true, reason: null };
      }
    } catch (error) {
      logger.error(`Error applying filter ${filter.name}:`, error);
      return { passed: true, reason: null }; // Fail open on errors
    }
  }

  /**
   * Check if trade has required stop loss
   */
  checkStopLossFilter(filter, trade) {
    if (!filter.requireSL) return { passed: true };

    if (!trade.stopLoss || trade.stopLoss === 0) {
      return { passed: false, reason: `Stop loss required but not set (${filter.name})` };
    }

    // Check SL distance if configured
    const slDistance = Math.abs(trade.openPrice - trade.stopLoss);
    const slPips = trade.symbol.includes('JPY') ? slDistance * 100 : slDistance * 10000;

    if (filter.minSLDistance && slPips < filter.minSLDistance) {
      return { passed: false, reason: `Stop loss too tight: ${slPips.toFixed(1)} pips < ${filter.minSLDistance} min` };
    }

    if (filter.maxSLDistance && slPips > filter.maxSLDistance) {
      return { passed: false, reason: `Stop loss too wide: ${slPips.toFixed(1)} pips > ${filter.maxSLDistance} max` };
    }

    return { passed: true };
  }

  /**
   * Check if symbol is in whitelist
   */
  checkSymbolFilter(filter, trade) {
    if (filter.mode === 'whitelist' && filter.symbols) {
      if (!filter.symbols.includes(trade.symbol)) {
        return { passed: false, reason: `Symbol ${trade.symbol} not in whitelist` };
      }
    }
    return { passed: true };
  }

  /**
   * Check for hedging (opposite positions on same symbol)
   */
  async checkHedgingFilter(filter, trade) {
    if (filter.allowOpposingPositions) return { passed: true };

    const destPositions = await unifiedPoolClient.getPositions(this.destAccountId, this.destRegion);
    const oppositeDirection = trade.type === 'POSITION_TYPE_BUY' ? 'POSITION_TYPE_SELL' : 'POSITION_TYPE_BUY';

    const hasOpposite = destPositions.some(pos =>
      pos.symbol === trade.symbol && pos.type === oppositeDirection
    );

    if (hasOpposite) {
      return { passed: false, reason: `Hedging not allowed - opposite ${trade.symbol} position exists` };
    }

    return { passed: true };
  }

  /**
   * Check high-frequency trading limits
   */
  checkFrequencyFilter(filter, trade) {
    const now = Date.now();

    // Clean old timestamps
    this.tradeTimestamps = this.tradeTimestamps.filter(ts => now - ts < 3600000); // 1 hour

    // Check trades per hour
    if (filter.maxTradesPerHour) {
      const hourAgo = now - 3600000;
      const recentTrades = this.tradeTimestamps.filter(ts => ts > hourAgo);
      if (recentTrades.length >= filter.maxTradesPerHour) {
        return { passed: false, reason: `Exceeded ${filter.maxTradesPerHour} trades/hour limit` };
      }
    }

    // Check trades per day (already handled by maxDailyTrades, but double-check)
    if (filter.maxTradesPerDay && this.dailyStats.trades >= filter.maxTradesPerDay) {
      return { passed: false, reason: `Exceeded ${filter.maxTradesPerDay} trades/day limit` };
    }

    // Check minimum hold time (for scalping prevention)
    if (filter.minPositionHoldTime && this.lastTradeTime) {
      const timeSinceLast = now - this.lastTradeTime;
      if (timeSinceLast < filter.minPositionHoldTime) {
        return { passed: false, reason: `Min hold time not met: ${(timeSinceLast / 1000).toFixed(0)}s < ${filter.minPositionHoldTime / 1000}s` };
      }
    }

    return { passed: true };
  }

  /**
   * Check source account losing streak
   */
  checkSourceStreakFilter(filter, trade) {
    if (!filter.trackSourceAccount) return { passed: true };

    if (this.consecutiveSourceLosses >= filter.maxConsecutiveSourceLosses) {
      return { passed: false, reason: `Source has ${this.consecutiveSourceLosses} consecutive losses - paused per ${filter.name}` };
    }

    return { passed: true };
  }

  /**
   * Check position size limits
   */
  async checkPositionSizeFilter(filter, trade) {
    if (!filter.maxRiskPercent) return { passed: true };

    const destInfo = await unifiedPoolClient.getAccountInfo(this.destAccountId, this.destRegion);
    const accountBalance = destInfo.balance || destInfo.equity;

    // Calculate risk based on stop loss
    let riskAmount = 0;
    if (trade.stopLoss && trade.stopLoss !== 0) {
      const slDistance = Math.abs(trade.openPrice - trade.stopLoss);
      const pipValue = trade.volume * 10; // Simplified pip value
      const slPips = trade.symbol.includes('JPY') ? slDistance * 100 : slDistance * 10000;
      riskAmount = slPips * pipValue;
    } else {
      // No SL, estimate risk as 2% of position value
      riskAmount = (trade.openPrice * trade.volume * 100000) * 0.02;
    }

    const riskPercent = (riskAmount / accountBalance) * 100;

    if (riskPercent > filter.maxRiskPercent) {
      return { passed: false, reason: `Position risk ${riskPercent.toFixed(2)}% > ${filter.maxRiskPercent}% max` };
    }

    return { passed: true };
  }

  /**
   * Check news trading restriction (simplified - checks time only, not actual news events)
   */
  checkNewsFilter(filter, trade) {
    // This is a simplified implementation
    // Full implementation would require a news calendar API
    // For now, just check if configured
    if (filter.newsBufferMinutes) {
      // In production, you'd check against a news calendar here
      // For now, we'll just pass through
      logger.debug('News filter configured but calendar check not implemented');
    }
    return { passed: true };
  }

  /**
   * Check absolute lot size limits
   */
  checkLotSizeFilter(filter, trade) {
    if (filter.maxLots && trade.volume > filter.maxLots) {
      return { passed: false, reason: `Lot size ${trade.volume} > ${filter.maxLots} max` };
    }

    if (filter.minLots && trade.volume < filter.minLots) {
      return { passed: false, reason: `Lot size ${trade.volume} < ${filter.minLots} min` };
    }

    return { passed: true };
  }

  /**
   * Check total exposure across all positions
   */
  async checkExposureFilter(filter, trade) {
    if (!filter.maxTotalExposurePercent) return { passed: true };

    const destPositions = await unifiedPoolClient.getPositions(this.destAccountId, this.destRegion);
    const destInfo = await unifiedPoolClient.getAccountInfo(this.destAccountId, this.destRegion);
    const accountBalance = destInfo.balance || destInfo.equity;

    // Calculate total notional exposure
    let totalExposure = 0;
    for (const pos of destPositions) {
      const notional = pos.openPrice * pos.volume * 100000; // Contract size
      totalExposure += notional;
    }

    // Add this new trade's exposure
    const newExposure = trade.openPrice * trade.volume * 100000;
    totalExposure += newExposure;

    const exposurePercent = (totalExposure / accountBalance) * 100;

    if (exposurePercent > filter.maxTotalExposurePercent) {
      return { passed: false, reason: `Total exposure ${exposurePercent.toFixed(1)}% > ${filter.maxTotalExposurePercent}% max` };
    }

    return { passed: true };
  }

  /**
   * Send notification (uses overrides if set, otherwise base telegram)
   */
  async notify(method, ...args) {
    if (this.telegramOverrides && this.telegramOverrides[method]) {
      // Use enhanced notifications from advancedRouter
      return await this.telegramOverrides[method](...args);
    } else {
      // Fallback to base telegram module
      return await telegram[method](...args);
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      sourcePositions: this.sourcePositions.size,
      processedTrades: this.processedTrades.size,
      dailyTrades: this.dailyStats.trades,
      dailyLoss: this.dailyStats.dailyLoss,
      activeCycles: this.activeMartingaleCycles.size,
      lastTradeTime: this.lastTradeTime,
      isRunning: !!this.monitorInterval
    };
  }
}

export default FilteredCopyTrader;
