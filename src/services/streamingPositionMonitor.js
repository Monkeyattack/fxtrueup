/**
 * Streaming Position Monitor
 * Real-time position tracking using MetaAPI streaming connection
 */

import EventEmitter from 'events';
import { logger } from '../utils/logger.js';

/**
 * SynchronizationListener implementation for position tracking
 */
class PositionSynchronizationListener {
  constructor(monitor) {
    this.monitor = monitor;
  }

  /**
   * Called when position is updated
   */
  async onPositionUpdated(instanceIndex, position) {
    logger.debug(`Position updated: ${position.id} - ${position.symbol} ${position.volume} lots`);

    const wasTracked = this.monitor.positions.has(position.id);
    this.monitor.positions.set(position.id, position);

    // Check for partial close (volume reduction)
    if (wasTracked) {
      const oldPosition = this.monitor.positions.get(position.id);
      if (oldPosition && oldPosition.volume > position.volume) {
        logger.info(`🔄 Partial close detected for position ${position.id}: ${oldPosition.volume} → ${position.volume}`);
        this.monitor.emit('positionPartiallylosed', {
          positionId: position.id,
          oldVolume: oldPosition.volume,
          newVolume: position.volume,
          position: position
        });
      }
    }

    this.monitor.emit('positionUpdated', position);
  }

  /**
   * Called when position is removed (closed)
   */
  async onPositionRemoved(instanceIndex, positionId) {
    logger.info(`📉 Position closed via streaming: ${positionId}`);

    const position = this.monitor.positions.get(positionId);
    if (position) {
      // Get the closing deal if available
      const closeDeal = this.monitor.recentDeals.get(positionId);

      this.monitor.emit('positionClosed', {
        positionId: positionId,
        position: position,
        closeDeal: closeDeal,
        closeTime: new Date().toISOString()
      });

      // Clean up
      this.monitor.positions.delete(positionId);
      this.monitor.recentDeals.delete(positionId);
    }
  }

  /**
   * Called when new deal is added
   */
  async onDealAdded(instanceIndex, deal) {
    logger.debug(`Deal added: ${deal.id} for position ${deal.positionId}`);

    // Store recent deals for position close info
    if (deal.positionId && (deal.type === 'DEAL_TYPE_SELL' || deal.type === 'DEAL_TYPE_BUY')) {
      this.monitor.recentDeals.set(deal.positionId, deal);

      // Clean up old deals after 5 minutes
      setTimeout(() => {
        if (this.monitor.recentDeals.get(deal.positionId) === deal) {
          this.monitor.recentDeals.delete(deal.positionId);
        }
      }, 5 * 60 * 1000);
    }

    this.monitor.emit('dealAdded', deal);
  }

  /**
   * Called when positions are synchronized
   */
  async onPositionsSynchronized(instanceIndex, synchronizationId) {
    logger.info(`✅ Positions synchronized. Tracking ${this.monitor.positions.size} positions`);
    this.monitor.emit('synchronized', {
      positionCount: this.monitor.positions.size,
      synchronizationId
    });
  }

  /**
   * Called on connection status change
   */
  async onConnected(instanceIndex) {
    logger.info('📡 Streaming connection connected');
    this.monitor.connected = true;
    this.monitor.emit('connected');
  }

  async onDisconnected(instanceIndex) {
    logger.warn('🔌 Streaming connection disconnected');
    this.monitor.connected = false;
    this.monitor.emit('disconnected');
  }

  /**
   * Called when stream is closed
   */
  async onStreamClosed(instanceIndex) {
    logger.info('🔚 Streaming connection closed');
    this.monitor.emit('streamClosed');
  }
}

/**
 * Streaming Position Monitor
 * Tracks positions in real-time using MetaAPI streaming
 */
class StreamingPositionMonitor extends EventEmitter {
  constructor() {
    super();
    this.positions = new Map(); // positionId -> position
    this.recentDeals = new Map(); // positionId -> deal
    this.streamingConnection = null;
    this.listener = null;
    this.accountId = null;
    this.region = null;
    this.connected = false;
    this.reconnectTimer = null;
  }

  /**
   * Start monitoring positions for an account
   */
  async startMonitoring(accountId, region, poolClient) {
    try {
      if (this.streamingConnection && this.accountId !== accountId) {
        await this.stopMonitoring();
      }

      this.accountId = accountId;
      this.region = region;

      logger.info(`🚀 Starting streaming position monitor for ${accountId} in ${region}`);

      // Initialize streaming via pool
      const initialized = await poolClient.initializeStreaming(accountId, region);
      if (!initialized) {
        throw new Error('Failed to initialize streaming');
      }

      // Get streaming connection from pool
      this.streamingConnection = await poolClient.getStreamingConnection(accountId, region);
      if (!this.streamingConnection) {
        throw new Error('Failed to get streaming connection');
      }

      // Create and add listener
      this.listener = new PositionSynchronizationListener(this);
      this.streamingConnection.addSynchronizationListener(this.listener);

      // Subscribe to terminal state
      await this.streamingConnection.subscribeToMarketData('*'); // All symbols

      logger.info('✅ Streaming position monitor started successfully');

      // Set up auto-reconnect
      this.setupAutoReconnect(poolClient);

      return true;
    } catch (error) {
      logger.error('Failed to start streaming monitor:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring() {
    try {
      logger.info('🛑 Stopping streaming position monitor');

      if (this.reconnectTimer) {
        clearInterval(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.streamingConnection && this.listener) {
        this.streamingConnection.removeSynchronizationListener(this.listener);
      }

      this.streamingConnection = null;
      this.listener = null;
      this.positions.clear();
      this.recentDeals.clear();
      this.connected = false;

      logger.info('✅ Streaming monitor stopped');
    } catch (error) {
      logger.error('Error stopping streaming monitor:', error);
    }
  }

  /**
   * Get current positions
   */
  getActivePositions() {
    return Array.from(this.positions.values());
  }

  /**
   * Get position by ID
   */
  getPosition(positionId) {
    return this.positions.get(positionId);
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring() {
    return this.connected && this.streamingConnection !== null;
  }

  /**
   * Set up auto-reconnect logic
   */
  setupAutoReconnect(poolClient) {
    // Check connection every 30 seconds
    this.reconnectTimer = setInterval(async () => {
      if (!this.connected && this.accountId) {
        logger.warn('🔄 Attempting to reconnect streaming...');
        await this.startMonitoring(this.accountId, this.region, poolClient);
      }
    }, 30000);
  }

  /**
   * Get monitoring stats
   */
  getStats() {
    return {
      connected: this.connected,
      accountId: this.accountId,
      region: this.region,
      activePositions: this.positions.size,
      recentDeals: this.recentDeals.size
    };
  }
}

// Export singleton for shared use
export default new StreamingPositionMonitor();