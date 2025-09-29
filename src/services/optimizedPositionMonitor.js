/**
 * Optimized Position Monitor
 * Efficient position tracking with reduced polling when positions are stable
 */

import EventEmitter from 'events';
import { logger } from '../utils/logger.js';

class OptimizedPositionMonitor extends EventEmitter {
  constructor(poolClient) {
    super();
    this.poolClient = poolClient;
    this.accounts = new Map(); // accountId -> monitoring state
    this.monitoringInterval = null;
    this.baseInterval = 2000; // 2 seconds when active
    this.idleInterval = 10000; // 10 seconds when idle
    this.currentInterval = this.baseInterval;
    this.positionHashes = new Map(); // track position state changes
  }

  /**
   * Start monitoring an account
   */
  startMonitoring(accountId, region) {
    if (!this.accounts.has(accountId)) {
      this.accounts.set(accountId, {
        accountId,
        region,
        positions: new Map(),
        lastActivity: Date.now(),
        active: true
      });

      logger.info(`📡 Started optimized monitoring for ${accountId} in ${region}`);

      // Start interval if not running
      if (!this.monitoringInterval) {
        this.startInterval();
      }
    }
  }

  /**
   * Stop monitoring an account
   */
  stopMonitoring(accountId) {
    if (this.accounts.delete(accountId)) {
      logger.info(`🛑 Stopped monitoring for ${accountId}`);

      // Stop interval if no more accounts
      if (this.accounts.size === 0 && this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }
    }
  }

  /**
   * Start the monitoring interval
   */
  startInterval() {
    this.monitoringInterval = setInterval(() => {
      this.checkAllAccounts();
    }, this.currentInterval);
  }

  /**
   * Check all monitored accounts
   */
  async checkAllAccounts() {
    const checkPromises = [];

    for (const [accountId, state] of this.accounts) {
      checkPromises.push(this.checkAccount(accountId, state));
    }

    await Promise.all(checkPromises);

    // Adjust interval based on activity
    this.adjustInterval();
  }

  /**
   * Check a single account for position changes
   */
  async checkAccount(accountId, state) {
    try {
      const positions = await this.poolClient.getPositions(accountId, state.region);
      const currentPositionMap = new Map();
      const now = Date.now();

      // Build current position map
      for (const position of positions) {
        currentPositionMap.set(position.id, position);
      }

      // Check for new positions
      for (const [posId, position] of currentPositionMap) {
        if (!state.positions.has(posId)) {
          state.lastActivity = now;
          logger.info(`🎯 New position detected: ${posId} on ${accountId}`);
          this.emit('positionOpened', {
            accountId,
            position
          });
        } else {
          // Check for changes (volume, SL, TP)
          const oldPos = state.positions.get(posId);
          if (this.hasPositionChanged(oldPos, position)) {
            state.lastActivity = now;
            this.emit('positionUpdated', {
              accountId,
              oldPosition: oldPos,
              newPosition: position
            });
          }
        }
      }

      // Check for closed positions
      for (const [posId, position] of state.positions) {
        if (!currentPositionMap.has(posId)) {
          state.lastActivity = now;
          logger.info(`📉 Position closed: ${posId} on ${accountId}`);

          // Get close details from history
          const closeInfo = await this.getCloseDetails(accountId, state.region, posId);

          this.emit('positionClosed', {
            accountId,
            positionId: posId,
            position,
            closeInfo
          });
        }
      }

      // Update state
      state.positions = currentPositionMap;

    } catch (error) {
      logger.error(`Error checking account ${accountId}:`, error);
    }
  }

  /**
   * Check if position has changed
   */
  hasPositionChanged(oldPos, newPos) {
    return oldPos.volume !== newPos.volume ||
           oldPos.stopLoss !== newPos.stopLoss ||
           oldPos.takeProfit !== newPos.takeProfit ||
           oldPos.profit !== newPos.profit;
  }

  /**
   * Get position close details from history
   */
  async getCloseDetails(accountId, region, positionId) {
    try {
      const history = await this.poolClient.getRecentHistory(accountId, region, 1);

      // Find deals for this position
      const positionDeals = history.filter(deal =>
        deal.positionId === positionId &&
        (deal.type === 'DEAL_TYPE_SELL' || deal.type === 'DEAL_TYPE_BUY')
      );

      if (positionDeals.length > 0) {
        const closeDeal = positionDeals[positionDeals.length - 1];
        return {
          closeTime: closeDeal.time,
          closePrice: closeDeal.price,
          profit: closeDeal.profit,
          commission: closeDeal.commission,
          swap: closeDeal.swap,
          reason: this.determineCloseReason(closeDeal)
        };
      }

      return {
        closeTime: new Date().toISOString(),
        reason: 'UNKNOWN'
      };
    } catch (error) {
      logger.error('Error getting close details:', error);
      return {
        closeTime: new Date().toISOString(),
        reason: 'ERROR'
      };
    }
  }

  /**
   * Determine close reason from deal
   */
  determineCloseReason(deal) {
    const comment = (deal.comment || '').toLowerCase();

    if (comment.includes('[tp]') || comment.includes('take profit')) {
      return 'TAKE_PROFIT';
    } else if (comment.includes('[sl]') || comment.includes('stop loss')) {
      return 'STOP_LOSS';
    } else if (comment.includes('so:')) {
      return 'STOP_OUT';
    } else if (deal.reason === 'CLIENT') {
      return 'MANUAL';
    } else if (deal.reason === 'EXPERT') {
      return 'EA_CLOSE';
    }

    return 'OTHER';
  }

  /**
   * Adjust polling interval based on activity
   */
  adjustInterval() {
    const now = Date.now();
    const recentActivity = Array.from(this.accounts.values())
      .some(state => now - state.lastActivity < 30000); // 30 seconds

    const newInterval = recentActivity ? this.baseInterval : this.idleInterval;

    if (newInterval !== this.currentInterval) {
      this.currentInterval = newInterval;

      // Restart interval with new timing
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.startInterval();
      }

      logger.info(`⚙️ Adjusted monitoring interval to ${this.currentInterval}ms`);
    }
  }

  /**
   * Get monitoring statistics
   */
  getStats() {
    const stats = {
      monitoredAccounts: this.accounts.size,
      currentInterval: this.currentInterval,
      accounts: {}
    };

    for (const [accountId, state] of this.accounts) {
      stats.accounts[accountId] = {
        positions: state.positions.size,
        lastActivity: new Date(state.lastActivity).toISOString()
      };
    }

    return stats;
  }
}

export default OptimizedPositionMonitor;