/**
 * cTrader Streaming Handler
 * Manages real-time data streams and execution events
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import dataMapper from './dataMapper.js';
import ctraderPoolClient from './ctraderPoolClient.js';

class CTraderStreamingHandler extends EventEmitter {
  constructor() {
    super();
    this.subscriptions = new Map(); // symbol -> Set of accountIds
    this.priceStreams = new Map(); // symbol -> price data
    this.positionUpdates = new Map(); // accountId -> position updates
    this.executionEvents = [];
    this.isRunning = false;
    this.pollInterval = null;
    this.eventPollInterval = null;
  }

  /**
   * Start streaming handler
   */
  async start() {
    if (this.isRunning) {
      logger.warn('cTrader streaming handler already running');
      return;
    }

    logger.info('Starting cTrader streaming handler');
    this.isRunning = true;

    // Start polling for price updates
    this.pollInterval = setInterval(() => {
      this.pollPriceUpdates();
    }, 500); // Poll every 500ms

    // Start polling for execution events
    this.eventPollInterval = setInterval(() => {
      this.pollExecutionEvents();
    }, 1000); // Poll every second

    this.emit('started');
  }

  /**
   * Stop streaming handler
   */
  async stop() {
    logger.info('Stopping cTrader streaming handler');

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.eventPollInterval) {
      clearInterval(this.eventPollInterval);
      this.eventPollInterval = null;
    }

    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * Subscribe to symbol price updates
   */
  async subscribeToSymbol(symbol, accountId = null) {
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }

    if (accountId) {
      this.subscriptions.get(symbol).add(accountId);
    }

    // Initialize streaming for the symbol
    try {
      await ctraderPoolClient.subscribeToSymbol(symbol, accountId);
      logger.info(`Subscribed to ${symbol} price updates`);
      this.emit('subscribed', { symbol, accountId });
    } catch (error) {
      logger.error(`Failed to subscribe to ${symbol}: ${error.message}`);
      this.emit('error', { type: 'subscription', symbol, error });
    }
  }

  /**
   * Unsubscribe from symbol
   */
  unsubscribeFromSymbol(symbol, accountId = null) {
    if (!this.subscriptions.has(symbol)) {
      return;
    }

    if (accountId) {
      this.subscriptions.get(symbol).delete(accountId);
      if (this.subscriptions.get(symbol).size === 0) {
        this.subscriptions.delete(symbol);
      }
    } else {
      this.subscriptions.delete(symbol);
    }

    logger.info(`Unsubscribed from ${symbol}`);
    this.emit('unsubscribed', { symbol, accountId });
  }

  /**
   * Poll for price updates
   */
  async pollPriceUpdates() {
    if (this.subscriptions.size === 0) {
      return;
    }

    try {
      // Get all prices at once
      const allPrices = await ctraderPoolClient.getAllPrices();

      // Process each subscribed symbol
      for (const [symbol, accountIds] of this.subscriptions) {
        const priceData = allPrices[symbol];
        if (priceData) {
          // Check if price changed
          const lastPrice = this.priceStreams.get(symbol);
          if (!lastPrice ||
              lastPrice.bid !== priceData.bid ||
              lastPrice.ask !== priceData.ask) {

            // Update cached price
            this.priceStreams.set(symbol, priceData);

            // Emit price update event
            this.emit('price', {
              symbol,
              bid: priceData.bid,
              ask: priceData.ask,
              spread: priceData.ask - priceData.bid,
              brokerTime: priceData.brokerTime,
              accountIds: Array.from(accountIds)
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Error polling prices: ${error.message}`);
    }
  }

  /**
   * Poll for execution events and position updates
   */
  async pollExecutionEvents() {
    // Get unique account IDs from all subscriptions
    const accountIds = new Set();
    for (const accounts of this.subscriptions.values()) {
      for (const accountId of accounts) {
        if (accountId) {
          accountIds.add(accountId);
        }
      }
    }

    // Poll positions for each account
    for (const accountId of accountIds) {
      try {
        await this.checkPositionChanges(accountId);
      } catch (error) {
        logger.error(`Error checking positions for ${accountId}: ${error.message}`);
      }
    }
  }

  /**
   * Check for position changes
   */
  async checkPositionChanges(accountId) {
    const positions = await ctraderPoolClient.getPositions(accountId);
    const lastPositions = this.positionUpdates.get(accountId) || [];

    // Create position maps for comparison
    const currentMap = new Map(positions.map(p => [p.id, p]));
    const lastMap = new Map(lastPositions.map(p => [p.id, p]));

    // Check for new positions
    for (const position of positions) {
      const lastPosition = lastMap.get(position.id);

      if (!lastPosition) {
        // New position opened
        this.emit('positionOpened', {
          accountId,
          position,
          timestamp: new Date().toISOString()
        });

        // Create execution event
        this.emit('executionEvent', {
          type: 'POSITION_OPEN',
          accountId,
          positionId: position.id,
          symbol: position.symbol,
          side: position.type,
          volume: position.volume,
          price: position.openPrice,
          timestamp: position.openTime
        });
      } else {
        // Check for modifications
        if (lastPosition.stopLoss !== position.stopLoss ||
            lastPosition.takeProfit !== position.takeProfit) {
          this.emit('positionModified', {
            accountId,
            positionId: position.id,
            changes: {
              stopLoss: position.stopLoss,
              takeProfit: position.takeProfit,
              previousStopLoss: lastPosition.stopLoss,
              previousTakeProfit: lastPosition.takeProfit
            },
            timestamp: position.updateTime
          });
        }

        // Check for profit/loss changes
        if (Math.abs(lastPosition.profit - position.profit) > 0.01) {
          this.emit('positionUpdate', {
            accountId,
            position,
            profitChange: position.profit - lastPosition.profit,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Check for closed positions
    for (const lastPosition of lastPositions) {
      if (!currentMap.has(lastPosition.id)) {
        // Position was closed
        this.emit('positionClosed', {
          accountId,
          positionId: lastPosition.id,
          symbol: lastPosition.symbol,
          closedProfit: lastPosition.profit,
          timestamp: new Date().toISOString()
        });

        // Create execution event
        this.emit('executionEvent', {
          type: 'POSITION_CLOSE',
          accountId,
          positionId: lastPosition.id,
          symbol: lastPosition.symbol,
          side: lastPosition.type,
          volume: lastPosition.volume,
          profit: lastPosition.profit,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Update cached positions
    this.positionUpdates.set(accountId, positions);
  }

  /**
   * Get current price for symbol
   */
  getCurrentPrice(symbol) {
    return this.priceStreams.get(symbol) || null;
  }

  /**
   * Get all current prices
   */
  getAllPrices() {
    const prices = {};
    for (const [symbol, priceData] of this.priceStreams) {
      prices[symbol] = priceData;
    }
    return prices;
  }

  /**
   * Get positions for account
   */
  getPositions(accountId) {
    return this.positionUpdates.get(accountId) || [];
  }

  /**
   * Monitor account for trading activity
   */
  async monitorAccount(accountId, symbols = []) {
    logger.info(`Starting monitoring for account ${accountId}`);

    // Subscribe to symbols
    for (const symbol of symbols) {
      await this.subscribeToSymbol(symbol, accountId);
    }

    // Initial position sync
    try {
      const positions = await ctraderPoolClient.getPositions(accountId);
      this.positionUpdates.set(accountId, positions);
      logger.info(`Synced ${positions.length} positions for account ${accountId}`);
    } catch (error) {
      logger.error(`Failed to sync positions for ${accountId}: ${error.message}`);
    }

    this.emit('accountMonitoring', { accountId, symbols });
  }

  /**
   * Stop monitoring account
   */
  stopMonitoringAccount(accountId) {
    logger.info(`Stopping monitoring for account ${accountId}`);

    // Unsubscribe from all symbols for this account
    for (const [symbol, accountIds] of this.subscriptions) {
      accountIds.delete(accountId);
      if (accountIds.size === 0) {
        this.subscriptions.delete(symbol);
      }
    }

    // Clear position cache
    this.positionUpdates.delete(accountId);

    this.emit('accountMonitoringStopped', { accountId });
  }

  /**
   * Get streaming statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      subscribedSymbols: this.subscriptions.size,
      monitoredAccounts: this.positionUpdates.size,
      cachedPrices: this.priceStreams.size,
      totalExecutionEvents: this.executionEvents.length
    };
  }

  /**
   * Process execution event (called by pool when trade executes)
   */
  processExecutionEvent(event) {
    // Store event
    this.executionEvents.push({
      ...event,
      timestamp: new Date().toISOString()
    });

    // Keep only last 1000 events
    if (this.executionEvents.length > 1000) {
      this.executionEvents = this.executionEvents.slice(-1000);
    }

    // Emit typed events
    switch (event.type) {
      case 'ORDER_FILL':
        this.emit('orderFilled', event);
        break;
      case 'ORDER_CANCEL':
        this.emit('orderCancelled', event);
        break;
      case 'POSITION_OPEN':
        this.emit('positionOpened', event);
        break;
      case 'POSITION_CLOSE':
        this.emit('positionClosed', event);
        break;
      case 'POSITION_MODIFY':
        this.emit('positionModified', event);
        break;
      default:
        this.emit('executionEvent', event);
    }
  }

  /**
   * Get recent execution events
   */
  getRecentExecutionEvents(limit = 100) {
    return this.executionEvents.slice(-limit);
  }
}

// Export singleton instance
export default new CTraderStreamingHandler();