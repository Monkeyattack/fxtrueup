/**
 * Orphaned Position Cleaner
 * Identifies and closes destination positions without source positions or mappings
 */

import { logger } from './logger.js';
import positionMapper from '../services/positionMapper.js';
import poolClient from '../services/poolClient.js';
import telegram from './telegram.js';
import redisManager from '../services/redisManager.js';

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
      // OPTIMIZATION: Check if there are any mappings for this route first
      const routeMappings = await positionMapper.getActiveMappingsForRoute(sourceAccountId, destAccountId);

      if (!routeMappings || routeMappings.length === 0) {
        logger.debug(`⏭️  Skipping orphan check for ${sourceAccountId.slice(0, 8)} → ${destAccountId.slice(0, 8)} (no active mappings)`);
        return [];
      }

      logger.info(`🔍 Checking for orphaned positions: ${sourceAccountId.slice(0, 8)} → ${destAccountId.slice(0, 8)} (${routeMappings.length} active mappings)`);

      // Get open positions on both accounts via pool client
      const sourcePositions = await poolClient.getPositions(sourceAccountId);
      const destPositions = await poolClient.getPositions(destAccountId);

      logger.info(`   Source: ${sourcePositions.length} open positions`);
      logger.info(`   Dest: ${destPositions.length} open positions`);

      const orphanedPositions = [];

      // Check each destination position
      for (const destPos of destPositions) {
        // FIRST check if a valid mapping exists for this destination position
        const mapping = await positionMapper.findByDestPosition(destAccountId, destPos.id, [sourceAccountId]);

        if (mapping && mapping.sourcePositionId) {
          // Mapping exists - check if source position still exists
          const sourcePos = sourcePositions.find(p => p.id === mapping.sourcePositionId);

          if (!sourcePos) {
            // Mapping exists but source position is closed - this is an orphan
            orphanedPositions.push({
              position: destPos,
              reason: 'source_closed',
              destAccountId,
              sourceAccountId,
              mapping
            });

            logger.info(`   ⚠️ Orphan: ${destPos.symbol} (${destPos.id}), opened ${destPos.time}, reason: source_closed (mapped to ${mapping.sourcePositionId})`);
          }
          // else: source still exists, position is valid, not an orphan
        } else {
          // No valid mapping found - this is an orphan (shouldn't happen with proper copy trading)
          orphanedPositions.push({
            position: destPos,
            reason: 'no_mapping',
            destAccountId,
            sourceAccountId,
            mapping: null
          });

          logger.info(`   ⚠️ Orphan: ${destPos.symbol} (${destPos.id}), opened ${destPos.time}, reason: no_mapping`);
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
   * Close an orphaned position (internal method, now also used by bot commands)
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
   * Send Telegram notification for orphaned position
   */
  async sendOrphanReport(orphan, routeInfo = {}) {
    try {
      const { position, reason, destAccountId, sourceAccountId } = orphan;
      const openTime = new Date(position.time);
      const duration = this._formatDuration(Date.now() - openTime.getTime());

      const reasonText = reason === 'source_closed'
        ? 'Source position closed'
        : 'No matching source position';

      const message = `<b>⚠️ ORPHANED POSITION DETECTED</b>

<b>Route:</b> ${routeInfo.routeName || 'Unknown'}
<b>Source:</b> ${sourceAccountId?.substring(0, 8)}...
<b>Destination:</b> ${destAccountId.substring(0, 8)}...
<b>Reason:</b> ${reasonText}

<b>Symbol:</b> ${position.symbol}
<b>Position ID:</b> ${position.id}
<b>Volume:</b> ${position.volume} lots
<b>Current Profit:</b> $${position.profit?.toFixed(2) || '0.00'}
<b>Open Time:</b> ${openTime.toISOString()} (${duration} ago)

${position.stopLoss ? `<b>Stop Loss:</b> ${position.stopLoss}` : '<b>Stop Loss:</b> None'}
${position.takeProfit ? `<b>Take Profit:</b> ${position.takeProfit}` : '<b>Take Profit:</b> None'}

<b>Manual Actions:</b>
/closeOrphan ${position.id}
/setOrphanSL ${position.id} [price]
/setOrphanTP ${position.id} [price]`;

      await telegram.sendMessage(message);
    } catch (error) {
      logger.error(`Failed to send orphan report:`, error);
    }
  }

  /**
   * Format duration in human-readable format
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  /**
   * Manual close orphan command (for bot)
   */
  async closeOrphan(positionId, destAccountId) {
    try {
      logger.info(`📱 Manual close orphan: ${positionId} on ${destAccountId.slice(0, 8)}`);

      // Get position details
      const positions = await poolClient.getPositions(destAccountId);
      const position = positions.find(p => p.id === positionId);

      if (!position) {
        throw new Error(`Position ${positionId} not found on account ${destAccountId.slice(0, 8)}`);
      }

      // Check if mapping exists (no source account hint, will search cache)
      const mapping = await positionMapper.findByDestPosition(destAccountId, positionId);

      // Close the position
      const orphan = {
        position,
        destAccountId,
        reason: 'manual_close',
        mapping
      };

      const result = await this.closeOrphanedPosition(orphan);
      return result;
    } catch (error) {
      logger.error(`Failed to manually close orphan:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set stop loss on orphan position (for bot)
   */
  async setOrphanStopLoss(positionId, destAccountId, stopLoss) {
    try {
      logger.info(`📱 Set orphan SL: ${positionId} on ${destAccountId.slice(0, 8)} to ${stopLoss}`);

      // Verify position exists
      const positions = await poolClient.getPositions(destAccountId);
      const position = positions.find(p => p.id === positionId);

      if (!position) {
        throw new Error(`Position ${positionId} not found on account ${destAccountId.slice(0, 8)}`);
      }

      // Modify position via pool client
      const result = await poolClient.modifyPosition(destAccountId, positionId, stopLoss, position.takeProfit);

      logger.info(`✅ Set SL ${stopLoss} on position ${positionId}`);
      return { success: true, result };
    } catch (error) {
      logger.error(`Failed to set orphan SL:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set take profit on orphan position (for bot)
   */
  async setOrphanTakeProfit(positionId, destAccountId, takeProfit) {
    try {
      logger.info(`📱 Set orphan TP: ${positionId} on ${destAccountId.slice(0, 8)} to ${takeProfit}`);

      // Verify position exists
      const positions = await poolClient.getPositions(destAccountId);
      const position = positions.find(p => p.id === positionId);

      if (!position) {
        throw new Error(`Position ${positionId} not found on account ${destAccountId.slice(0, 8)}`);
      }

      // Modify position via pool client
      const result = await poolClient.modifyPosition(destAccountId, positionId, position.stopLoss, takeProfit);

      logger.info(`✅ Set TP ${takeProfit} on position ${positionId}`);
      return { success: true, result };
    } catch (error) {
      logger.error(`Failed to set orphan TP:`, error);
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

    // Send Telegram notifications for each orphan (with deduplication)
    let notifiedCount = 0;
    let skippedCount = 0;

    for (const orphan of orphans) {
      // Check if we already notified about this orphan in the last 24h
      const alreadyNotified = await redisManager.wasOrphanNotified(
        orphan.destAccountId,
        orphan.position.id
      );

      if (alreadyNotified) {
        skippedCount++;
        logger.info(`   ℹ️ Skipping notification for ${orphan.position.id} (already notified within 24h)`);
        continue;
      }

      // Send notification and mark as notified
      await this.sendOrphanReport(orphan, { routeName: orphan.routeName });
      await redisManager.markOrphanNotified(orphan.destAccountId, orphan.position.id);
      notifiedCount++;
    }

    logger.info(`📬 Sent ${notifiedCount} new orphan alerts, skipped ${skippedCount} duplicates`);

    if (!autoClose) {
      logger.info('ℹ️ Auto-close disabled. Notifications sent. Use bot commands to manage positions.');
      return { cleaned: 0, failed: 0, orphans: report };
    }

    // Close orphans (only if autoClose is explicitly enabled)
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
   * Start automatic orphan detection and reporting (report-only mode)
   */
  startAutoCleanup(routingConfig, intervalMinutes = 30) {
    if (this.cleanupInterval) {
      logger.warn('Auto cleanup already running');
      return;
    }

    logger.info(`🔄 Starting automatic orphan detection (report-only, every ${intervalMinutes} minutes)`);

    this.cleanupInterval = setInterval(async () => {
      // Changed to false - report only, no auto-close
      await this.cleanupAllOrphans(routingConfig, false);
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
