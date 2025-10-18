import axios from 'axios';
import { logger } from '../utils/logger.js';

/**
 * MetaAPI Pool Client
 * Connects to the meta-trader-hub connection pool API
 * instead of creating direct MetaAPI connections
 */
class PoolClient {
  constructor(poolUrl = process.env.POOL_API_URL || 'http://localhost:8086') {
    this.poolUrl = poolUrl;
    this.client = axios.create({
      baseURL: poolUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Circuit breaker state per account
    this.accountCircuitBreakers = new Map(); // accountId -> { failures: 0, isPaused: false, lastFailure: Date, alertSent: false }

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          logger.error(`Pool API error: ${error.response.status} - ${error.response.data?.detail || error.message}`);
        } else if (error.request) {
          logger.error(`Pool API no response: ${error.message}`);
        } else {
          logger.error(`Pool API request error: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  // ============= ACCOUNT OPERATIONS =============

  async getAccountInfo(accountId, region = 'new-york') {
    try {
      const response = await this.client.get(`/account/${accountId}`, {
        params: { region }
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to get account info for ${accountId}: ${error.message}`);
      // Return defaults if API fails
      return {
        id: accountId,
        balance: 50000,
        equity: 50000,
        currency: 'USD',
        platform: 'mt5'
      };
    }
  }

  async getPositions(accountId, region = 'new-york') {
    // Check circuit breaker
    if (this.isAccountPaused(accountId)) {
      logger.debug(`⏸️  Account ${accountId.slice(0, 8)} paused due to failures, skipping request`);
      return [];
    }

    try {
      const response = await this.client.get(`/positions/${accountId}`, {
        params: { region }
      });

      // Success - reset circuit breaker
      this.recordSuccess(accountId);

      // Meta-trader-hub returns object with positions array
      return response.data.positions || response.data || [];
    } catch (error) {
      logger.error(`Failed to get positions for ${accountId}: ${error.message}`);

      // Record failure and check if should pause
      this.recordFailure(accountId);

      return [];
    }
  }

  // ============= METASTATS OPERATIONS =============

  async getAccountMetrics(accountId) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/metrics`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get metrics for ${accountId}: ${error.message}`);
      throw error;
    }
  }

  async getTradeHistory(accountId, days = 30, limit = 100) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/trades`, {
        params: { days, limit }
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to get trade history for ${accountId}: ${error.message}`);
      return { trades: [], count: 0 };
    }
  }

  async getDailyGrowth(accountId, days = 30) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/daily-growth`, {
        params: { days }
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to get daily growth for ${accountId}: ${error.message}`);
      return { growth: [] };
    }
  }

  async getSymbolStats(accountId, symbol) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/symbol-stats/${symbol}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get symbol stats for ${symbol}: ${error.message}`);
      return null;
    }
  }

  async getRiskStatus(accountId) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/risk-status`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get risk status for ${accountId}: ${error.message}`);
      return null;
    }
  }

  async getOpenTrades(accountId) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/open-trades`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get open trades for ${accountId}: ${error.message}`);
      return { open_trades: [], count: 0 };
    }
  }

  // ============= TRADING OPERATIONS =============

  async executeTrade(accountId, region, tradeData) {
    try {
      // Convert camelCase to snake_case for Python API
      const payload = {
        account_id: accountId,
        region: region,
        symbol: tradeData.symbol,
        action: tradeData.action,
        volume: tradeData.volume,
        stop_loss: tradeData.stopLoss,  // Convert camelCase to snake_case
        take_profit: tradeData.takeProfit,  // Convert camelCase to snake_case
        comment: tradeData.comment || 'FXTrueUp'
      };

      const response = await this.client.post('/trade/execute', payload);
      const data = response.data;

      // Python API returns {success: true, result: {...}} but we need to flatten it
      if (data.success && data.result) {
        return {
          success: true,
          orderId: data.result.orderId || data.result.positionId,
          positionId: data.result.positionId,
          openPrice: data.result.openPrice,
          ...data.result
        };
      }

      return data;
    } catch (error) {
      logger.error(`Failed to execute trade: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async modifyPosition(accountId, region, positionId, stopLoss, takeProfit) {
    try {
      const response = await this.client.post('/position/modify', {
        account_id: accountId,
        region: region,
        position_id: positionId,
        stop_loss: stopLoss,
        take_profit: takeProfit
      });
      return response.data.success;
    } catch (error) {
      logger.error(`Failed to modify position: ${error.message}`);
      return false;
    }
  }

  async closePosition(accountId, region, positionId) {
    try {
      const response = await this.client.post('/position/close', {
        account_id: accountId,
        region: region,
        position_id: positionId
      });
      return {
        success: response.data.success,
        profit: response.data.profit || 0,
        orderId: response.data.order_id
      };
    } catch (error) {
      logger.error(`Failed to close position: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getRecentHistory(accountId, region, hours = 24, symbol = null) {
    // This endpoint doesn't exist in the pool API
    // History tracking should be done via real-time position monitoring
    logger.debug(`getRecentHistory deprecated - use real-time position monitoring instead`);
    return [];
  }

  // ============= STREAMING OPERATIONS =============

  async initializeStreaming(accountId, region = 'new-york') {
    try {
      const response = await this.client.post('/streaming/initialize', {
        account_id: accountId,
        region: region
      });
      return response.data.success;
    } catch (error) {
      logger.error(`Failed to initialize streaming: ${error.message}`);
      return false;
    }
  }

  async registerReconnectionCallback(callback) {
    try {
      const response = await this.client.post('/streaming/register-reconnection-callback', {
        callback_id: callback.name || 'anonymous'
      });

      // Store callback locally for when the pool notifies us
      if (!this._reconnectionCallbacks) {
        this._reconnectionCallbacks = [];
      }
      this._reconnectionCallbacks.push(callback);

      logger.info(`✅ Registered reconnection callback: ${callback.name || 'anonymous'}`);
      return response.data.success;
    } catch (error) {
      logger.error(`Failed to register reconnection callback: ${error.message}`);
      return false;
    }
  }

  async subscribeToSymbol(symbol) {
    try {
      const response = await this.client.post('/streaming/subscribe', {
        symbol: symbol
      });
      return response.data.success;
    } catch (error) {
      logger.error(`Failed to subscribe to ${symbol}: ${error.message}`);
      return false;
    }
  }

  async getStreamingConnection(accountId, region) {
    try {
      // Note: The pool API manages the actual streaming connections
      // We return a proxy object that routes through the pool
      return {
        addSynchronizationListener: (listener) => {
          // Store listener reference for event routing
          this._streamingListeners = this._streamingListeners || new Map();
          this._streamingListeners.set(accountId, listener);
        },
        removeSynchronizationListener: (listener) => {
          if (this._streamingListeners) {
            this._streamingListeners.delete(accountId);
          }
        },
        subscribeToMarketData: async (symbol) => {
          return await this.subscribeToSymbol(symbol);
        }
      };
    } catch (error) {
      logger.error(`Failed to get streaming connection: ${error.message}`);
      return null;
    }
  }

  async getPrice(symbol) {
    try {
      const response = await this.client.get(`/prices/${symbol}`);
      return response.data;
    } catch (error) {
      logger.debug(`No price available for ${symbol}`);
      return null;
    }
  }

  async getAllPrices() {
    try {
      const response = await this.client.get('/prices');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get prices: ${error.message}`);
      return {};
    }
  }

  // ============= POOL MANAGEMENT =============

  async getPoolStats() {
    try {
      const response = await this.client.get('/pool/stats');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get pool stats: ${error.message}`);
      return {};
    }
  }

  async getAccountsSummary() {
    try {
      const response = await this.client.get('/accounts/summary');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get accounts summary: ${error.message}`);
      return {};
    }
  }

  // ============= CONVENIENCE METHODS =============

  async hasOpenPosition(accountId, symbol, region = 'new-york') {
    const positions = await this.getPositions(accountId, region);
    return positions.some(position => position.symbol === symbol);
  }

  async getPositionBySymbol(accountId, symbol, region = 'new-york') {
    const positions = await this.getPositions(accountId, region);
    return positions.find(position => position.symbol === symbol) || null;
  }

  async getMidPrice(symbol) {
    const priceData = await this.getPrice(symbol);
    if (priceData && priceData.bid && priceData.ask) {
      return (priceData.bid + priceData.ask) / 2;
    }
    return null;
  }

  async waitForPrice(symbol, timeout = 10000) {
    const startTime = Date.now();
    
    // Ensure subscribed
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
    try {
      const response = await this.client.get('/');
      return response.data;
    } catch (error) {
      logger.error(`Pool API health check failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  // ============= CIRCUIT BREAKER =============

  /**
   * Check if account is paused due to failures
   */
  isAccountPaused(accountId) {
    const breaker = this.accountCircuitBreakers.get(accountId);
    if (!breaker) return false;

    // Auto-resume after 5 minutes
    if (breaker.isPaused) {
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      if (breaker.lastFailure < fiveMinutesAgo) {
        logger.info(`▶️  Resuming account ${accountId.slice(0, 8)} after 5-minute cooldown`);
        breaker.isPaused = false;
        breaker.failures = 0;
        breaker.alertSent = false; // Reset alert flag
        return false;
      }
    }

    return breaker.isPaused;
  }

  /**
   * Record successful request
   */
  recordSuccess(accountId) {
    const breaker = this.accountCircuitBreakers.get(accountId);
    if (breaker && breaker.failures > 0) {
      logger.info(`✅ Account ${accountId.slice(0, 8)} recovered (was ${breaker.failures} failures)`);
      breaker.failures = 0;
      breaker.isPaused = false;
      breaker.alertSent = false; // Reset alert flag on recovery
    }
  }

  /**
   * Record failed request and pause if threshold reached
   */
  recordFailure(accountId) {
    let breaker = this.accountCircuitBreakers.get(accountId);

    if (!breaker) {
      breaker = { failures: 0, isPaused: false, lastFailure: Date.now(), alertSent: false };
      this.accountCircuitBreakers.set(accountId, breaker);
    }

    const now = Date.now();
    const timeSinceLastFailure = now - breaker.lastFailure;

    // Reset failure count if last failure was more than 30 seconds ago
    // This prevents rapid failures during pool initialization from triggering circuit breaker
    if (timeSinceLastFailure > 30000) {
      logger.debug(`Resetting failure count for ${accountId.slice(0, 8)} (${timeSinceLastFailure}ms since last failure)`);
      breaker.failures = 0;
    }

    breaker.failures++;
    breaker.lastFailure = now;

    logger.debug(`Account ${accountId.slice(0, 8)} failure #${breaker.failures} (${timeSinceLastFailure}ms since last)`);

    if (breaker.failures >= 3 && !breaker.isPaused) {
      breaker.isPaused = true;

      const accountNickname = this.getAccountNickname(accountId);

      logger.error(`🚨 CIRCUIT BREAKER TRIGGERED for ${accountNickname} (${accountId.slice(0, 8)})`);
      logger.error(`   Failed 3 times in a row - pausing requests for 5 minutes`);

      // Send Telegram alert ONLY if not already sent
      if (!breaker.alertSent) {
        this.sendCircuitBreakerAlert(accountId, accountNickname);
        breaker.alertSent = true;
      }
    }
  }

  /**
   * Get account nickname from routing config
   */
  getAccountNickname(accountId) {
    // Try to load from routing config if available
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(process.cwd(), 'src/config/routing-config.json');

      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.accounts?.[accountId]?.nickname || accountId.slice(0, 8);
      }
    } catch (error) {
      // Ignore - just return short ID
    }

    return accountId.slice(0, 8);
  }

  /**
   * Send Telegram alert about circuit breaker
   */
  async sendCircuitBreakerAlert(accountId, nickname) {
    try {
      const telegram = (await import('../utils/telegram.js')).default;

      const message = `<b>🚨 CIRCUIT BREAKER TRIGGERED</b>

<b>Account:</b> ${nickname}
<b>ID:</b> ${accountId}
<b>Reason:</b> 3 consecutive failures

<b>Action:</b> Account paused for 5 minutes
<b>Will auto-resume:</b> ${new Date(Date.now() + 5 * 60 * 1000).toLocaleTimeString()}

<i>Check account connection and broker status.</i>`;

      await telegram.sendMessage(message);
    } catch (error) {
      logger.error(`Failed to send circuit breaker alert: ${error.message}`);
    }
  }

  /**
   * Get circuit breaker status for all accounts
   */
  getCircuitBreakerStatus() {
    const status = [];

    for (const [accountId, breaker] of this.accountCircuitBreakers.entries()) {
      if (breaker.failures > 0 || breaker.isPaused) {
        status.push({
          accountId: accountId.slice(0, 8),
          failures: breaker.failures,
          isPaused: breaker.isPaused,
          lastFailure: new Date(breaker.lastFailure).toISOString()
        });
      }
    }

    return status;
  }
}

// Export singleton instance
export default new PoolClient();