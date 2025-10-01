/**
 * Dashboard API Routes
 * Provides comprehensive monitoring and analytics endpoints
 */

import express from 'express';
import { advancedRouter } from '../services/advancedRouter.js';
import { performanceMonitor } from '../services/performanceMonitor.js';
import poolClient from '../services/poolClient.js';
import { logger } from '../utils/logger.js';
import { createClient } from 'redis';
import { vaultManager } from '../services/vaultConfig.js';

const router = express.Router();

// Redis client for cached data
let redisClient = null;

async function getRedisClient() {
  if (!redisClient) {
    const config = await vaultManager.getRedisConfig();
    redisClient = createClient({
      socket: {
        host: config.host,
        port: config.port
      },
      password: config.password,
      database: config.db
    });
    await redisClient.connect();
  }
  return redisClient;
}

/**
 * GET /api/dashboard/overview
 * System overview with all routes and account status
 */
router.get('/overview', async (req, res) => {
  try {
    const stats = advancedRouter.getStats();
    const accounts = {};

    // Get account info for all accounts in config
    if (advancedRouter.config) {
      for (const [accountId, accountConfig] of Object.entries(advancedRouter.config.accounts)) {
        try {
          const info = await poolClient.getAccountInfo(accountId, accountConfig.region);
          accounts[accountId] = {
            ...accountConfig,
            balance: info.balance,
            equity: info.equity,
            margin: info.margin,
            marginLevel: info.marginLevel,
            openPositions: info.openPositions || 0
          };
        } catch (error) {
          accounts[accountId] = {
            ...accountConfig,
            error: 'Unable to fetch account data'
          };
        }
      }
    }

    res.json({
      success: true,
      system: {
        running: stats.isRunning,
        totalRoutes: stats.totalRoutes,
        timestamp: stats.timestamp
      },
      routes: stats.routes.map(route => ({
        id: route.routeId,
        name: route.routeName,
        source: route.source,
        destination: route.destination,
        ruleSet: route.ruleSet,
        enabled: route.enabled,
        uptime: route.startTime ? Date.now() - new Date(route.startTime).getTime() : 0,
        stats: route.stats
      })),
      accounts
    });
  } catch (error) {
    logger.error('Dashboard overview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dashboard/routes/performance
 * Historical performance by route
 */
router.get('/routes/performance', async (req, res) => {
  try {
    const { routeId, period = '24h' } = req.query;
    const redis = await getRedisClient();

    const performanceData = {};
    const routes = routeId ? [routeId] : advancedRouter.routes.keys();

    for (const id of routes) {
      const key = `performance:${id}:${period}`;
      const data = await redis.get(key);

      if (data) {
        performanceData[id] = JSON.parse(data);
      } else {
        // Calculate from current stats if no cached data
        const routeData = advancedRouter.routes.get(id);
        if (routeData) {
          const stats = routeData.trader.getStats();
          performanceData[id] = {
            trades: stats.dailyTrades || 0,
            profit: stats.profit || 0,
            loss: stats.dailyLoss || 0,
            winRate: stats.winRate || 0,
            profitFactor: stats.profitFactor || 0,
            positions: stats.sourcePositions || 0
          };
        }
      }
    }

    res.json({
      success: true,
      period,
      performance: performanceData
    });
  } catch (error) {
    logger.error('Performance endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dashboard/routes/correlation
 * Analyze correlation between routes
 */
router.get('/routes/correlation', async (req, res) => {
  try {
    const correlationMatrix = {};
    const routes = Array.from(advancedRouter.routes.entries());

    // Simple correlation based on simultaneous positions
    for (let i = 0; i < routes.length; i++) {
      const [id1, data1] = routes[i];
      correlationMatrix[id1] = {};

      for (let j = 0; j < routes.length; j++) {
        const [id2, data2] = routes[j];

        if (i === j) {
          correlationMatrix[id1][id2] = 1.0;
        } else {
          // Check if routes trade same symbols at same times
          const sourcePositions1 = data1.trader.sourcePositions;
          const sourcePositions2 = data2.trader.sourcePositions;

          let commonSymbols = 0;
          for (const [posId, pos] of sourcePositions1) {
            for (const [posId2, pos2] of sourcePositions2) {
              if (pos.symbol === pos2.symbol) {
                commonSymbols++;
              }
            }
          }

          const correlation = sourcePositions1.size > 0 && sourcePositions2.size > 0
            ? commonSymbols / Math.max(sourcePositions1.size, sourcePositions2.size)
            : 0;

          correlationMatrix[id1][id2] = Number(correlation.toFixed(3));
        }
      }
    }

    res.json({
      success: true,
      correlation: correlationMatrix,
      warning: correlationMatrix.length > 1 && Object.values(correlationMatrix).some(row =>
        Object.values(row).filter(v => v > 0.7 && v < 1).length > 0
      ) ? 'High correlation detected between some routes' : null
    });
  } catch (error) {
    logger.error('Correlation endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dashboard/routes/health
 * Real-time health checks for all routes
 */
router.get('/routes/health', async (req, res) => {
  try {
    const health = [];

    for (const [routeId, { route, trader }] of advancedRouter.routes) {
      const stats = trader.getStats();
      const config = trader.config;

      const healthStatus = {
        routeId,
        routeName: route.name,
        status: 'healthy',
        warnings: [],
        metrics: {
          dailyLoss: stats.dailyLoss || 0,
          dailyLossLimit: config.dailyLossLimit || 0,
          dailyTrades: stats.dailyTrades || 0,
          maxDailyTrades: config.maxDailyTrades || 0,
          lastTradeTime: stats.lastTradeTime || 0,
          uptime: Date.now() - new Date(trader.startTime || Date.now()).getTime()
        }
      };

      // Check for issues
      if (stats.dailyLoss >= config.dailyLossLimit * 0.8) {
        healthStatus.status = 'warning';
        healthStatus.warnings.push(`Approaching daily loss limit (${(stats.dailyLoss / config.dailyLossLimit * 100).toFixed(1)}%)`);
      }

      if (stats.dailyTrades >= config.maxDailyTrades * 0.9) {
        healthStatus.status = 'warning';
        healthStatus.warnings.push(`Near daily trade limit (${stats.dailyTrades}/${config.maxDailyTrades})`);
      }

      if (stats.lastTradeTime && Date.now() - stats.lastTradeTime > 3600000) {
        healthStatus.warnings.push('No trades in last hour');
      }

      health.push(healthStatus);
    }

    res.json({
      success: true,
      health,
      systemStatus: advancedRouter.isRunning ? 'running' : 'stopped'
    });
  } catch (error) {
    logger.error('Health endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dashboard/accounts/summary
 * Account balances and exposure summary
 */
router.get('/accounts/summary', async (req, res) => {
  try {
    const summary = {
      totalBalance: 0,
      totalEquity: 0,
      totalMargin: 0,
      totalOpenPositions: 0,
      accounts: []
    };

    if (advancedRouter.config) {
      for (const [accountId, accountConfig] of Object.entries(advancedRouter.config.accounts)) {
        try {
          const info = await poolClient.getAccountInfo(accountId, accountConfig.region);
          const positions = await poolClient.getPositions(accountId, accountConfig.region);

          const accountSummary = {
            accountId,
            nickname: accountConfig.nickname,
            type: accountConfig.type,
            balance: info.balance || 0,
            equity: info.equity || 0,
            margin: info.margin || 0,
            marginLevel: info.marginLevel || 0,
            openPositions: positions.length,
            totalExposure: positions.reduce((sum, pos) =>
              sum + (pos.volume * pos.openPrice * 100000), 0
            ),
            unrealizedPL: positions.reduce((sum, pos) =>
              sum + (pos.profit || 0), 0
            )
          };

          summary.accounts.push(accountSummary);
          summary.totalBalance += accountSummary.balance;
          summary.totalEquity += accountSummary.equity;
          summary.totalMargin += accountSummary.margin;
          summary.totalOpenPositions += accountSummary.openPositions;

        } catch (error) {
          logger.warn(`Failed to get info for account ${accountId}:`, error.message);
        }
      }
    }

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    logger.error('Account summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dashboard/alerts
 * Recent alerts and warnings
 */
router.get('/alerts', async (req, res) => {
  try {
    const redis = await getRedisClient();
    const { limit = 50 } = req.query;

    // Get recent alerts from Redis
    const alerts = [];
    const alertKeys = await redis.keys('alert:*');

    for (const key of alertKeys.slice(-limit)) {
      const alert = await redis.get(key);
      if (alert) {
        alerts.push(JSON.parse(alert));
      }
    }

    // Sort by timestamp descending
    alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      alerts: alerts.slice(0, limit),
      count: alerts.length
    });
  } catch (error) {
    logger.error('Alerts endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dashboard/reports/daily
 * Get daily summary report
 */
router.get('/reports/daily', async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    const redis = await getRedisClient();

    const reportKey = `report:daily:${date}`;
    const report = await redis.get(reportKey);

    if (report) {
      res.json({
        success: true,
        report: JSON.parse(report)
      });
    } else {
      // Generate report on demand if not cached
      const generatedReport = await performanceMonitor.generateDailyReport(date);
      res.json({
        success: true,
        report: generatedReport
      });
    }
  } catch (error) {
    logger.error('Daily report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dashboard/reports/weekly
 * Get weekly summary report
 */
router.get('/reports/weekly', async (req, res) => {
  try {
    const { week = new Date().toISOString().split('T')[0] } = req.query;
    const redis = await getRedisClient();

    const reportKey = `report:weekly:${week}`;
    const report = await redis.get(reportKey);

    if (report) {
      res.json({
        success: true,
        report: JSON.parse(report)
      });
    } else {
      // Generate report on demand if not cached
      const generatedReport = await performanceMonitor.generateWeeklyReport(week);
      res.json({
        success: true,
        report: generatedReport
      });
    }
  } catch (error) {
    logger.error('Weekly report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;