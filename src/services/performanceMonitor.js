/**
 * Performance Monitor Service
 * Tracks and analyzes trading performance metrics
 */

import { logger } from '../utils/logger.js';
import { createClient } from 'redis';
import { vaultManager } from './vaultConfig.js';
import poolClient from './poolClient.js';
import telegram from '../utils/telegram.js';
import { advancedRouter } from './advancedRouter.js';

class PerformanceMonitor {
  constructor() {
    this.redisClient = null;
    this.metricsInterval = null;
    this.alertCheckInterval = null;
    this.alertSettings = null;
  }

  /**
   * Initialize Redis connection
   */
  async initRedis() {
    if (!this.redisClient) {
      // Use environment variables directly (Vault has stale password)
      const config = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || '9W_n8pNROA_ZXOZt6KoKqL8V7FAvuAySw-kCmHSKBrA',
        db: parseInt(process.env.REDIS_DB || '0')
      };
      this.redisClient = createClient({
        socket: {
          host: config.host,
          port: config.port
        },
        password: config.password,
        database: config.db
      });
      await this.redisClient.connect();
    }
    return this.redisClient;
  }

  /**
   * Start monitoring
   */
  async start() {
    logger.info('🚀 Starting Performance Monitor...');

    await this.initRedis();

    // Load alert settings from config
    if (advancedRouter.config) {
      this.alertSettings = advancedRouter.config.alertSettings || {};
    }

    // Collect metrics every minute
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 60000);

    // Check alerts every 30 seconds
    this.alertCheckInterval = setInterval(() => {
      this.checkAlerts();
    }, 30000);

    // Schedule daily and weekly reports
    this.scheduleSummaries();

    logger.info('✅ Performance Monitor started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.metricsInterval) clearInterval(this.metricsInterval);
    if (this.alertCheckInterval) clearInterval(this.alertCheckInterval);
    logger.info('✅ Performance Monitor stopped');
  }

  /**
   * Collect metrics from all routes
   */
  async collectMetrics() {
    try {
      const timestamp = new Date();
      const redis = await this.initRedis();

      for (const [routeId, { trader, route }] of advancedRouter.routes) {
        const stats = trader.getStats();

        // Store hourly metrics
        const hourKey = `metrics:${routeId}:hour:${timestamp.toISOString().slice(0, 13)}`;
        await redis.hSet(hourKey, {
          trades: stats.dailyTrades || 0,
          profit: stats.profit || 0,
          loss: stats.dailyLoss || 0,
          positions: stats.sourcePositions || 0,
          winRate: stats.winRate || 0,
          profitFactor: stats.profitFactor || 0,
          timestamp: timestamp.toISOString()
        });
        await redis.expire(hourKey, 604800); // 7 days

        // Store daily aggregate
        const dayKey = `metrics:${routeId}:day:${timestamp.toISOString().slice(0, 10)}`;
        const existing = await redis.hGetAll(dayKey);

        await redis.hSet(dayKey, {
          trades: (parseInt(existing.trades || 0) + (stats.dailyTrades || 0)).toString(),
          profit: (parseFloat(existing.profit || 0) + (stats.profit || 0)).toString(),
          loss: (parseFloat(existing.loss || 0) + (stats.dailyLoss || 0)).toString(),
          maxPositions: Math.max(parseInt(existing.maxPositions || 0), stats.sourcePositions || 0).toString(),
          lastUpdate: timestamp.toISOString()
        });
        await redis.expire(dayKey, 2592000); // 30 days

        // Store performance cache for dashboard
        const periods = ['1h', '24h', '7d', '30d'];
        for (const period of periods) {
          const perfKey = `performance:${routeId}:${period}`;
          await redis.set(perfKey, JSON.stringify({
            trades: stats.dailyTrades || 0,
            profit: stats.profit || 0,
            loss: stats.dailyLoss || 0,
            winRate: stats.winRate || 0,
            profitFactor: stats.profitFactor || 0,
            positions: stats.sourcePositions || 0,
            timestamp: timestamp.toISOString()
          }));
          await redis.expire(perfKey, 300); // 5 minute cache
        }
      }
    } catch (error) {
      logger.error('Error collecting metrics:', error);
    }
  }

  /**
   * Check for alert conditions
   */
  async checkAlerts() {
    try {
      const redis = await this.initRedis();
      const settings = this.alertSettings;

      if (!settings || !settings.propFirmWarningThreshold) return;

      for (const [routeId, { trader, route }] of advancedRouter.routes) {
        const stats = trader.getStats();
        const config = trader.config;

        // Check prop firm daily loss warning
        if (config.dailyLossLimit > 0) {
          const lossPercentage = (stats.dailyLoss || 0) / config.dailyLossLimit;

          if (lossPercentage >= settings.propFirmWarningThreshold) {
            await this.createAlert('PROP_FIRM_WARNING', {
              routeId,
              routeName: route.name,
              level: 'warning',
              message: `Approaching daily loss limit: ${(lossPercentage * 100).toFixed(1)}% used`,
              dailyLoss: stats.dailyLoss,
              dailyLossLimit: config.dailyLossLimit
            });
          }
        }

        // Check consecutive losses
        if (settings.consecutiveLossAlert > 0) {
          const recentTrades = await this.getRecentTrades(routeId, settings.consecutiveLossAlert);
          const consecutiveLosses = this.countConsecutiveLosses(recentTrades);

          if (consecutiveLosses >= settings.consecutiveLossAlert) {
            await this.createAlert('CONSECUTIVE_LOSSES', {
              routeId,
              routeName: route.name,
              level: 'error',
              message: `${consecutiveLosses} consecutive losing trades detected`,
              trades: recentTrades
            });
          }
        }

        // Check slippage
        if (settings.slippageThresholdPips > 0) {
          const slippageData = await this.getSlippageData(routeId);

          for (const slippage of slippageData) {
            if (Math.abs(slippage.pips) > settings.slippageThresholdPips) {
              await this.createAlert('HIGH_SLIPPAGE', {
                routeId,
                routeName: route.name,
                level: 'warning',
                message: `High slippage detected: ${slippage.pips} pips`,
                expectedPrice: slippage.expectedPrice,
                actualPrice: slippage.actualPrice,
                symbol: slippage.symbol
              });
            }
          }
        }

        // Check connection status
        if (!trader.isConnected || Date.now() - trader.lastHeartbeat > 300000) {
          await this.createAlert('CONNECTION_LOST', {
            routeId,
            routeName: route.name,
            level: 'critical',
            message: 'Connection lost to trading account',
            lastHeartbeat: trader.lastHeartbeat
          });
        }
      }
    } catch (error) {
      logger.error('Error checking alerts:', error);
    }
  }

  /**
   * Create and store alert
   */
  async createAlert(type, data) {
    try {
      const redis = await this.initRedis();
      const alert = {
        id: `${type}_${data.routeId}_${Date.now()}`,
        type,
        timestamp: new Date().toISOString(),
        ...data
      };

      // Store alert
      const key = `alert:${alert.id}`;
      await redis.set(key, JSON.stringify(alert));
      await redis.expire(key, 86400); // 24 hours

      // Send notification
      if (data.level === 'critical' || data.level === 'error') {
        await telegram.sendMessage(
          `<b>🚨 ${type.replace(/_/g, ' ')}</b>\n\n` +
          `<b>Route:</b> ${data.routeName}\n` +
          `<b>Message:</b> ${data.message}\n` +
          `<b>Time:</b> ${alert.timestamp}`
        );
      }

      logger.warn(`Alert created: ${type} for route ${data.routeName}`);
    } catch (error) {
      logger.error('Error creating alert:', error);
    }
  }

  /**
   * Get recent trades for analysis
   */
  async getRecentTrades(routeId, count) {
    // This would typically query trade history
    // For now, return empty array
    return [];
  }

  /**
   * Count consecutive losses
   */
  countConsecutiveLosses(trades) {
    let count = 0;
    for (const trade of trades) {
      if (trade.profit < 0) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Get slippage data
   */
  async getSlippageData(routeId) {
    // This would compare expected vs actual execution prices
    // For now, return empty array
    return [];
  }

  /**
   * Generate daily report
   */
  async generateDailyReport(date = new Date().toISOString().split('T')[0]) {
    try {
      const redis = await this.initRedis();
      const report = {
        date,
        timestamp: new Date().toISOString(),
        summary: {
          totalTrades: 0,
          totalProfit: 0,
          totalLoss: 0,
          netPL: 0,
          winRate: 0,
          bestRoute: null,
          worstRoute: null
        },
        routes: [],
        alerts: []
      };

      // Aggregate data for each route
      for (const [routeId, { route }] of advancedRouter.routes) {
        const dayKey = `metrics:${routeId}:day:${date}`;
        const metrics = await redis.hGetAll(dayKey);

        if (metrics && metrics.trades) {
          const routeData = {
            routeId,
            routeName: route.name,
            trades: parseInt(metrics.trades || 0),
            profit: parseFloat(metrics.profit || 0),
            loss: parseFloat(metrics.loss || 0),
            netPL: parseFloat(metrics.profit || 0) - parseFloat(metrics.loss || 0),
            maxPositions: parseInt(metrics.maxPositions || 0)
          };

          report.routes.push(routeData);
          report.summary.totalTrades += routeData.trades;
          report.summary.totalProfit += routeData.profit;
          report.summary.totalLoss += routeData.loss;

          // Track best/worst
          if (!report.summary.bestRoute || routeData.netPL > report.routes[report.summary.bestRoute].netPL) {
            report.summary.bestRoute = report.routes.length - 1;
          }
          if (!report.summary.worstRoute || routeData.netPL < report.routes[report.summary.worstRoute].netPL) {
            report.summary.worstRoute = report.routes.length - 1;
          }
        }
      }

      // Calculate summary
      report.summary.netPL = report.summary.totalProfit - report.summary.totalLoss;
      if (report.summary.totalTrades > 0) {
        const wins = report.routes.filter(r => r.netPL > 0).length;
        report.summary.winRate = (wins / report.routes.length) * 100;
      }

      // Get alerts for the day
      const alertKeys = await redis.keys(`alert:*${date}*`);
      for (const key of alertKeys) {
        const alert = await redis.get(key);
        if (alert) {
          report.alerts.push(JSON.parse(alert));
        }
      }

      // Cache report
      await redis.set(`report:daily:${date}`, JSON.stringify(report));
      await redis.expire(`report:daily:${date}`, 2592000); // 30 days

      return report;
    } catch (error) {
      logger.error('Error generating daily report:', error);
      throw error;
    }
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport(weekStart = this.getWeekStart()) {
    try {
      const redis = await this.initRedis();
      const report = {
        weekStart,
        weekEnd: this.addDays(weekStart, 6),
        timestamp: new Date().toISOString(),
        summary: {
          totalTrades: 0,
          totalProfit: 0,
          totalLoss: 0,
          netPL: 0,
          averageDailyTrades: 0,
          bestDay: null,
          worstDay: null
        },
        dailyBreakdown: [],
        routes: []
      };

      // Aggregate daily reports
      for (let i = 0; i < 7; i++) {
        const date = this.addDays(weekStart, i);
        const dailyReport = await this.generateDailyReport(date);

        report.dailyBreakdown.push({
          date,
          trades: dailyReport.summary.totalTrades,
          netPL: dailyReport.summary.netPL
        });

        report.summary.totalTrades += dailyReport.summary.totalTrades;
        report.summary.totalProfit += dailyReport.summary.totalProfit;
        report.summary.totalLoss += dailyReport.summary.totalLoss;

        // Track best/worst days
        if (!report.summary.bestDay || dailyReport.summary.netPL > report.dailyBreakdown[report.summary.bestDay].netPL) {
          report.summary.bestDay = i;
        }
        if (!report.summary.worstDay || dailyReport.summary.netPL < report.dailyBreakdown[report.summary.worstDay].netPL) {
          report.summary.worstDay = i;
        }
      }

      // Calculate summary
      report.summary.netPL = report.summary.totalProfit - report.summary.totalLoss;
      report.summary.averageDailyTrades = report.summary.totalTrades / 7;

      // Aggregate route performance for the week
      const routeStats = new Map();

      for (const [routeId, { route }] of advancedRouter.routes) {
        let weekTotal = {
          routeId,
          routeName: route.name,
          trades: 0,
          profit: 0,
          loss: 0,
          netPL: 0
        };

        for (let i = 0; i < 7; i++) {
          const date = this.addDays(weekStart, i);
          const dayKey = `metrics:${routeId}:day:${date}`;
          const metrics = await redis.hGetAll(dayKey);

          if (metrics && metrics.trades) {
            weekTotal.trades += parseInt(metrics.trades || 0);
            weekTotal.profit += parseFloat(metrics.profit || 0);
            weekTotal.loss += parseFloat(metrics.loss || 0);
          }
        }

        weekTotal.netPL = weekTotal.profit - weekTotal.loss;
        report.routes.push(weekTotal);
      }

      // Sort routes by performance
      report.routes.sort((a, b) => b.netPL - a.netPL);

      // Cache report
      await redis.set(`report:weekly:${weekStart}`, JSON.stringify(report));
      await redis.expire(`report:weekly:${weekStart}`, 5184000); // 60 days

      return report;
    } catch (error) {
      logger.error('Error generating weekly report:', error);
      throw error;
    }
  }

  /**
   * Schedule daily and weekly summaries
   */
  scheduleSummaries() {
    // Check every hour if it's time for summaries
    setInterval(async () => {
      const now = new Date();
      const utcHour = now.getUTCHours();
      const utcMinute = now.getUTCMinutes();

      // Daily summary
      if (this.alertSettings.dailySummaryTimeUTC) {
        const [summaryHour, summaryMinute] = this.alertSettings.dailySummaryTimeUTC.split(':').map(Number);

        if (utcHour === summaryHour && utcMinute < 5) {
          await this.sendDailySummary();
        }
      }

      // Weekly summary
      if (this.alertSettings.weeklySummaryDay && now.getUTCDay() === this.getDayNumber(this.alertSettings.weeklySummaryDay)) {
        if (utcHour === 0 && utcMinute < 5) {
          await this.sendWeeklySummary();
        }
      }
    }, 300000); // Check every 5 minutes
  }

  /**
   * Send daily summary notification
   */
  async sendDailySummary() {
    try {
      const date = new Date().toISOString().split('T')[0];
      const report = await this.generateDailyReport(date);

      if (report.summary.totalTrades === 0) return;

      const message = `<b>📊 DAILY SUMMARY - ${date}</b>\n\n` +
        `<b>Total Trades:</b> ${report.summary.totalTrades}\n` +
        `<b>Net P/L:</b> ${report.summary.netPL >= 0 ? '+' : ''}$${report.summary.netPL.toFixed(2)}\n` +
        `<b>Win Rate:</b> ${report.summary.winRate.toFixed(1)}%\n\n` +
        `<b>Best Route:</b> ${report.summary.bestRoute ? report.routes[report.summary.bestRoute].routeName : 'N/A'}\n` +
        `<b>Worst Route:</b> ${report.summary.worstRoute ? report.routes[report.summary.worstRoute].routeName : 'N/A'}\n` +
        `${report.alerts.length > 0 ? `\n<b>⚠️ Alerts:</b> ${report.alerts.length}` : ''}`;

      await telegram.sendMessage(message);
    } catch (error) {
      logger.error('Error sending daily summary:', error);
    }
  }

  /**
   * Send weekly summary notification
   */
  async sendWeeklySummary() {
    try {
      const weekStart = this.getWeekStart();
      const report = await this.generateWeeklyReport(weekStart);

      const message = `<b>📈 WEEKLY SUMMARY</b>\n` +
        `<b>Period:</b> ${weekStart} to ${report.weekEnd}\n\n` +
        `<b>Total Trades:</b> ${report.summary.totalTrades}\n` +
        `<b>Net P/L:</b> ${report.summary.netPL >= 0 ? '+' : ''}$${report.summary.netPL.toFixed(2)}\n` +
        `<b>Avg Daily Trades:</b> ${report.summary.averageDailyTrades.toFixed(1)}\n\n` +
        `<b>Best Day:</b> ${report.summary.bestDay !== null ? report.dailyBreakdown[report.summary.bestDay].date : 'N/A'}\n` +
        `<b>Top Route:</b> ${report.routes[0] ? report.routes[0].routeName : 'N/A'}\n`;

      await telegram.sendMessage(message);
    } catch (error) {
      logger.error('Error sending weekly summary:', error);
    }
  }

  // Helper functions
  getWeekStart() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - diff);
    return monday.toISOString().split('T')[0];
  }

  addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
  }

  getDayNumber(dayName) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days.indexOf(dayName);
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
export default PerformanceMonitor;