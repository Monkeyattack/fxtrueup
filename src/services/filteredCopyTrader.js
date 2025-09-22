/**
 * Filtered Copy Trader using existing MetaAPI setup
 * Copies trades from Gold account with martingale filtering
 */

import poolClient from './poolClient.js';
import { logger } from '../utils/logger.js';
import { tradeTracker } from '../utils/tradeTracker.js';
import telegram from '../utils/telegram.js';

class FilteredCopyTrader {
  constructor(sourceAccountId, destAccountId, destRegion = 'new-york') {
    this.sourceAccountId = sourceAccountId;
    this.destAccountId = destAccountId;
    this.destRegion = destRegion;
    
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
    
    // Filter configuration
    this.config = {
      maxOpenPositions: 1,
      minTimeBetweenTrades: 30 * 60 * 1000, // 30 minutes
      fixedLotSize: 2.50, // Will be replaced by degressive scaling
      maxDailyTrades: 5,
      priceRangeFilter: 50, // pips
      allowedHours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], // UTC
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
    logger.info('🚀 Starting Filtered Copy Trader with Degressive Scaling');
    logger.info(`Source: ${this.sourceAccountId}`);
    logger.info(`Destination: ${this.destAccountId}`);
    logger.info(`Daily Loss Limit: $${this.config.dailyLossLimit}`);
    
    // Initial sync of source positions only
    const initialPositions = await poolClient.getPositions(this.sourceAccountId, 'london');
    initialPositions.forEach(pos => {
      this.sourcePositions.set(pos.id, pos);
      // Mark existing positions as already processed to avoid copying old trades
      this.processedTrades.add(pos.id);
    });
    logger.info(`📊 Initial source positions: ${initialPositions.length}`);
    
    // Start monitoring loop
    this.monitorInterval = setInterval(() => {
      this.checkForNewTrades();
    }, 5000); // Check every 5 seconds
    
    logger.info('✅ Copy trader started successfully');
  }

  /**
   * Stop the copy trader
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      logger.info('🛑 Copy trader stopped');
    }
  }

  /**
   * Detect new trades from source account
   */
  async detectNewTrades() {
    try {
      const currentPositions = await poolClient.getPositions(this.sourceAccountId, 'london');
      const newTrades = [];
      
      // Build a set of current position IDs
      const currentIds = new Set();
      
      for (const position of currentPositions) {
        currentIds.add(position.id);
        
        // Check if this is a new position
        if (!this.sourcePositions.has(position.id)) {
          newTrades.push(position);
          logger.info(`🎯 New trade detected: ${position.symbol} ${position.volume} lots @ ${position.openPrice}`);
          tradeTracker.detected(position);

          // Send Telegram notification
          telegram.notifyPositionDetected(position, this.sourceAccountId);
        }
      }
      
      // Update our tracked source positions
      this.sourcePositions.clear();
      currentPositions.forEach(pos => {
        this.sourcePositions.set(pos.id, pos);
      });
      
      // Clean up processed trades for positions that no longer exist
      for (const tradeId of this.processedTrades) {
        if (!currentIds.has(tradeId)) {
          this.processedTrades.delete(tradeId);
        }
      }
      
      return newTrades;
    } catch (error) {
      logger.error('Error detecting new trades:', error);
      tradeTracker.error({ id: 'detect', symbol: 'n/a' }, error.message);
      return [];
    }
  }

  /**
   * Check for new trades to copy
   */
  async checkForNewTrades() {
    try {
      // Reset daily stats if new day
      const today = new Date().toDateString();
      if (this.dailyStats.date !== today) {
        this.dailyStats = { date: today, trades: 0, profit: 0, dailyLoss: 0 };
        this.processedTrades.clear(); // Reset processed trades for new day
      }
      
      // Check if we've hit daily loss limit
      if (this.dailyStats.dailyLoss >= this.config.dailyLossLimit) {
        logger.warn(`⚠️ Daily loss limit reached: $${this.dailyStats.dailyLoss}`);;
        return;
      }
      
      // Only process NEW trades, not all positions
      const newTrades = await this.detectNewTrades();
      
      for (const trade of newTrades) {
        await this.executeCopyTrade(trade);
      }
      
    } catch (error) {
      logger.error('Error checking for trades:', error);
      tradeTracker.error({ id: 'check', symbol: 'n/a' }, error.message);
    }
  }

  /**
   * Determine if a trade should be copied
   */
  async shouldCopyTrade(trade) {
    const reasons = [];
    
    // 1. Check if we've already processed this trade
    if (this.processedTrades.has(trade.id)) {
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
    
    // 5. Check trading hours
    const hour = new Date().getUTCHours();
    if (!this.config.allowedHours.includes(hour)) {
      reasons.push('Outside trading hours');
      tradeTracker.rejected(trade, reasons);
      return false;
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
    
    // Log decision
    if (reasons.length > 0) {
      logger.info(`❌ Skipping trade: ${reasons.join(', ')}`);
      // Send Telegram notification about filter rejection
      telegram.notifyFilterRejection(trade, reasons);
    } else {
      logger.info(`✅ Trade passed all filters`);
    }

    return reasons.length === 0;
  }

  /**
   * Detect martingale pattern
   */
  isMartingalePattern(trade) {
    // Check if position size is larger than our fixed size
    // Allow up to 50% larger to account for variations
    if (trade.volume > this.config.fixedLotSize * 1.5) {
      return true;
    }
    
    // Also check absolute size - if it's more than 0.02 on the source account
    // (which uses 0.01 base), it's likely martingale
    if (trade.volume > 0.02) {
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
   * Calculate position size with degressive scaling
   */
  calculatePositionSize(sourceLots) {
    const scaling = this.config.martingaleScaling[sourceLots];
    if (!scaling) {
      logger.warn(`No scaling for ${sourceLots} lots - skipping`);
      return 0;
    }
    
    // Apply daily loss adjustment
    const lossAdjustment = this.dailyStats.dailyLoss > 1500 ? 0.7 : 1.0;
    return scaling.maxLots * lossAdjustment;
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
      
      logger.info(`📋 Copying trade: ${sourceTrade.symbol} ${sourceTrade.type}`);
      logger.info(`  Source: ${sourceTrade.volume} lots → Dest: ${destVolume} lots (L${martingaleLevel})`);
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
        logger.info(`✅ Trade copied successfully: ${result.orderId}`);
        tradeTracker.copied(sourceTrade, destVolume, result.orderId);
        this.lastTradeTime = Date.now();
        this.dailyStats.trades++;

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
