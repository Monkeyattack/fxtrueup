/**
 * Orphaned Position Cleaner
 * Identifies and closes destination positions without source positions or mappings
 */

import { logger } from './logger.js';
import positionMapper from '../services/positionMapper.js';
import poolClient from '../services/poolClient.js';

class OrphanedPositionCleaner {
  constructor() {
    this.cleanupInterval = null;
  }

  /**
   * Find orphaned positions for a destination account
   * Uses open time matching to identify positions without corresponding source
   */
  async findOrphanedPositions(sourceAccountId, destAccountId) {
    try {
      logger.info(`🔍 Checking for orphaned positions: ${sourceAccountId.slice(0, 8)} → ${destAccountId.slice(0, 8)}`);

      // Get open positions on both accounts via pool client
      const sourcePositions = await poolClient.getPositions(sourceAccountId);
      const destPositions = await poolClient.getPositions(destAccountId);

      logger.info(`   Source: ${sourcePositions.length} open positions`);
      logger.info(`   Dest: ${destPositions.length} open positions`);

      const orphanedPositions = [];

      // Check each destination position
      for (const destPos of destPositions) {
        // Try to find matching source position by symbol and open time
        const sourcePos = sourcePositions.find(p =>
          p.symbol === destPos.symbol &&
          p.time === destPos.time
        );

        if (!sourcePos) {
          // No matching source position - this is an orphan
          // Check if mapping exists for context
          const mapping = await positionMapper.findByDestPosition(destAccountId, destPos.id);

          let reason = 'no_matching_source';
          if (mapping) {
            // Mapping exists but source position closed
            reason = 'source_closed';
          }

          orphanedPositions.push({
            position: destPos,
            reason,
            destAccountId,
            sourceAccountId,
            mapping
          });

          logger.info(`   ⚠️ Orphan: ${destPos.symbol} (${destPos.id}), opened ${destPos.time}, reason: ${reason}`);
        }
      }

      if (orphanedPositions.length > 0) {
        logger.warn(`⚠️ Found ${orphanedPositions.length} orphaned positions on ${destAccountId.slice(0, 8)}`);
      } else {
        logger.info(`✅ No orphaned positions found on ${destAccountId.slice(0, 8)}`);
      }

      return orphanedPositions;
    } catch (error) {
      logger.error(`❌ Error finding orphaned positions:`, error);
      return [];
    }
  }

  /**
   * Close an orphaned position
   */
  async closeOrphanedPosition(orphan) {
    try {
      const { position, destAccountId, reason } = orphan;

      logger.info(`🔴 Closing orphaned position ${position.id} on ${destAccountId.slice(0, 8)} (${reason})`);
      logger.info(`   Symbol: ${position.symbol}, Volume: ${position.volume}, P&L: ${position.profit || 0}`);

      // Close the position via pool client
      const result = await poolClient.closePosition(destAccountId, position.id);

      logger.info(`✅ Closed orphaned position ${position.id}`);

      // Delete mapping if it exists
      if (orphan.mapping) {
        await positionMapper.deleteMapping(
          orphan.mapping.sourceAccountId,
          orphan.mapping.sourcePositionId
        );
      }

      return { success: true, result };
    } catch (error) {
      logger.error(`❌ Failed to close orphaned position ${orphan.position.id}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Scan all routes for orphaned positions
   */
  async scanAllRoutes(routingConfig) {
    const allOrphans = [];

    for (const route of routingConfig.routes) {
      if (!route.enabled) continue;

      try {
        const orphans = await this.findOrphanedPositions(route.source, route.destination);
        allOrphans.push(...orphans.map(o => ({ ...o, routeId: route.id, routeName: route.name })));
      } catch (error) {
        logger.error(`Error scanning route ${route.id}:`, error);
      }
    }

    return allOrphans;
  }

  /**
   * Clean up all orphaned positions for all routes
   */
  async cleanupAllOrphans(routingConfig, autoClose = false) {
    logger.info('🧹 Starting orphaned position cleanup scan...');

    const orphans = await this.scanAllRoutes(routingConfig);

    if (orphans.length === 0) {
      logger.info('✅ No orphaned positions found across all routes');
      return { cleaned: 0, failed: 0, orphans: [] };
    }

    logger.warn(`⚠️ Found ${orphans.length} orphaned positions across all routes`);

    // Generate report
    const report = orphans.map(o => ({
      route: o.routeName,
      positionId: o.position.id,
      symbol: o.position.symbol,
      volume: o.position.volume,
      profit: o.position.profit || 0,
      reason: o.reason,
      openTime: o.position.time
    }));

    logger.info('📊 Orphaned Position Report:', JSON.stringify(report, null, 2));

    if (!autoClose) {
      logger.info('ℹ️ Auto-close disabled. Set autoClose=true to close these positions.');
      return { cleaned: 0, failed: 0, orphans: report };
    }

    // Close orphans
    let cleaned = 0;
    let failed = 0;

    for (const orphan of orphans) {
      const result = await this.closeOrphanedPosition(orphan);
      if (result.success) {
        cleaned++;
      } else {
        failed++;
      }
    }

    logger.info(`🎯 Cleanup complete: ${cleaned} closed, ${failed} failed`);

    return { cleaned, failed, orphans: report };
  }

  /**
   * Start automatic orphan cleanup (runs periodically)
   */
  startAutoCleanup(routingConfig, intervalMinutes = 30) {
    if (this.cleanupInterval) {
      logger.warn('Auto cleanup already running');
      return;
    }

    logger.info(`🔄 Starting automatic orphan cleanup (every ${intervalMinutes} minutes)`);

    this.cleanupInterval = setInterval(async () => {
      await this.cleanupAllOrphans(routingConfig, true);
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('🛑 Stopped automatic orphan cleanup');
    }
  }
}

export default new OrphanedPositionCleaner();
