/**
 * Position Mapping Service
 * Manages mapping between source and destination positions for exit tracking
 */

import redisManager from './redisManager.js';
import { logger } from '../utils/logger.js';

class PositionMapper {
  constructor() {
    this.mappings = new Map(); // Local cache
  }

  /**
   * Create a position mapping when copying a trade
   */
  async createMapping(sourceAccountId, sourcePositionId, destinationData) {
    const mapping = {
      sourceAccountId,
      sourcePositionId,
      destAccountId: destinationData.accountId,
      destPositionId: destinationData.positionId,
      sourceSymbol: destinationData.sourceSymbol,
      destSymbol: destinationData.destSymbol || destinationData.sourceSymbol,
      sourceVolume: destinationData.sourceVolume,
      destVolume: destinationData.destVolume,
      openTime: destinationData.openTime || new Date().toISOString(),
      sourceOpenPrice: destinationData.sourceOpenPrice,
      destOpenPrice: destinationData.destOpenPrice
    };

    // Store in Redis
    await redisManager.storePositionMapping(sourceAccountId, sourcePositionId, mapping);

    // Update local cache
    const accountKey = `${sourceAccountId}:${sourcePositionId}`;
    this.mappings.set(accountKey, mapping);

    logger.info(`🔗 Created position mapping:`, {
      source: `${sourceAccountId.slice(0, 8)}:${sourcePositionId}`,
      dest: `${mapping.destAccountId.slice(0, 8)}:${mapping.destPositionId}`,
      symbol: mapping.sourceSymbol,
      volume: `${mapping.sourceVolume} → ${mapping.destVolume}`
    });

    return mapping;
  }

  /**
   * Get mapping for a source position
   */
  async getMapping(sourceAccountId, sourcePositionId) {
    // Check local cache first
    const cacheKey = `${sourceAccountId}:${sourcePositionId}`;
    if (this.mappings.has(cacheKey)) {
      return this.mappings.get(cacheKey);
    }

    // Fetch from Redis
    const mapping = await redisManager.getPositionMapping(sourceAccountId, sourcePositionId);

    if (mapping) {
      // Update cache
      this.mappings.set(cacheKey, mapping);
    }

    return mapping;
  }

  /**
   * Get all mappings for a source account
   */
  async getAccountMappings(sourceAccountId) {
    return await redisManager.getAccountMappings(sourceAccountId);
  }

  /**
   * Find mapping by destination position
   * Note: This requires searching through all source accounts' mappings
   */
  async findByDestPosition(destAccountId, destPositionId, sourceAccountIds = []) {
    // If source account IDs provided (from routing config), search those first
    for (const sourceAccountId of sourceAccountIds) {
      const accountMappings = await redisManager.getAccountMappings(sourceAccountId);

      for (const mapping of Object.values(accountMappings)) {
        if (mapping.destAccountId === destAccountId &&
            mapping.destPositionId === destPositionId) {
          return mapping;
        }
      }
    }

    // If not found and no source accounts provided, check local cache
    for (const mapping of this.mappings.values()) {
      if (mapping.destAccountId === destAccountId &&
          mapping.destPositionId === destPositionId) {
        return mapping;
      }
    }

    return null;
  }

  /**
   * Delete a mapping (when position is closed)
   */
  async deleteMapping(sourceAccountId, sourcePositionId) {
    // Remove from Redis
    await redisManager.deletePositionMapping(sourceAccountId, sourcePositionId);

    // Remove from cache
    const cacheKey = `${sourceAccountId}:${sourcePositionId}`;
    this.mappings.delete(cacheKey);

    logger.info(`🗑️ Deleted position mapping: ${sourceAccountId.slice(0, 8)}:${sourcePositionId}`);
  }

  /**
   * Get all cached mappings (for monitoring)
   */
  getAllCachedMappings() {
    return Array.from(this.mappings.values());
  }

  /**
   * Refresh cache from Redis
   */
  async refreshCache(sourceAccountId) {
    const mappings = await redisManager.getAccountMappings(sourceAccountId);

    // Update cache
    for (const [positionId, mapping] of Object.entries(mappings)) {
      const cacheKey = `${sourceAccountId}:${positionId}`;
      this.mappings.set(cacheKey, mapping);
    }

    logger.info(`🔄 Refreshed position mapping cache for ${sourceAccountId.slice(0, 8)}: ${Object.keys(mappings).length} mappings`);
  }

  /**
   * Clean up old mappings (maintenance)
   */
  async cleanupOldMappings(olderThanDays = 7) {
    const cutoffTime = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [key, mapping] of this.mappings.entries()) {
      const mappedTime = new Date(mapping.mappedAt);
      if (mappedTime < cutoffTime) {
        await this.deleteMapping(mapping.sourceAccountId, mapping.sourcePositionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`🧹 Cleaned up ${cleanedCount} old position mappings`);
    }
  }

  /**
   * Get mapping statistics
   */
  getMappingStats() {
    const stats = {
      totalMappings: this.mappings.size,
      byAccount: {},
      bySymbol: {}
    };

    for (const mapping of this.mappings.values()) {
      // Count by account
      stats.byAccount[mapping.sourceAccountId] =
        (stats.byAccount[mapping.sourceAccountId] || 0) + 1;

      // Count by symbol
      stats.bySymbol[mapping.sourceSymbol] =
        (stats.bySymbol[mapping.sourceSymbol] || 0) + 1;
    }

    return stats;
  }

  /**
   * Store close information when a position is closed
   */
  async recordPositionClose(sourceAccountId, sourcePositionId, closeInfo) {
    // Store in Redis for tracking
    await redisManager.storeClosedPosition(sourceAccountId, sourcePositionId, {
      ...closeInfo,
      mapping: await this.getMapping(sourceAccountId, sourcePositionId)
    });
  }

  /**
   * Check if a position was recently closed
   */
  async wasRecentlyClosed(sourceAccountId, sourcePositionId) {
    return await redisManager.wasRecentlyClosed(sourceAccountId, sourcePositionId);
  }

  /**
   * Get active mappings for a specific route (source → destination)
   * Used to check if orphan scanning is needed
   */
  async getActiveMappingsForRoute(sourceAccountId, destAccountId) {
    const accountMappings = await this.getAccountMappings(sourceAccountId);

    // Filter for mappings to this specific destination
    const routeMappings = Object.values(accountMappings).filter(
      mapping => mapping.destAccountId === destAccountId
    );

    return routeMappings;
  }
}

// Export singleton instance
export default new PositionMapper();