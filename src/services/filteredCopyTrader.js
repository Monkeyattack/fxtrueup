/**
 * Filtered Copy Trader using existing MetaAPI setup
 * Copies trades from Gold account with martingale filtering
 */

import poolClient from './poolClient.js';
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
    this.lastTradeTime = 0;
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
    const initialPositions = await poolClient.getPositions(this.sourceAccountId, this.sourceRegion);
    initialPositions.forEach(pos => {
      this.sourcePositions.set(pos.id, pos);
      // Mark existing positions as already processed to avoid copying old trades
      this.processedTrades.add(pos.id);
    });
    logger.info(`📊 Initial source positions: ${initialPositions.length}`);

    // Initialize position monitor
    if (!this.positionMonitor) {
      this.positionMonitor = new OptimizedPositionMonitor(poolClient);
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
          this.sourcePositions.set(position.id, position);

          // Get account nickname from config
          const accountNickname = this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId.slice(0, 8);
          logger.info(`🎯 New trade detected from ${accountNickname} (${this.sourceAccountId}):`);
          logger.info(`   Symbol: ${position.symbol}`);
          logger.info(`   Volume: ${position.volume} lots`);
          logger.info(`   Price: ${position.openPrice}`);
          logger.info(`   Position ID: ${position.id}`);
          tradeTracker.detected(position);

          // Send Telegram notification
          telegram.notifyPositionDetected(position, this.sourceAccountId);

          // Check daily stats before processing
          if (this.checkDailyStats()) {
            // Process the new trade
            logger.info(`🔄 Processing detected trade ${position.id} for route ${this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId} → ${this.routeConfig?.accounts?.[this.destAccountId]?.nickname || this.destAccountId}`);
            await this.executeCopyTrade(position);
          } else {
            logger.warn(`⚠️ Trade ${position.id} not copied due to daily loss limit`);
            this.processedTrades.add(position.id); // Mark as processed to avoid retries
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
    
    // 3. Check time since last trade
    const timeSinceLastTrade = Date.now() - this.lastTradeTime;
    if (timeSinceLastTrade < this.config.minTimeBetweenTrades) {
      reasons.push('Too soon after last trade');
      tradeTracker.rejected(trade, reasons);
      return false;
    }
    
    // 4. Check daily trade limit
    if (this.dailyStats.trades >= this.config.maxDailyTrades) {
      reasons.push('Daily trade limit reached');
      tradeTracker.rejected(trade, reasons);
      return false;
    }
    
    // 5. Check trading hours (skip if allowedHours is empty)
    if (this.config.allowedHours.length > 0) {
      const hour = new Date().getUTCHours();
      if (!this.config.allowedHours.includes(hour)) {
        reasons.push('Outside trading hours');
        tradeTracker.rejected(trade, reasons);
        return false;
      }
    }
    
    // 6. Detect martingale pattern
    if (this.isMartingalePattern(trade)) {
      reasons.push('Martingale pattern detected');
      tradeTracker.rejected(trade, reasons);
      return false;
    }
    
    // 7. Check for grid pattern (multiple positions at similar prices)
    if (await this.isGridPattern(trade)) {
      reasons.push('Grid pattern detected');
      tradeTracker.rejected(trade, reasons);
      return false;
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
      telegram.notifyFilterRejection(trade, reasons);
    } else {
      logger.info(`✅ Trade ${trade.id} PASSED all filters for route ${sourceNickname} → ${destNickname}`);
    }

    return reasons.length === 0;
  }

  /**
   * Detect martingale pattern
   */
  isMartingalePattern(trade) {
    // Check if position size is larger than expected base size
    // PropFirmKid typically trades 0.85-1.0 lots as base size
    // Martingale would be 1.7+ lots (2x base) or higher
    const baseSize = 1.0; // Expected base lot size for PropFirmKid
    const martingaleThreshold = baseSize * 1.7; // 170% of base = likely martingale

    if (trade.volume > martingaleThreshold) {
      logger.info(`⚠️ Martingale pattern detected: ${trade.volume} lots > ${martingaleThreshold} threshold`);
      return true;
    }

    // Check recent trade history for losses followed by larger positions
    // This would need trade history analysis

    return false;
  }

  /**
   * Detect grid pattern
   */
  async isGridPattern(trade) {
    // Get all open positions on source account
    const sourcePositions = await poolClient.getPositions(this.sourceAccountId, 'london');
    
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
      const destPositions = await poolClient.getPositions(this.destAccountId, this.destRegion);
      
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
      const tradeData = {
        symbol: sourceTrade.symbol,
        action: sourceTrade.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
        volume: destVolume,
        stopLoss: this.calculateStopLoss(sourceTrade),
        takeProfit: this.calculateTakeProfit(sourceTrade),
        comment: `Copy_${sourceTrade.id}_L${sourceTrade.volume * 100}`
      };
      
      // Execute trade
      const result = await poolClient.executeTrade(
        this.destAccountId,
        this.destRegion,
        tradeData
      );
      
      if (result.success) {
        logger.info(`✅ Trade COPIED SUCCESSFULLY!`);
        logger.info(`   Order ID: ${result.orderId}`);
        logger.info(`   Final volume: ${destVolume} lots`);
        tradeTracker.copied(sourceTrade, destVolume, result.orderId);
        this.lastTradeTime = Date.now();
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
        telegram.notifyCopySuccess(sourceTrade, this.destAccountId, {
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
        telegram.notifyCopyFailure(sourceTrade, 'Execution failed', result.error);

        return { success: false, error: result.error };
      }
      
    } catch (error) {
      logger.error('Error executing copy trade:', error);
      tradeTracker.error(sourceTrade, error.message);
    }
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

    // Otherwise, use default SL based on symbol
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

    // Otherwise, use default TP based on symbol (2:1 risk/reward)
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
      const destPositions = await poolClient.getPositions(mapping.destAccountId, this.destRegion);
      const destPosition = destPositions.find(pos => pos.id === mapping.destPositionId);

      if (!destPosition) {
        logger.warn(`⚠️ Destination position ${mapping.destPositionId} already closed or not found`);
        await positionMapper.deleteMapping(mapping.sourceAccountId, mapping.sourcePositionId);
        return;
      }

      // Close the destination position
      const closeResult = await poolClient.closePosition(
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
