/**
 * Redis Connection Manager for FXTrueUp
 * Manages Redis connections with Vault configuration
 */

import Redis from 'ioredis';
import { vaultManager } from './vaultConfig.js';
import { logger } from '../utils/logger.js';

class RedisManager {
  constructor() {
    this.client = null;
    this.vaultManager = vaultManager;
    this.connected = false;
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    if (this.connected && this.client) {
      return this.client;
    }

    try {
      // Get Redis config from Vault
      const config = await this.vaultManager.getRedisConfig();

      logger.info(`🔗 Connecting to Redis at ${config.host}:${config.port}`);

      this.client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logger.warn(`Redis connection retry #${times} after ${delay}ms`);
          return delay;
        },
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            // Only reconnect when the error contains "READONLY"
            return true;
          }
          return false;
        }
      });

      // Handle connection events
      this.client.on('connect', () => {
        logger.info('✅ Redis connected successfully');
        this.connected = true;
      });

      this.client.on('error', (err) => {
        logger.error('Redis error:', err);
        this.connected = false;
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
        this.connected = false;
      });

      // Test connection
      await this.client.ping();

      return this.client;
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Get Redis client (ensure connected)
   */
  async getClient() {
    if (!this.connected || !this.client) {
      await this.connect();
    }
    return this.client;
  }

  /**
   * Store position mapping
   */
  async storePositionMapping(sourceAccountId, sourcePositionId, mapping) {
    const client = await this.getClient();
    const key = `position:map:${sourceAccountId}:${sourcePositionId}`;

    // Add timestamp
    mapping.mappedAt = new Date().toISOString();

    // Store with 7-day TTL
    await client.setex(key, 7 * 24 * 60 * 60, JSON.stringify(mapping));

    logger.info(`📍 Stored position mapping: ${key}`);
    return true;
  }

  /**
   * Get position mapping
   */
  async getPositionMapping(sourceAccountId, sourcePositionId) {
    const client = await this.getClient();
    const key = `position:map:${sourceAccountId}:${sourcePositionId}`;

    const data = await client.get(key);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  }

  /**
   * Delete position mapping
   */
  async deletePositionMapping(sourceAccountId, sourcePositionId) {
    const client = await this.getClient();
    const key = `position:map:${sourceAccountId}:${sourcePositionId}`;

    await client.del(key);
    logger.info(`🗑️ Deleted position mapping: ${key}`);
  }

  /**
   * Get all mappings for an account
   */
  async getAccountMappings(sourceAccountId) {
    const client = await this.getClient();
    const pattern = `position:map:${sourceAccountId}:*`;

    const keys = await client.keys(pattern);
    const mappings = {};

    for (const key of keys) {
      const data = await client.get(key);
      if (data) {
        const positionId = key.split(':').pop();
        mappings[positionId] = JSON.parse(data);
      }
    }

    return mappings;
  }

  /**
   * Store closed position info for tracking
   */
  async storeClosedPosition(accountId, positionId, closeInfo) {
    const client = await this.getClient();
    const key = `position:closed:${accountId}:${positionId}`;

    // Store with 24-hour TTL
    await client.setex(key, 24 * 60 * 60, JSON.stringify({
      ...closeInfo,
      closedAt: new Date().toISOString()
    }));
  }

  /**
   * Check if position was recently closed
   */
  async wasRecentlyClosed(accountId, positionId) {
    const client = await this.getClient();
    const key = `position:closed:${accountId}:${positionId}`;

    const exists = await client.exists(key);
    return exists === 1;
  }

  /**
   * Store orphan notification timestamp (24h TTL)
   */
  async markOrphanNotified(accountId, positionId) {
    const client = await this.getClient();
    const key = `orphan:notified:${accountId}:${positionId}`;

    // Store with 24-hour TTL
    await client.setex(key, 24 * 60 * 60, new Date().toISOString());
  }

  /**
   * Check if orphan was recently notified
   */
  async wasOrphanNotified(accountId, positionId) {
    const client = await this.getClient();
    const key = `orphan:notified:${accountId}:${positionId}`;

    const exists = await client.exists(key);
    return exists === 1;
  }

  /**
   * Queue a pending exit (for exits that failed due to connection issues)
   */
  async queuePendingExit(sourceAccountId, sourcePositionId, mapping) {
    const client = await this.getClient();
    const key = `exit:pending:${sourceAccountId}:${sourcePositionId}`;

    const exitData = {
      ...mapping,
      queuedAt: new Date().toISOString(),
      retryCount: 0
    };

    // Store with 48-hour TTL (gives plenty of retry time)
    await client.setex(key, 48 * 60 * 60, JSON.stringify(exitData));

    logger.info(`📥 Queued pending exit: ${key}`);
    return true;
  }

  /**
   * Get all pending exits for retry
   */
  async getPendingExits() {
    const client = await this.getClient();
    const pattern = 'exit:pending:*';

    const keys = await client.keys(pattern);
    const pendingExits = [];

    for (const key of keys) {
      const data = await client.get(key);
      if (data) {
        const exitData = JSON.parse(data);

        // Increment retry count
        exitData.retryCount = (exitData.retryCount || 0) + 1;
        await client.setex(key, 48 * 60 * 60, JSON.stringify(exitData));

        pendingExits.push({
          key,
          mapping: exitData,
          queuedAt: exitData.queuedAt,
          retryCount: exitData.retryCount
        });
      }
    }

    return pendingExits;
  }

  /**
   * Remove exit from pending queue (after successful close)
   */
  async removePendingExit(sourceAccountId, sourcePositionId) {
    const client = await this.getClient();
    const key = `exit:pending:${sourceAccountId}:${sourcePositionId}`;

    await client.del(key);
    logger.info(`✅ Removed pending exit from queue: ${key}`);
  }

  /**
   * Check if exit is already queued (prevent duplicates)
   */
  async isPendingExit(sourceAccountId, sourcePositionId) {
    const client = await this.getClient();
    const key = `exit:pending:${sourceAccountId}:${sourcePositionId}`;

    const exists = await client.exists(key);
    return exists === 1;
  }

  /**
   * Close connection
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
      logger.info('Redis disconnected');
    }
  }
}

// Export singleton instance
export default new RedisManager();