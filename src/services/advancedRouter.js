/**
 * Advanced Router Service
 * Manages multiple copy trading routes with configurable rules
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import FilteredCopyTrader from './filteredCopyTrader.js';
import { logger } from '../utils/logger.js';
import telegram from '../utils/telegram.js';
import { performanceMonitor } from './performanceMonitor.js';
import orphanedPositionCleaner from '../utils/orphanedPositionCleaner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class AdvancedRouter {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '../config/routing-config.json');
    this.config = null;
    this.routes = new Map();
    this.stats = new Map();
    this.isRunning = false;
  }

  /**
   * Load configuration from JSON file
   */
  async loadConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
      logger.info(`📋 Loaded routing configuration from ${this.configPath}`);
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // If config doesn't exist, copy from example
        const examplePath = path.join(__dirname, '../config/routing-config-example.json');
        await fs.copyFile(examplePath, this.configPath);
        logger.info(`📄 Created routing config from example`);
        return this.loadConfig();
      }
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.config) throw new Error('No configuration loaded');

    const { accounts, ruleSets, filters, routes } = this.config;

    // Validate all routes
    for (const route of routes) {
      if (!accounts[route.source]) {
        throw new Error(`Route ${route.id}: Unknown source account ${route.source}`);
      }
      if (!accounts[route.destination]) {
        throw new Error(`Route ${route.id}: Unknown destination account ${route.destination}`);
      }
      if (!ruleSets[route.ruleSet]) {
        throw new Error(`Route ${route.id}: Unknown rule set ${route.ruleSet}`);
      }

      // Validate filters in rule set
      const ruleSet = ruleSets[route.ruleSet];
      if (ruleSet.filters) {
        for (const filterName of ruleSet.filters) {
          if (!filters[filterName]) {
            throw new Error(`Rule set ${route.ruleSet}: Unknown filter ${filterName}`);
          }
        }
      }
    }

    logger.info('✅ Configuration validated successfully');
  }

  /**
   * Create a copy trader instance for a route
   */
  createTrader(route) {
    const source = this.config.accounts[route.source];
    const dest = this.config.accounts[route.destination];
    const ruleSet = this.config.ruleSets[route.ruleSet];
    const filters = this.config.filters;

    // Create custom trader with enhanced configuration
    const trader = new FilteredCopyTrader(
      route.source,
      route.destination,
      dest.region,
      source.region,
      this.config
    );

    // Apply rule set configuration
    this.applyRuleSet(trader, ruleSet, filters);

    // Add route metadata
    trader.routeId = route.id;
    trader.routeName = route.name;
    trader.sourceNickname = source.nickname;
    trader.destNickname = dest.nickname;
    trader.ruleSetName = ruleSet.name;
    trader.notifications = route.notifications;
    trader.copyExistingPositions = route.copyExistingPositions || false;

    // Override notification methods to include route details
    this.enhanceNotifications(trader);

    return trader;
  }

  /**
   * Apply rule set to trader
   */
  applyRuleSet(trader, ruleSet, filterDefinitions) {
    // Apply basic settings
    if (ruleSet.type === 'proportional') {
      trader.config.multiplier = ruleSet.multiplier;
      trader.config.fixedLotSize = null;
    } else if (ruleSet.type === 'fixed') {
      trader.config.fixedLotSize = ruleSet.fixedLotSize;
      trader.config.multiplier = null;
    } else if (ruleSet.type === 'dynamic') {
      trader.config.dynamicSizing = ruleSet;
    }

    // Apply limits
    if (ruleSet.maxDailyTrades !== undefined) {
      trader.config.maxDailyTrades = ruleSet.maxDailyTrades;
    }
    if (ruleSet.maxDailyLoss !== undefined) {
      trader.config.dailyLossLimit = ruleSet.maxDailyLoss;
    }
    if (ruleSet.minTimeBetweenTrades !== undefined) {
      trader.config.minTimeBetweenTrades = ruleSet.minTimeBetweenTrades;
    }
    if (ruleSet.maxOpenPositions !== undefined) {
      trader.config.maxOpenPositions = ruleSet.maxOpenPositions;
    }

    // Apply filters
    if (ruleSet.filters && Array.isArray(ruleSet.filters)) {
      trader.config.activeFilters = ruleSet.filters.map(filterName => {
        const filter = filterDefinitions[filterName];
        if (!filter) {
          logger.warn(`Filter ${filterName} not found in definitions`);
          return null;
        }
        return { name: filterName, ...filter };
      }).filter(f => f !== null);
    }
  }

  /**
   * Enhance trader notifications with route details
   */
  enhanceNotifications(trader) {
    const originalNotifyDetected = telegram.notifyPositionDetected.bind(telegram);
    const originalNotifySuccess = telegram.notifyCopySuccess.bind(telegram);
    const originalNotifyFailure = telegram.notifyCopyFailure.bind(telegram);
    const originalNotifyRejection = telegram.notifyFilterRejection.bind(telegram);

    // Override notification methods on the trader's telegram instance
    trader.telegramOverrides = {
      notifyPositionDetected: async (position, sourceAccount) => {
        if (!trader.notifications.onCopy) return;

        const message = `<b>🎯 NEW POSITION DETECTED</b>

<b>Route:</b> ${trader.sourceNickname} → ${trader.destNickname}
<b>Rules:</b> "${trader.ruleSetName}"

<b>Symbol:</b> ${position.symbol}
<b>Type:</b> ${position.type || 'BUY'}
<b>Volume:</b> ${position.volume} lots
<b>Open Price:</b> ${position.openPrice}

<i>Evaluating filters...</i>`;

        await telegram.sendMessage(message);
      },

      notifyCopySuccess: async (position, destAccount, result) => {
        if (!trader.notifications.onCopy) return;

        const sourceVol = position.volume;
        const destVol = result.volume || position.volume;
        const multiplier = (destVol / sourceVol).toFixed(2);

        const message = `<b>✅ TRADE COPIED SUCCESSFULLY</b>

<b>Route:</b> ${trader.sourceNickname} → ${trader.destNickname}
<b>Rules:</b> "${trader.ruleSetName}"

<b>Symbol:</b> ${position.symbol}
<b>Original:</b> ${sourceVol} lots
<b>Copied:</b> ${destVol} lots (${multiplier}x)
<b>Order ID:</b> ${result.orderId}

<b>Execution Time:</b> ${new Date().toISOString()}`;

        await telegram.sendMessage(message);
      },

      notifyFilterRejection: async (position, filters) => {
        if (!trader.notifications.onFilter) return;

        const filterList = filters.map(f => `• ${f}`).join('\n');

        const message = `<b>🚫 TRADE FILTERED OUT</b>

<b>Route:</b> ${trader.sourceNickname} → ${trader.destNickname}
<b>Rules:</b> "${trader.ruleSetName}"

<b>Symbol:</b> ${position.symbol}
<b>Volume:</b> ${position.volume} lots

<b>Failed Filters:</b>
${filterList}`;

        await telegram.sendMessage(message);
      }
    };
  }

  /**
   * Start all enabled routes
   */
  async start() {
    if (this.isRunning) {
      logger.warn('AdvancedRouter is already running');
      return;
    }

    logger.info('🚀 Starting Advanced Router...');

    // Load and validate configuration
    await this.loadConfig();
    this.validateConfig();

    // Start enabled routes
    const enabledRoutes = this.config.routes.filter(route => route.enabled);
    logger.info(`📊 Found ${enabledRoutes.length} enabled routes`);

    for (const route of enabledRoutes) {
      try {
        logger.info(`🔄 Starting route: ${route.name}`);
        const trader = this.createTrader(route);

        // Store trader instance
        this.routes.set(route.id, {
          route,
          trader,
          startTime: new Date()
        });

        // Initialize stats
        this.stats.set(route.id, {
          detected: 0,
          copied: 0,
          filtered: 0,
          errors: 0,
          profit: 0
        });

        // Start the trader
        await trader.start();

        logger.info(`✅ Route ${route.name} started successfully`);
      } catch (error) {
        logger.error(`❌ Failed to start route ${route.name}:`, error);
      }
    }

    this.isRunning = true;

    // Start monitoring
    this.startMonitoring();

    // Start performance monitor
    await performanceMonitor.start();

    // Start orphaned position cleanup (every 30 minutes)
    orphanedPositionCleaner.startAutoCleanup(this.config, 30);

    logger.info('✅ Advanced Router started successfully');
  }

  /**
   * Stop all routes
   */
  async stop() {
    logger.info('🛑 Stopping Advanced Router...');

    for (const [routeId, { trader, route }] of this.routes) {
      try {
        logger.info(`Stopping route: ${route.name}`);
        trader.stop();
      } catch (error) {
        logger.error(`Error stopping route ${route.name}:`, error);
      }
    }

    this.routes.clear();
    this.isRunning = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    // Stop performance monitor
    performanceMonitor.stop();

    // Stop orphan cleanup
    orphanedPositionCleaner.stopAutoCleanup();

    logger.info('✅ Advanced Router stopped');
  }

  /**
   * Start monitoring routes
   */
  startMonitoring() {
    // Monitor route performance
    this.monitorInterval = setInterval(() => {
      this.checkRouteHealth();
      this.checkGlobalLimits();
    }, 60000); // Check every minute
  }

  /**
   * Check health of all routes
   */
  checkRouteHealth() {
    for (const [routeId, { trader, route }] of this.routes) {
      const stats = trader.getStats();
      this.stats.set(routeId, stats);

      // Check if route is still healthy
      if (stats.dailyLoss > trader.config.dailyLossLimit * 0.9) {
        logger.warn(`⚠️ Route ${route.name} approaching daily loss limit`);
      }
    }
  }

  /**
   * Check global emergency stop loss
   */
  checkGlobalLimits() {
    if (!this.config.globalSettings.emergencyStopLoss.enabled) return;

    let totalDailyLoss = 0;
    for (const [routeId, stats] of this.stats) {
      totalDailyLoss += stats.dailyLoss || 0;
    }

    if (totalDailyLoss >= this.config.globalSettings.emergencyStopLoss.dailyLossLimit) {
      logger.error(`🚨 EMERGENCY STOP: Global daily loss limit reached: $${totalDailyLoss}`);

      // Disable all routes
      this.emergencyStop();
    }
  }

  /**
   * Emergency stop all routes
   */
  async emergencyStop() {
    logger.error('🚨 EMERGENCY STOP TRIGGERED');

    await telegram.sendMessage(`<b>🚨 EMERGENCY STOP</b>

All routes have been disabled due to global loss limit.

<b>Action Required:</b> Review positions and risk settings.`);

    await this.stop();
  }

  /**
   * Get current stats for all routes
   */
  getStats() {
    const routeStats = [];

    for (const [routeId, { route, trader, startTime }] of this.routes) {
      const stats = trader.getStats();
      routeStats.push({
        routeId,
        routeName: route.name,
        source: trader.sourceNickname,
        destination: trader.destNickname,
        ruleSet: trader.ruleSetName,
        enabled: route.enabled,
        startTime,
        stats
      });
    }

    return {
      isRunning: this.isRunning,
      totalRoutes: this.routes.size,
      routes: routeStats,
      timestamp: new Date()
    };
  }

  /**
   * Enable or disable a route
   */
  async toggleRoute(routeId, enabled) {
    // Update config
    const route = this.config.routes.find(r => r.id === routeId);
    if (!route) throw new Error(`Route ${routeId} not found`);

    route.enabled = enabled;

    // Save config
    await this.saveConfig();

    // Apply change if running
    if (this.isRunning) {
      if (enabled) {
        // Start the route
        const trader = this.createTrader(route);
        this.routes.set(route.id, { route, trader, startTime: new Date() });
        await trader.start();
      } else {
        // Stop the route
        const routeData = this.routes.get(routeId);
        if (routeData) {
          routeData.trader.stop();
          this.routes.delete(routeId);
        }
      }
    }

    return { success: true, route };
  }

  /**
   * Save configuration to file
   */
  async saveConfig() {
    await fs.writeFile(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      'utf8'
    );
    logger.info('💾 Configuration saved');
  }
}

// Export singleton instance
export const advancedRouter = new AdvancedRouter();
export default AdvancedRouter;