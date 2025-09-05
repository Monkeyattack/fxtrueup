/**
 * Filtered Copy Trader using existing MetaAPI setup
 * Copies trades from Gold account with martingale filtering
 */

import poolClient from './poolClient.js';
import { logger } from '../utils/logger.js';

class FilteredCopyTrader {
  constructor(sourceAccountId, destAccountId, destRegion = 'new-york') {
    this.sourceAccountId = sourceAccountId;
    this.destAccountId = destAccountId;
    this.destRegion = destRegion;
    
    // Tracking state
    this.openPositions = new Map();
    this.lastTradeTime = 0;
    this.dailyStats = {
      date: new Date().toDateString(),
      trades: 0,
      profit: 0
    };
    
    // Filter configuration
    this.config = {
      maxOpenPositions: 1,
      minTimeBetweenTrades: 30 * 60 * 1000, // 30 minutes
      fixedLotSize: 2.50, // Scaled for $118k account to risk ~1% per trade with 40-50 pip stops
      maxDailyTrades: 5,
      priceRangeFilter: 50, // pips
      allowedHours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], // UTC
      stopLossBuffer: 20, // pips
      takeProfitBuffer: 30 // pips
    };
  }

  /**
   * Start monitoring and copying trades
   */
  async start() {
    logger.info('🚀 Starting Filtered Copy Trader');
    logger.info(`Source: ${this.sourceAccountId}`);
    logger.info(`Destination: ${this.destAccountId}`);
    
    // Initial sync - get current positions
    await this.syncPositions();
    
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
   * Sync current positions
   */
  async syncPositions() {
    try {
      const sourcePositions = await poolClient.getPositions(this.sourceAccountId, 'london');
      const destPositions = await poolClient.getPositions(this.destAccountId, this.destRegion);
      
      // Update tracking
      this.openPositions.clear();
      destPositions.forEach(pos => {
        this.openPositions.set(pos.id, pos);
      });
      
      logger.info(`Current positions - Source: ${sourcePositions.length}, Dest: ${destPositions.length}`);
    } catch (error) {
      logger.error('Error syncing positions:', error);
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
        this.dailyStats = { date: today, trades: 0, profit: 0 };
      }
      
      // Get current positions from source
      const sourcePositions = await poolClient.getPositions(this.sourceAccountId, 'london');
      
      // Check each position to see if it should be copied
      for (const position of sourcePositions) {
        if (await this.shouldCopyTrade(position)) {
          await this.executeCopyTrade(position);
        }
      }
      
    } catch (error) {
      logger.error('Error checking for trades:', error);
    }
  }

  /**
   * Determine if a trade should be copied
   */
  async shouldCopyTrade(trade) {
    const reasons = [];
    
    // 1. Check if already copied
    const alreadyCopied = Array.from(this.openPositions.values()).some(
      pos => pos.comment && pos.comment.includes(trade.id)
    );
    if (alreadyCopied) return false;
    
    // 2. Check position limit
    if (this.openPositions.size >= this.config.maxOpenPositions) {
      reasons.push('Max positions reached');
      return false;
    }
    
    // 3. Check time since last trade
    const timeSinceLastTrade = Date.now() - this.lastTradeTime;
    if (timeSinceLastTrade < this.config.minTimeBetweenTrades) {
      reasons.push('Too soon after last trade');
      return false;
    }
    
    // 4. Check daily trade limit
    if (this.dailyStats.trades >= this.config.maxDailyTrades) {
      reasons.push('Daily trade limit reached');
      return false;
    }
    
    // 5. Check trading hours
    const hour = new Date().getUTCHours();
    if (!this.config.allowedHours.includes(hour)) {
      reasons.push('Outside trading hours');
      return false;
    }
    
    // 6. Detect martingale pattern
    if (this.isMartingalePattern(trade)) {
      reasons.push('Martingale pattern detected');
      return false;
    }
    
    // 7. Check for grid pattern (multiple positions at similar prices)
    if (await this.isGridPattern(trade)) {
      reasons.push('Grid pattern detected');
      return false;
    }
    
    // Log decision
    if (reasons.length > 0) {
      logger.info(`❌ Skipping trade: ${reasons.join(', ')}`);
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
   * Execute the copy trade
   */
  async executeCopyTrade(sourceTrade) {
    try {
      logger.info(`📋 Copying trade: ${sourceTrade.symbol} ${sourceTrade.type}`);
      
      // Prepare trade data
      const tradeData = {
        symbol: sourceTrade.symbol,
        actionType: sourceTrade.type === 'POSITION_TYPE_BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
        volume: this.config.fixedLotSize, // Fixed 0.10 lots for $60k account
        stopLoss: this.calculateStopLoss(sourceTrade),
        takeProfit: this.calculateTakeProfit(sourceTrade),
        comment: `Copy_${sourceTrade.id}`
      };
      
      // Execute trade
      const result = await poolClient.executeTrade(
        this.destAccountId,
        this.destRegion,
        tradeData
      );
      
      if (result.success) {
        logger.info(`✅ Trade copied successfully: ${result.orderId}`);
        this.lastTradeTime = Date.now();
        this.dailyStats.trades++;
        
        // Update position tracking
        await this.syncPositions();
      } else {
        logger.error(`❌ Failed to copy trade: ${result.error}`);
      }
      
    } catch (error) {
      logger.error('Error executing copy trade:', error);
    }
  }

  /**
   * Calculate stop loss with buffer
   */
  calculateStopLoss(trade) {
    if (!trade.stopLoss) return null;
    
    const buffer = this.config.stopLossBuffer;
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
   * Get current stats
   */
  getStats() {
    return {
      openPositions: this.openPositions.size,
      dailyTrades: this.dailyStats.trades,
      lastTradeTime: this.lastTradeTime,
      isRunning: !!this.monitorInterval
    };
  }
}

export default FilteredCopyTrader;