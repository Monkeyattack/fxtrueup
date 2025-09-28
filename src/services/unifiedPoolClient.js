/**
 * Unified Pool Client
 * Platform-agnostic interface that routes to appropriate trading platform
 */

import poolClient from './poolClient.js';
import ctraderPoolClient from './ctrader/ctraderPoolClient.js';
import { logger } from '../utils/logger.js';

class UnifiedPoolClient {
  constructor() {
    this.accountPlatformCache = new Map();
    this.defaultPlatform = 'metaapi'; // Default to MetaAPI for backward compatibility
  }

  /**
   * Get account configuration including platform
   */
  async getAccountConfig(accountId) {
    // Check cache first
    if (this.accountPlatformCache.has(accountId)) {
      return this.accountPlatformCache.get(accountId);
    }

    // Try to load from routing config
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = path.dirname(fileURLToPath(import.meta.url));

      const configPath = path.join(__dirname, '../config/routing-config.json');
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);

      const accountConfig = config.accounts[accountId];
      if (accountConfig) {
        this.accountPlatformCache.set(accountId, accountConfig);
        return accountConfig;
      }
    } catch (error) {
      logger.debug(`Could not load account config for ${accountId}: ${error.message}`);
    }

    // Default to MetaAPI
    const defaultConfig = {
      platform: this.defaultPlatform,
      region: 'new-york'
    };
    this.accountPlatformCache.set(accountId, defaultConfig);
    return defaultConfig;
  }

  /**
   * Get the appropriate pool client for an account
   */
  async getPoolForAccount(accountId) {
    const config = await this.getAccountConfig(accountId);
    return config.platform === 'ctrader' ? ctraderPoolClient : poolClient;
  }

  // ============= ACCOUNT OPERATIONS =============

  async getAccountInfo(accountId, region = 'new-york') {
    const config = await this.getAccountConfig(accountId);
    const pool = await this.getPoolForAccount(accountId);

    if (config.platform === 'ctrader') {
      return pool.getAccountInfo(accountId, config.environment || 'demo');
    } else {
      return pool.getAccountInfo(accountId, region || config.region);
    }
  }

  async getPositions(accountId, region = 'new-york') {
    const config = await this.getAccountConfig(accountId);
    const pool = await this.getPoolForAccount(accountId);

    if (config.platform === 'ctrader') {
      return pool.getPositions(accountId, config.environment || 'demo');
    } else {
      return pool.getPositions(accountId, region || config.region);
    }
  }

  // ============= METASTATS OPERATIONS =============

  async getAccountMetrics(accountId) {
    const pool = await this.getPoolForAccount(accountId);
    return pool.getAccountMetrics(accountId);
  }

  async getTradeHistory(accountId, days = 30, limit = 100) {
    const pool = await this.getPoolForAccount(accountId);
    return pool.getTradeHistory(accountId, days, limit);
  }

  async getDailyGrowth(accountId, days = 30) {
    const pool = await this.getPoolForAccount(accountId);
    return pool.getDailyGrowth(accountId, days);
  }

  async getSymbolStats(accountId, symbol) {
    const pool = await this.getPoolForAccount(accountId);
    return pool.getSymbolStats(accountId, symbol);
  }

  async getRiskStatus(accountId) {
    const pool = await this.getPoolForAccount(accountId);
    return pool.getRiskStatus(accountId);
  }

  async getOpenTrades(accountId) {
    const pool = await this.getPoolForAccount(accountId);
    return pool.getOpenTrades(accountId);
  }

  // ============= TRADING OPERATIONS =============

  async executeTrade(accountId, region, tradeData) {
    const config = await this.getAccountConfig(accountId);
    const pool = await this.getPoolForAccount(accountId);

    logger.info(`Executing trade on ${config.platform} for account ${accountId}`);

    if (config.platform === 'ctrader') {
      return pool.executeTrade(accountId, config.environment || 'demo', tradeData);
    } else {
      return pool.executeTrade(accountId, region || config.region, tradeData);
    }
  }

  async modifyPosition(accountId, region, positionId, stopLoss, takeProfit) {
    const config = await this.getAccountConfig(accountId);
    const pool = await this.getPoolForAccount(accountId);

    if (config.platform === 'ctrader') {
      return pool.modifyPosition(accountId, config.environment || 'demo', positionId, stopLoss, takeProfit);
    } else {
      return pool.modifyPosition(accountId, region || config.region, positionId, stopLoss, takeProfit);
    }
  }

  async closePosition(accountId, region, positionId) {
    const config = await this.getAccountConfig(accountId);
    const pool = await this.getPoolForAccount(accountId);

    if (config.platform === 'ctrader') {
      return pool.closePosition(accountId, config.environment || 'demo', positionId);
    } else {
      return pool.closePosition(accountId, region || config.region, positionId);
    }
  }

  // ============= STREAMING OPERATIONS =============

  async initializeStreaming(accountId, region = 'new-york') {
    const config = await this.getAccountConfig(accountId);
    const pool = await this.getPoolForAccount(accountId);

    if (config.platform === 'ctrader') {
      return pool.initializeStreaming(accountId, config.environment || 'demo');
    } else {
      return pool.initializeStreaming(accountId, region || config.region);
    }
  }

  async subscribeToSymbol(symbol, accountId = null) {
    if (accountId) {
      const pool = await this.getPoolForAccount(accountId);
      return pool.subscribeToSymbol(symbol, accountId);
    } else {
      // Subscribe on both platforms if no specific account
      const promises = [];
      promises.push(poolClient.subscribeToSymbol(symbol));
      promises.push(ctraderPoolClient.subscribeToSymbol(symbol));

      const results = await Promise.allSettled(promises);
      return results.some(r => r.status === 'fulfilled' && r.value === true);
    }
  }

  async getPrice(symbol) {
    // Try to get price from both platforms and return first available
    const promises = [
      poolClient.getPrice(symbol),
      ctraderPoolClient.getPrice(symbol)
    ];

    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
    }

    return null;
  }

  async getAllPrices() {
    // Merge prices from both platforms
    const [metaapiPrices, ctraderPrices] = await Promise.all([
      poolClient.getAllPrices().catch(() => ({})),
      ctraderPoolClient.getAllPrices().catch(() => ({}))
    ]);

    return { ...metaapiPrices, ...ctraderPrices };
  }

  // ============= POOL MANAGEMENT =============

  async getPoolStats() {
    // Get stats from both pools
    const [metaapiStats, ctraderStats] = await Promise.all([
      poolClient.getPoolStats().catch(() => ({})),
      ctraderPoolClient.getPoolStats().catch(() => ({}))
    ]);

    return {
      metaapi: metaapiStats,
      ctrader: ctraderStats,
      combined: {
        connectionsCreated: (metaapiStats.connectionsCreated || 0) + (ctraderStats.connectionsCreated || 0),
        connectionsReused: (metaapiStats.connectionsReused || 0) + (ctraderStats.connectionsReused || 0),
        tradesExecuted: (metaapiStats.tradesExecuted || 0) + (ctraderStats.tradesExecuted || 0),
        errors: (metaapiStats.errors || 0) + (ctraderStats.errors || 0),
        activeConnections: (metaapiStats.activeConnections || 0) + (ctraderStats.activeConnections || 0)
      }
    };
  }

  async getAccountsSummary() {
    // Get summaries from both platforms
    const [metaapiSummary, ctraderSummary] = await Promise.all([
      poolClient.getAccountsSummary().catch(() => ({})),
      ctraderPoolClient.getAccountsSummary().catch(() => ({}))
    ]);

    return { ...metaapiSummary, ...ctraderSummary };
  }

  // ============= CONVENIENCE METHODS =============

  async hasOpenPosition(accountId, symbol, region = 'new-york') {
    const config = await this.getAccountConfig(accountId);
    const pool = await this.getPoolForAccount(accountId);

    if (config.platform === 'ctrader') {
      return pool.hasOpenPosition(accountId, symbol, config.environment || 'demo');
    } else {
      return pool.hasOpenPosition(accountId, symbol, region || config.region);
    }
  }

  async getPositionBySymbol(accountId, symbol, region = 'new-york') {
    const config = await this.getAccountConfig(accountId);
    const pool = await this.getPoolForAccount(accountId);

    if (config.platform === 'ctrader') {
      return pool.getPositionBySymbol(accountId, symbol, config.environment || 'demo');
    } else {
      return pool.getPositionBySymbol(accountId, symbol, region || config.region);
    }
  }

  async getMidPrice(symbol) {
    // Try both platforms
    const price = await this.getPrice(symbol);
    if (price && price.bid && price.ask) {
      return (price.bid + price.ask) / 2;
    }
    return null;
  }

  async waitForPrice(symbol, timeout = 10000) {
    const startTime = Date.now();

    // Subscribe on both platforms
    await this.subscribeToSymbol(symbol);

    while (Date.now() - startTime < timeout) {
      const priceData = await this.getPrice(symbol);
      if (priceData) {
        return priceData;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.warning(`Timeout waiting for price update for ${symbol}`);
    return null;
  }

  // ============= HEALTH CHECK =============

  async healthCheck() {
    const [metaapiHealth, ctraderHealth] = await Promise.all([
      poolClient.healthCheck().catch(err => ({ status: 'error', error: err.message })),
      ctraderPoolClient.healthCheck().catch(err => ({ status: 'error', error: err.message }))
    ]);

    return {
      metaapi: metaapiHealth,
      ctrader: ctraderHealth,
      status: (metaapiHealth.status === 'healthy' || ctraderHealth.status === 'healthy') ? 'healthy' : 'unhealthy'
    };
  }

  // ============= PLATFORM-SPECIFIC METHODS =============

  /**
   * Get pending orders (cTrader specific, but exposed for compatibility)
   */
  async getPendingOrders(accountId, region = 'new-york') {
    const config = await this.getAccountConfig(accountId);

    if (config.platform === 'ctrader') {
      return ctraderPoolClient.getPendingOrders(accountId, config.environment || 'demo');
    } else {
      // MetaAPI doesn't have a separate pending orders endpoint in pool
      // Return empty array for compatibility
      return [];
    }
  }

  /**
   * Place limit order
   */
  async placeLimitOrder(accountId, region, orderData) {
    const config = await this.getAccountConfig(accountId);

    if (config.platform === 'ctrader') {
      return ctraderPoolClient.placeLimitOrder(accountId, config.environment || 'demo', orderData);
    } else {
      // For MetaAPI, use regular execute trade with limit order type
      return poolClient.executeTrade(accountId, region || config.region, {
        ...orderData,
        actionType: orderData.actionType || (orderData.side === 'SELL' ? 'ORDER_TYPE_SELL_LIMIT' : 'ORDER_TYPE_BUY_LIMIT')
      });
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(accountId, region, orderId) {
    const config = await this.getAccountConfig(accountId);

    if (config.platform === 'ctrader') {
      return ctraderPoolClient.cancelOrder(accountId, config.environment || 'demo', orderId);
    } else {
      // MetaAPI doesn't expose order cancellation in the pool
      logger.warn(`Order cancellation not supported for MetaAPI account ${accountId}`);
      return false;
    }
  }
}

// Export singleton instance
export default new UnifiedPoolClient();