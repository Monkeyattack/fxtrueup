/**
 * Orphan Position Management API Routes
 */

import express from 'express';
import orphanedPositionCleaner from '../utils/orphanedPositionCleaner.js';
import poolClient from '../services/poolClient.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

/**
 * Load routing configuration
 */
async function loadRoutingConfig() {
  const configPath = path.join(__dirname, '../config/routing-config.json');
  const configData = await fs.readFile(configPath, 'utf8');
  return JSON.parse(configData);
}

/**
 * Find which route/account contains a specific position ID
 */
async function findPositionAccount(positionId) {
  const config = await loadRoutingConfig();

  for (const route of config.routes) {
    if (!route.enabled) continue;

    try {
      const positions = await poolClient.getPositions(route.destination);
      const position = positions.find(p => p.id === positionId);

      if (position) {
        return {
          destAccountId: route.destination,
          route,
          position
        };
      }
    } catch (error) {
      // Continue checking other routes
    }
  }

  return null;
}

/**
 * POST /api/orphans/close
 * Close an orphaned position
 */
router.post('/close', async (req, res) => {
  try {
    const { positionId } = req.body;

    if (!positionId) {
      return res.status(400).json({ error: 'Position ID required' });
    }

    // Find which account has this position
    const accountInfo = await findPositionAccount(positionId);

    if (!accountInfo) {
      return res.status(404).json({
        error: `Position ${positionId} not found in any destination account`
      });
    }

    const { destAccountId, route, position } = accountInfo;

    // Close the orphan
    const result = await orphanedPositionCleaner.closeOrphan(positionId, destAccountId);

    if (result.success) {
      return res.json({
        success: true,
        message: 'Orphan closed successfully',
        data: {
          positionId,
          route: route.name,
          symbol: position.symbol,
          volume: position.volume,
          profit: position.profit
        }
      });
    } else {
      return res.status(500).json({
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error closing orphan:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/orphans/set-stop-loss
 * Set stop loss on orphaned position
 */
router.post('/set-stop-loss', async (req, res) => {
  try {
    const { positionId, stopLoss } = req.body;

    if (!positionId || stopLoss === undefined) {
      return res.status(400).json({
        error: 'Position ID and stop loss price required'
      });
    }

    const stopLossPrice = parseFloat(stopLoss);
    if (isNaN(stopLossPrice)) {
      return res.status(400).json({
        error: 'Invalid stop loss price. Must be numeric.'
      });
    }

    // Find which account has this position
    const accountInfo = await findPositionAccount(positionId);

    if (!accountInfo) {
      return res.status(404).json({
        error: `Position ${positionId} not found in any destination account`
      });
    }

    const { destAccountId, route, position } = accountInfo;

    // Set stop loss
    const result = await orphanedPositionCleaner.setOrphanStopLoss(
      positionId,
      destAccountId,
      stopLossPrice
    );

    if (result.success) {
      return res.json({
        success: true,
        message: 'Stop loss set successfully',
        data: {
          positionId,
          route: route.name,
          symbol: position.symbol,
          stopLoss: stopLossPrice
        }
      });
    } else {
      return res.status(500).json({
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error setting orphan stop loss:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/orphans/set-take-profit
 * Set take profit on orphaned position
 */
router.post('/set-take-profit', async (req, res) => {
  try {
    const { positionId, takeProfit } = req.body;

    if (!positionId || takeProfit === undefined) {
      return res.status(400).json({
        error: 'Position ID and take profit price required'
      });
    }

    const takeProfitPrice = parseFloat(takeProfit);
    if (isNaN(takeProfitPrice)) {
      return res.status(400).json({
        error: 'Invalid take profit price. Must be numeric.'
      });
    }

    // Find which account has this position
    const accountInfo = await findPositionAccount(positionId);

    if (!accountInfo) {
      return res.status(404).json({
        error: `Position ${positionId} not found in any destination account`
      });
    }

    const { destAccountId, route, position } = accountInfo;

    // Set take profit
    const result = await orphanedPositionCleaner.setOrphanTakeProfit(
      positionId,
      destAccountId,
      takeProfitPrice
    );

    if (result.success) {
      return res.json({
        success: true,
        message: 'Take profit set successfully',
        data: {
          positionId,
          route: route.name,
          symbol: position.symbol,
          takeProfit: takeProfitPrice
        }
      });
    } else {
      return res.status(500).json({
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error setting orphan take profit:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/orphans/list
 * List all orphaned positions across all routes
 */
router.get('/list', async (req, res) => {
  try {
    const config = await loadRoutingConfig();
    const orphans = await orphanedPositionCleaner.scanAllRoutes(config);

    return res.json({
      success: true,
      count: orphans.length,
      orphans: orphans.map(o => ({
        routeId: o.routeId,
        routeName: o.routeName,
        positionId: o.position.id,
        symbol: o.position.symbol,
        volume: o.position.volume,
        profit: o.position.profit || 0,
        stopLoss: o.position.stopLoss,
        takeProfit: o.position.takeProfit,
        reason: o.reason,
        openTime: o.position.time
      }))
    });
  } catch (error) {
    console.error('Error listing orphans:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
