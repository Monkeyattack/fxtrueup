/**
 * Filtered Copy Trader using existing MetaAPI setup
 * Copies trades from Gold account with martingale filtering
 */

import unifiedPoolClient from './unifiedPoolClient.js';
import positionMapper from './positionMapper.js';
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
    this.processedTrades = new Set(); // Track which trades we've successfully copied
    this.seenTrades = new Set(); // Track which trades we've detected to prevent duplicate processing
    this.activeMartingaleCycles = new Map(); // Track martingale sequences
    this.recentTradesBySymbol = new Map(); // Track recent trades per symbol for martingale detection
    this.consecutiveSourceLosses = 0; // Track source account losing streak
    this.lastTradeTime = 0;
    this.tradeTimestamps = []; // Track timestamps for frequency checking

    // Polling state
    this.pollingInterval = null;
    this.pollRate = 5000; // 5 seconds - only check source for new positions

    // Notification methods (can be overridden by advancedRouter)
    this.telegramOverrides = null;
    this.dailyStats = {
      date: new Date().toDateString(),
      trades: 0,
      profit: 0,
      dailyLoss: 0
    };

    // Filter configuration - ALL values must come from JSON config via advancedRouter
    // NO hardcoded defaults - this makes config-driven behavior explicit
    this.config = {
      // Essential tracking only - all filtering/limits set by route config
      activeFilters: [], // Populated by advancedRouter.applyRuleSet()
      multiplier: null, // Set by advancedRouter for proportional scaling
      fixedLotSize: null, // Set by advancedRouter for fixed lot sizing
      dynamicSizing: null // Set by advancedRouter for dynamic sizing
    };
  }

  /**
   * Start monitoring and copying trades
   */
  async start() {
    logger.info('🚀 Starting Filtered Copy Trader with Optimized Monitoring');
    logger.info(`Source: ${this.sourceAccountId}`);
    logger.info(`Destination: ${this.destAccountId}`);

    // Register gap detection callback for reconnection events
    try {
      await unifiedPoolClient.registerReconnectionCallback(
        this.checkForMissedTrades.bind(this)
      );
      logger.info('📡 Registered reconnection callback for gap detection');
    } catch (error) {
      logger.warn(`⚠️ Could not register reconnection callback: ${error.message}`);
      logger.warn('   Gap detection will not be available');
    }

    // Initial sync of source positions only
    const initialPositions = await unifiedPoolClient.getPositions(this.sourceAccountId, this.sourceRegion);
    const copyExisting = this.copyExistingPositions || this.routeConfig?.copyExistingPositions || false;

    initialPositions.forEach(pos => {
      this.sourcePositions.set(pos.id, pos);
      // Mark existing positions as already processed UNLESS copyExistingPositions is true
      if (!copyExisting) {
        this.processedTrades.add(pos.id);
        this.seenTrades.add(pos.id); // CRITICAL: Also mark as seen to prevent re-detection on restart
      }
    });
    logger.info(`📊 Initial source positions: ${initialPositions.length}${copyExisting ? ' (will copy existing)' : ' (skipping existing)'}`);

    // Start simple polling of source account
    this.startPolling();

    logger.info('✅ Copy trader started successfully');
  }

  /**
   * Start simple polling of source account
   */
  startPolling() {
    this.pollingInterval = setInterval(async () => {
      try {
        await this.checkSourcePositions();
      } catch (error) {
        logger.error(`Error polling source positions: ${error.message}`);
      }
    }, this.pollRate);
  }

  /**
   * Check source account for new/closed positions
   */
  async checkSourcePositions() {
    try {
      const currentPositions = await unifiedPoolClient.getPositions(this.sourceAccountId, this.sourceRegion);
      const currentPositionMap = new Map(currentPositions.map(p => [p.id, p]));

      // Check for new positions
      for (const [posId, position] of currentPositionMap) {
        if (!this.seenTrades.has(posId)) {
          // Mark as seen IMMEDIATELY to prevent duplicate triggers
          this.seenTrades.add(posId);
          this.sourcePositions.set(posId, position);

          // Get account nicknames from config
          const sourceNickname = this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId.slice(0, 8);
          const destNickname = this.routeConfig?.accounts?.[this.destAccountId]?.nickname || this.destAccountId.slice(0, 8);

          logger.info(`🎯 New trade detected from ${sourceNickname}:`);
          logger.info(`   Symbol: ${position.symbol}`);
          logger.info(`   Volume: ${position.volume} lots`);
          logger.info(`   Price: ${position.openPrice}`);
          logger.info(`   Position ID: ${position.id}`);
          tradeTracker.detected(position);

          // Send Telegram notification (only once per position)
          await this.notify('notifyPositionDetected', position, sourceNickname);

          // Check daily stats before processing
          const canTrade = this.checkDailyStats();
          const dailyStatsInfo = `Trades: ${this.dailyStats.trades}, Loss: $${this.dailyStats.dailyLoss.toFixed(2)}`;

          logger.info(`📊 Daily stats check for ${position.id}: ${canTrade ? 'PASSED ✅' : 'FAILED ❌'}`);
          logger.info(`   ${dailyStatsInfo}`);

          if (canTrade) {
            // Process the new trade
            logger.info(`🔄 Processing trade ${position.id} for route ${sourceNickname} → ${destNickname}`);
            const result = await this.executeCopyTrade(position);

            // Log result for debugging
            if (!result.success) {
              logger.warn(`⚠️ Trade ${position.id} execution failed: ${result.reason || result.error || 'Unknown reason'}`);
            }
          } else {
            logger.warn(`⚠️ Trade ${position.id} BLOCKED - Daily limit reached`);
            logger.warn(`   ${dailyStatsInfo}`);

            // Send Telegram notification about blocked trade
            await telegram.sendMessage(`<b>🚫 TRADE BLOCKED - Daily Limit</b>

<b>Position ID:</b> ${position.id}
<b>Symbol:</b> ${position.symbol}
<b>Volume:</b> ${position.volume} lots

<b>Daily Stats:</b>
• Trades today: ${this.dailyStats.trades}
• Loss today: $${this.dailyStats.dailyLoss.toFixed(2)}

<i>Trade rejected to protect daily limits</i>`);
          }
        }
      }

      // Check for closed positions
      for (const [posId, position] of this.sourcePositions) {
        if (!currentPositionMap.has(posId)) {
          const sourceNickname = this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId.slice(0, 8);
          logger.info(`📉 Position ${posId} closed on ${sourceNickname}`);

          // Get the mapping for this position
          const mapping = await positionMapper.getMapping(this.sourceAccountId, posId);

          if (mapping) {
            // Copy the exit to destination
            await this.copyPositionExit(mapping, null);
          } else {
            logger.warn(`⚠️ No mapping found for closed position ${posId}`);
          }

          // Remove from tracked positions
          this.sourcePositions.delete(posId);
        }
      }
    } catch (error) {
      logger.error(`Error checking source positions: ${error.message}`);
    }
  }

  /**
   * Check for missed trades after MetaAPI reconnection
   * This catches positions that opened/closed during disconnect windows
   */
  async checkForMissedTrades(accountId, disconnectDuration) {
    try {
      logger.warn(`🔍 GAP DETECTION: Checking for missed trades after ${disconnectDuration.toFixed(1)}s disconnect`);

      // Only check source account reconnections
      if (accountId !== this.sourceAccountId) {
        logger.debug(`Gap check skipped - not monitoring account ${accountId.slice(0, 8)}`);
        return;
      }

      // Get current positions from source account
      const currentPositions = await unifiedPoolClient.getPositions(this.sourceAccountId, this.sourceRegion);

      let missedCount = 0;

      // Check for any positions we haven't seen before
      for (const position of currentPositions) {
        if (!this.seenTrades.has(position.id)) {
          missedCount++;

          const sourceNickname = this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId.slice(0, 8);
          const destNickname = this.routeConfig?.accounts?.[this.destAccountId]?.nickname || this.destAccountId.slice(0, 8);

          logger.warn(`📍 MISSED TRADE DETECTED during disconnect:`);
          logger.warn(`   Position ID: ${position.id}`);
          logger.warn(`   Symbol: ${position.symbol}`);
          logger.warn(`   Volume: ${position.volume} lots`);
          logger.warn(`   Open Price: ${position.openPrice}`);
          logger.warn(`   Disconnect duration: ${disconnectDuration.toFixed(1)}s`);

          // Mark as seen immediately
          this.seenTrades.add(position.id);
          this.sourcePositions.set(position.id, position);

          // Send alert notification about gap detection
          await telegram.sendMessage(`<b>🔍 GAP DETECTION ALERT</b>

<b>Missed trade found after reconnection:</b>

<b>Route:</b> ${sourceNickname} → ${destNickname}
<b>Position ID:</b> ${position.id}
<b>Symbol:</b> ${position.symbol}
<b>Volume:</b> ${position.volume} lots
<b>Price:</b> ${position.openPrice}
<b>Disconnect:</b> ${disconnectDuration.toFixed(1)}s

<i>Processing trade now...</i>`);

          // Check daily stats before processing
          const canTrade = this.checkDailyStats();
          const dailyStatsInfo = `Trades: ${this.dailyStats.trades}, Loss: $${this.dailyStats.dailyLoss.toFixed(2)}`;

          logger.info(`📊 Daily stats check for missed trade ${position.id}: ${canTrade ? 'PASSED ✅' : 'FAILED ❌'}`);
          logger.info(`   ${dailyStatsInfo}`);

          if (canTrade) {
            // Process the missed trade
            logger.info(`🔄 Processing missed trade ${position.id} for route ${sourceNickname} → ${destNickname}`);
            const result = await this.executeCopyTrade(position);

            if (result.success) {
              logger.info(`✅ Successfully copied missed trade ${position.id}`);
            } else {
              logger.warn(`⚠️ Failed to copy missed trade ${position.id}: ${result.reason || result.error}`);
            }
          } else {
            logger.warn(`⚠️ Missed trade ${position.id} BLOCKED - Daily limit reached`);
            logger.warn(`   ${dailyStatsInfo}`);

            await telegram.sendMessage(`<b>🚫 MISSED TRADE BLOCKED</b>

<b>Position ID:</b> ${position.id}
<b>Symbol:</b> ${position.symbol}

<b>Daily Stats:</b>
• Trades: ${this.dailyStats.trades}
• Loss: $${this.dailyStats.dailyLoss.toFixed(2)}

<i>Trade rejected to protect daily limits</i>`);
          }
        }
      }

      if (missedCount === 0) {
        logger.info(`✅ Gap detection complete - no missed trades`);
      } else {
        logger.warn(`⚠️ Gap detection found ${missedCount} missed trade(s)`);
      }
    } catch (error) {
      logger.error(`❌ Error during gap detection: ${error.message}`);
    }
  }

  /**
   * Stop the copy trader
   */
  stop() {
    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    logger.info('🛑 Copy trader stopped');
  }

  /**
   * Daily stats check (called by monitor events)
   * NOTE: Daily loss limit enforcement removed - use frequency_filter or custom filter in JSON config
   */
  checkDailyStats() {
    const today = new Date().toDateString();
    if (this.dailyStats.date !== today) {
      this.dailyStats = { date: today, trades: 0, profit: 0, dailyLoss: 0 };
      this.processedTrades.clear(); // Reset processed trades for new day
      logger.info(`📅 New trading day started: ${today}`);
    }

    // No hardcoded limits - all limits must come from JSON config filters
    return true; // Always can trade unless blocked by config filters
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
   * ALL validation now comes from JSON config filters - no hardcoded rules
   */
  async shouldCopyTrade(trade) {
    const reasons = [];
    logger.info(`🔍 VALIDATION START for trade ${trade.id}`);

    // CHECK #1: Duplicate prevention (essential - prevents reprocessing)
    logger.info(`   1️⃣ Checking processed trades set (size: ${this.processedTrades.size})`);
    if (this.processedTrades.has(trade.id)) {
      logger.warn(`   ❌ Duplicate: Trade ${trade.id} already processed`);
      logger.warn(`⏭️ Trade ${trade.id} SKIPPED - already processed (${this.processedTrades.size} trades in set)`);
      return false; // Silent skip - already processed
    }
    logger.info(`   ✅ Not a duplicate - proceeding to filter checks`);

    // ===== ALL VALIDATION FROM JSON CONFIG FILTERS =====
    // Apply filters from routing-config.json if activeFilters is configured
    logger.info(`   Applying ${this.config.activeFilters?.length || 0} JSON config filters`);
    if (this.config.activeFilters && Array.isArray(this.config.activeFilters)) {
      for (const filter of this.config.activeFilters) {
        logger.info(`   🔍 Checking filter: ${filter.name || filter.type}`);
        const filterResult = await this.applyFilter(filter, trade);
        if (!filterResult.passed) {
          logger.warn(`   ❌ Filter ${filter.name || filter.type} FAILED: ${filterResult.reason}`);
          reasons.push(filterResult.reason);
          tradeTracker.rejected(trade, reasons);

          // Send Telegram notification about filter rejection
          await this.notify('notifyFilterRejection', trade, reasons);
          return false;
        }
        logger.info(`   ✅ Filter ${filter.name || filter.type} PASSED`);
      }
    }

    // Log decision with enhanced details
    const sourceNickname = this.routeConfig?.accounts?.[this.sourceAccountId]?.nickname || this.sourceAccountId;
    const destNickname = this.routeConfig?.accounts?.[this.destAccountId]?.nickname || this.destAccountId;

    logger.info(`✅ Trade ${trade.id} PASSED all filters for route ${sourceNickname} → ${destNickname}`);
    return true;
  }

  /**
   * Detect martingale pattern - repeated opens on same symbol with escalating lot sizes
   * NOTE: This method is now ONLY called from volume_check filter in JSON config
   * No longer called automatically - must be explicitly configured in filters
   */
  isMartingalePattern(trade, maxVolumeMultiplier = 1.5) {
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
    if (lastTrade.type === trade.type && trade.volume > lastTrade.volume * maxVolumeMultiplier) {
      logger.info(`⚠️ Martingale pattern detected on ${symbol}:`);
      logger.info(`   Previous: ${lastTrade.volume} lots`);
      logger.info(`   Current: ${trade.volume} lots (${((trade.volume / lastTrade.volume - 1) * 100).toFixed(1)}% increase)`);
      logger.info(`   Pattern: Repeated opens with escalating size`);
      return true;
    }

    // Record this trade
    recentTrades.push({ volume: trade.volume, timestamp: Date.now(), type: trade.type });

    return false;
  }

  /**
   * Detect grid pattern (multiple positions at similar prices)
   * NOTE: This method is no longer used - grid detection removed
   * Keep for backward compatibility but does nothing
   */
  async isGridPattern(trade) {
    return false; // Grid detection disabled - must use JSON config filters if needed
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
        await this.notify('notifyCopyFailure', sourceTrade, 'Already copied', 'Position already exists in destination account');
        return { success: false, reason: 'Already copied' };
      }
      
      // Calculate position size with degressive scaling
      const destVolume = this.calculatePositionSize(sourceTrade.volume);
      if (destVolume === 0) {
        this.processedTrades.add(sourceTrade.id);
        tradeTracker.rejected(sourceTrade, ['invalid position size']);
        await this.notify('notifyCopyFailure', sourceTrade, 'Invalid position size', 'Calculated volume is 0');
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
      const calculatedSL = this.calculateStopLoss(sourceTrade);
      const calculatedTP = this.calculateTakeProfit(sourceTrade);

      logger.info(`📊 Trade execution details:`);
      logger.info(`   Source SL: ${sourceTrade.stopLoss || 'none'}, TP: ${sourceTrade.takeProfit || 'none'}`);
      logger.info(`   Calculated SL: ${calculatedSL}, TP: ${calculatedTP}`);
      logger.info(`   Entry Price: ${sourceTrade.openPrice || sourceTrade.currentPrice || 'unknown'}`);

      const tradeData = {
        symbol: sourceTrade.symbol,
        action: isBuy ? 'BUY' : 'SELL',
        actionType: isBuy ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
        volume: destVolume,
        stopLoss: calculatedSL,
        takeProfit: calculatedTP,
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
        // CRITICAL: Use positionId (not orderId) for tracking
        const destPositionId = result.positionId || result.orderId; // Prefer positionId
        await positionMapper.createMapping(this.sourceAccountId, sourceTrade.id, {
          accountId: this.destAccountId,
          positionId: destPositionId,
          sourceSymbol: sourceTrade.symbol,
          destSymbol: sourceTrade.symbol,
          sourceVolume: sourceTrade.volume,
          destVolume: destVolume,
          openTime: sourceTrade.openTime,
          sourceOpenPrice: sourceTrade.openPrice,
          destOpenPrice: result.openPrice || sourceTrade.openPrice
        });

        logger.info(`🔗 Created mapping: source ${sourceTrade.id} → dest ${destPositionId}`);

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

      // Send Telegram failure notification
      await this.notify('notifyCopyFailure', sourceTrade, 'Exception during execution', error.message);

      return { success: false, error: error.message };
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
      'ESOCKETTIMEDOUT',
      'Position not found',  // Exit copy retry - position might not be synced yet
      'Invalid response from getPositions'  // API connection issues
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
   * Calculate stop loss
   * NOTE: Hardcoded buffer removed - SL copied directly from source or account defaults
   */
  calculateStopLoss(trade) {
    const pipSize = trade.symbol.includes('JPY') ? 0.01 : 0.0001;

    // If trade has SL, use it directly (no buffer)
    if (trade.stopLoss) {
      return trade.stopLoss;
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
    // Increased minimum distances to meet broker requirements (many brokers require 100+ pips for XAUUSD)
    const defaultSL = trade.symbol === 'XAUUSD' ? 150 : 80; // pips
    const slDistance = defaultSL * pipSize;

    if (trade.type === 'POSITION_TYPE_BUY') {
      return trade.openPrice - slDistance;
    } else {
      return trade.openPrice + slDistance;
    }
  }

  /**
   * Calculate take profit
   * NOTE: Hardcoded buffer removed - TP copied directly from source or account defaults
   */
  calculateTakeProfit(trade) {
    const pipSize = trade.symbol.includes('JPY') ? 0.01 : 0.0001;

    // If trade has TP, use it directly (no buffer)
    if (trade.takeProfit) {
      return trade.takeProfit;
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
    // Increased minimum distances to meet broker requirements (many brokers require 100+ pips for XAUUSD)
    const defaultTP = trade.symbol === 'XAUUSD' ? 300 : 160; // pips (2:1 risk/reward)
    const tpDistance = defaultTP * pipSize;

    if (trade.type === 'POSITION_TYPE_BUY') {
      return trade.openPrice + tpDistance;
    } else {
      return trade.openPrice - tpDistance;
    }
  }

  /**
   * Copy position exit to destination account with retry logic
   */
  async copyPositionExit(mapping, closeInfo) {
    const maxRetries = 3;
    const retryDelays = [5000, 10000, 20000]; // 5s, 10s, 20s

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const sourceNickname = this.routeConfig?.accounts?.[mapping.sourceAccountId]?.nickname || mapping.sourceAccountId;
        const destNickname = this.routeConfig?.accounts?.[mapping.destAccountId]?.nickname || mapping.destAccountId;

        logger.info(`📋 COPYING EXIT for route ${sourceNickname} → ${destNickname} (attempt ${attempt}/${maxRetries}):`);
        logger.info(`   Source position: ${mapping.sourcePositionId}`);
        logger.info(`   Destination position: ${mapping.destPositionId}`);
        logger.info(`   Close reason: ${closeInfo?.reason || 'position closed'}`);
        logger.info(`   Source profit: $${closeInfo?.profit?.toFixed(2) || '0.00'}`);

        // Check if destination position is still open
        const destPositions = await unifiedPoolClient.getPositions(mapping.destAccountId, this.destRegion);

        // Check if we got an actual response or connection error (empty array might be legit)
        if (!Array.isArray(destPositions)) {
          throw new Error('Invalid response from getPositions - connection may be down');
        }

        const destPosition = destPositions.find(pos => pos.id === mapping.destPositionId);

        if (!destPosition) {
          // Position not found - could be already closed or connection issue
          // Only delete mapping if we're sure (not on first attempt or after retries)
          if (attempt === maxRetries) {
            logger.warn(`⚠️ Destination position ${mapping.destPositionId} not found after ${maxRetries} attempts - assuming closed`);
            await positionMapper.deleteMapping(mapping.sourceAccountId, mapping.sourcePositionId);
            return;
          } else {
            // Retry - might be connection issue
            throw new Error('Position not found in response - retrying');
          }
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
          const expectedProfit = closeInfo?.profit ? closeInfo.profit * profitRatio : 0;

          logger.info(`✅ EXIT COPIED SUCCESSFULLY!`);
          logger.info(`   Destination profit: $${destProfit.toFixed(2)}`);
          if (closeInfo?.profit) {
            logger.info(`   Expected profit: $${expectedProfit.toFixed(2)}`);
            const variance = expectedProfit !== 0 ? ((destProfit - expectedProfit) / expectedProfit * 100) : 0;
            logger.info(`   Profit variance: ${variance.toFixed(1)}%`);
          }

          // Send telegram notification
          await this.notify('notifyExitCopied', mapping, closeInfo, {
            profit: destProfit,
            closeReason: closeInfo?.reason || 'position closed'
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

          // Success - exit retry loop
          return;
        } else {
          // Close failed - retry
          const errorMsg = closeResult.error || 'Unknown error';
          logger.error(`❌ Failed to close position ${mapping.destPositionId}: ${errorMsg}`);

          if (attempt < maxRetries && this.isRetryableError(errorMsg)) {
            const delay = retryDelays[attempt - 1];
            logger.warn(`⏳ Retrying exit copy in ${delay/1000}s... (${maxRetries - attempt} attempts remaining)`);
            await this.sleep(delay);
            continue; // Retry
          } else {
            // Non-retryable or last attempt
            await this.notify('notifyExitCopyFailure', mapping, errorMsg);
            return;
          }
        }
      } catch (error) {
        const isRetryable = this.isRetryableError(error.message);

        logger.error(`Error copying position exit (attempt ${attempt}): ${error.message}`);

        if (attempt < maxRetries && isRetryable) {
          const delay = retryDelays[attempt - 1];
          logger.warn(`⏳ Retrying exit copy in ${delay/1000}s... (${maxRetries - attempt} attempts remaining)`);
          await this.sleep(delay);
          continue; // Retry
        } else {
          // Non-retryable or last attempt failed
          logger.error(`❌ Failed to copy exit after ${attempt} attempts`);
          await this.notify('notifyExitCopyFailure', mapping, error.message);
          return;
        }
      }
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

        case 'volume_check':
          return this.checkVolumeCheckFilter(filter, trade);

        case 'time_filter':
          return this.checkTimeFilter(filter, trade);

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
   * Check volume multiplier for martingale detection
   */
  checkVolumeCheckFilter(filter, trade) {
    if (!filter.maxVolumeMultiplier) return { passed: true };

    // Get recent trades for this symbol
    const symbolTrades = this.recentTradesBySymbol.get(trade.symbol) || [];

    // Find most recent trade on same symbol
    const recentTrades = symbolTrades.filter(t => Date.now() - t.timestamp < 3600000); // Last hour

    if (recentTrades.length === 0) {
      return { passed: true }; // First trade on symbol
    }

    // Check if volume is significantly larger than previous (martingale pattern)
    const lastTrade = recentTrades[recentTrades.length - 1];
    const volumeMultiplier = trade.volume / lastTrade.volume;

    if (volumeMultiplier > filter.maxVolumeMultiplier) {
      return {
        passed: false,
        reason: `Volume multiplier ${volumeMultiplier.toFixed(2)}x > ${filter.maxVolumeMultiplier}x max (${filter.name})`
      };
    }

    return { passed: true };
  }

  /**
   * Check trading time restrictions
   */
  checkTimeFilter(filter, trade) {
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday

    // Check allowed hours
    if (filter.allowedHoursUTC && Array.isArray(filter.allowedHoursUTC)) {
      if (!filter.allowedHoursUTC.includes(hour)) {
        return {
          passed: false,
          reason: `Trading hour ${hour}:00 UTC not allowed (${filter.name})`
        };
      }
    }

    // Check allowed days (1=Monday through 5=Friday)
    if (filter.allowedDays && Array.isArray(filter.allowedDays)) {
      if (!filter.allowedDays.includes(day)) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return {
          passed: false,
          reason: `Trading on ${dayNames[day]} not allowed (${filter.name})`
        };
      }
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
