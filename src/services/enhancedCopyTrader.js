/**
 * Enhanced Copy Trader with Short Squeeze Detection
 * Integrates short squeeze analysis from meta-trader-hub into copy trading decisions
 */

import poolClient from './poolClient.js';
import { logger } from '../utils/logger.js';
import ShortSqueezeClient from './shortSqueezeClient.js';

class EnhancedCopyTrader {
  constructor(sourceAccountId, destAccountId, destRegion = 'new-york') {
    this.sourceAccountId = sourceAccountId;
    this.destAccountId = destAccountId;
    this.destRegion = destRegion;
    
    // Initialize short squeeze client
    this.squeezeClient = new ShortSqueezeClient({
      baseUrl: process.env.META_TRADER_HUB_URL || 'http://localhost:5000',
      apiKey: process.env.META_TRADER_HUB_API_KEY,
      cacheTTL: 5 * 60 * 1000 // 5 minutes
    });
    
    // Tracking state
    this.openPositions = new Map();
    this.lastTradeTime = 0;
    this.dailyStats = {
      date: new Date().toDateString(),
      trades: 0,
      profit: 0,
      squeezeTrades: 0
    };
    
    // Filter configuration
    this.config = {
      maxOpenPositions: 1,
      minTimeBetweenTrades: 30 * 60 * 1000, // 30 minutes
      fixedLotSize: 2.50, // Scaled for $118k account
      maxDailyTrades: 5,
      priceRangeFilter: 50, // pips
      allowedHours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], // UTC
      stopLossBuffer: 20, // pips
      takeProfitBuffer: 30, // pips
      
      // Short squeeze parameters
      shortSqueeze: {
        enabled: true,
        minSqueezeScore: 0.5,
        maxConfidenceBoost: 0.15,
        squeezeStopLossBuffer: 10, // Additional buffer for squeeze trades
        squeezeLotMultiplier: 1.2, // Slightly larger size for high confidence squeeze setups
        allowedSymbols: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XAUUSD'] // Symbols to check for squeeze
      }
    };
  }

  /**
   * Get short squeeze data for a symbol
   */
  async getShortSqueezeData(symbol) {
    try {
      // Use the short squeeze client to get analysis
      const squeezeData = await this.squeezeClient.getSqueezeAnalysis(symbol);
      return squeezeData;
    } catch (error) {
      logger.error(`Error getting short squeeze data for ${symbol}:`, error);
      return null;
    }
  }


  /**
   * Determine if a trade should be copied with squeeze enhancement
   */
  async shouldCopyTrade(trade) {
    const reasons = [];
    let squeezeData = null;
    
    // First run basic filters
    if (!await this.runBasicFilters(trade, reasons)) {
      return { shouldCopy: false, reasons, squeezeData };
    }
    
    // If basic filters pass, check for short squeeze opportunity
    if (this.config.shortSqueeze.enabled && 
        this.config.shortSqueeze.allowedSymbols.some(s => trade.symbol.includes(s))) {
      
      squeezeData = await this.getShortSqueezeData(trade.symbol);
      
      if (squeezeData) {
        logger.info(`🔍 Short squeeze analysis for ${trade.symbol}:`, {
          score: squeezeData.squeezeScore,
          recommendation: squeezeData.recommendation
        });
        
        // For BUY trades with high squeeze potential, this is a strong signal
        if (trade.type === 'POSITION_TYPE_BUY' && 
            squeezeData.squeezeScore >= this.config.shortSqueeze.minSqueezeScore) {
          reasons.push(`High squeeze potential detected (score: ${squeezeData.squeezeScore.toFixed(2)})`);
        }
        
        // For SELL trades with high squeeze potential, we might want to skip or be cautious
        if (trade.type === 'POSITION_TYPE_SELL' && 
            squeezeData.squeezeScore >= this.config.shortSqueeze.minSqueezeScore) {
          reasons.push('⚠️ Avoiding SELL - high squeeze risk');
          return { shouldCopy: false, reasons, squeezeData };
        }
      }
    }
    
    const shouldCopy = reasons.filter(r => r.startsWith('⚠️')).length === 0;
    
    // Log decision
    if (!shouldCopy) {
      logger.info(`❌ Skipping trade: ${reasons.join(', ')}`);
    } else {
      logger.info(`✅ Trade passed all filters${squeezeData ? ' (squeeze-enhanced)' : ''}`);
    }
    
    return { shouldCopy, reasons, squeezeData };
  }

  /**
   * Run basic filters
   */
  async runBasicFilters(trade, reasons) {
    // 1. Check if already copied
    const alreadyCopied = Array.from(this.openPositions.values()).some(
      pos => pos.comment && pos.comment.includes(trade.id)
    );
    if (alreadyCopied) return false;
    
    // 2. Check position limit
    if (this.openPositions.size >= this.config.maxOpenPositions) {
      reasons.push('⚠️ Max positions reached');
      return false;
    }
    
    // 3. Check time since last trade
    const timeSinceLastTrade = Date.now() - this.lastTradeTime;
    if (timeSinceLastTrade < this.config.minTimeBetweenTrades) {
      reasons.push('⚠️ Too soon after last trade');
      return false;
    }
    
    // 4. Check daily trade limit
    if (this.dailyStats.trades >= this.config.maxDailyTrades) {
      reasons.push('⚠️ Daily trade limit reached');
      return false;
    }
    
    // 5. Check trading hours
    const hour = new Date().getUTCHours();
    if (!this.config.allowedHours.includes(hour)) {
      reasons.push('⚠️ Outside trading hours');
      return false;
    }
    
    // 6. Detect martingale pattern
    if (this.isMartingalePattern(trade)) {
      reasons.push('⚠️ Martingale pattern detected');
      return false;
    }
    
    // 7. Check for grid pattern
    if (await this.isGridPattern(trade)) {
      reasons.push('⚠️ Grid pattern detected');
      return false;
    }
    
    return true;
  }

  /**
   * Execute the copy trade with squeeze enhancements
   */
  async executeCopyTrade(sourceTrade) {
    try {
      // Check if we should copy with squeeze analysis
      const { shouldCopy, reasons, squeezeData } = await this.shouldCopyTrade(sourceTrade);
      
      if (!shouldCopy) {
        return { success: false, reasons };
      }
      
      logger.info(`📋 Copying trade: ${sourceTrade.symbol} ${sourceTrade.type}`);
      
      // Calculate position size based on squeeze confidence
      let volume = this.config.fixedLotSize;
      let stopLossBuffer = this.config.stopLossBuffer;
      let comment = `Copy_${sourceTrade.id}`;
      
      if (squeezeData && squeezeData.squeezeScore >= this.config.shortSqueeze.minSqueezeScore) {
        // For high confidence squeeze setups on BUY trades
        if (sourceTrade.type === 'POSITION_TYPE_BUY') {
          // Apply confidence-based size adjustment (max 20% increase)
          const sizeMultiplier = 1 + (squeezeData.squeezeScore - 0.5) * 0.4;
          volume = this.config.fixedLotSize * Math.min(sizeMultiplier, this.config.shortSqueeze.squeezeLotMultiplier);
          
          // Tighter stop loss for squeeze trades (momentum expected)
          stopLossBuffer = this.config.shortSqueeze.squeezeStopLossBuffer;
          
          comment = `Copy_${sourceTrade.id}_SQUEEZE_${squeezeData.squeezeScore.toFixed(2)}`;
          
          logger.info(`🚀 Squeeze trade enhancement: volume=${volume.toFixed(2)}, score=${squeezeData.squeezeScore.toFixed(2)}`);
          this.dailyStats.squeezeTrades++;
        }
      }
      
      // Prepare trade data
      const tradeData = {
        symbol: sourceTrade.symbol,
        actionType: sourceTrade.type === 'POSITION_TYPE_BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
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
        logger.info(`✅ Trade copied successfully: ${result.orderId}`);
        this.lastTradeTime = Date.now();
        this.dailyStats.trades++;
        
        // Update position tracking
        await this.syncPositions();
        
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
   * Calculate stop loss with configurable buffer
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
   * Detect grid pattern
   */
  async isGridPattern(trade) {
    const sourcePositions = await poolClient.getPositions(this.sourceAccountId, 'london');
    
    const similarPricePositions = sourcePositions.filter(pos => {
      if (pos.symbol !== trade.symbol) return false;
      
      const priceDiff = Math.abs(pos.openPrice - trade.openPrice);
      const pipDiff = trade.symbol.includes('JPY') ? priceDiff * 100 : priceDiff * 10000;
      
      return pipDiff < this.config.priceRangeFilter;
    });
    
    return similarPricePositions.length > 1;
  }

  /**
   * Sync current positions
   */
  async syncPositions() {
    try {
      const sourcePositions = await poolClient.getPositions(this.sourceAccountId, 'london');
      const destPositions = await poolClient.getPositions(this.destAccountId, this.destRegion);
      
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
      const today = new Date().toDateString();
      if (this.dailyStats.date !== today) {
        this.dailyStats = { date: today, trades: 0, profit: 0, squeezeTrades: 0 };
      }
      
      const sourcePositions = await poolClient.getPositions(this.sourceAccountId, 'london');
      
      for (const position of sourcePositions) {
        await this.executeCopyTrade(position);
      }
      
    } catch (error) {
      logger.error('Error checking for trades:', error);
    }
  }

  /**
   * Start monitoring and copying trades
   */
  async start() {
    logger.info('🚀 Starting Enhanced Copy Trader with Short Squeeze Detection');
    logger.info(`Source: ${this.sourceAccountId}`);
    logger.info(`Destination: ${this.destAccountId}`);
    logger.info(`Short Squeeze Detection: ${this.config.shortSqueeze.enabled ? 'ENABLED' : 'DISABLED'}`);
    
    await this.syncPositions();
    
    this.monitorInterval = setInterval(() => {
      this.checkForNewTrades();
    }, 5000);
    
    logger.info('✅ Enhanced copy trader started successfully');
  }

  /**
   * Stop the copy trader
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      logger.info('🛑 Enhanced copy trader stopped');
    }
  }

  /**
   * Get current stats with squeeze metrics
   */
  getStats() {
    return {
      openPositions: this.openPositions.size,
      dailyTrades: this.dailyStats.trades,
      squeezeTrades: this.dailyStats.squeezeTrades,
      lastTradeTime: this.lastTradeTime,
      isRunning: !!this.monitorInterval,
      squeezeDetection: this.config.shortSqueeze.enabled
    };
  }
}

export default EnhancedCopyTrader;