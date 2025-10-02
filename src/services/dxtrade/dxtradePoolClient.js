/**
 * DXtrade Pool Client
 * Connects to the DXtrade connection pool API
 * Mirrors the interface of poolClient.js for compatibility
 */

import axios from 'axios';
import { logger } from '../../utils/logger.js';

class DXTradePoolClient {
  constructor(poolUrl = process.env.DXTRADE_POOL_API_URL || 'http://localhost:8089') {
    this.poolUrl = poolUrl;
    this.client = axios.create({
      baseURL: poolUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          logger.error(`DXtrade Pool API error: ${error.response.status} - ${error.response.data?.detail || error.message}`);
        } else if (error.request) {
          logger.error(`DXtrade Pool API no response: ${error.message}`);
        } else {
          logger.error(`DXtrade Pool API request error: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  // ============= ACCOUNT OPERATIONS =============

  async getAccountInfo(accountId, environment = 'demo') {
    try {
      const response = await this.client.get(`/account/${accountId}`, {
        params: { environment }
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to get DXtrade account info for ${accountId}: ${error.message}`);
      // Return defaults if API fails
      return {
        id: accountId,
        balance: 50000,
        equity: 50000,
        currency: 'USD',
        platform: 'dxtrade'
      };
    }
  }

  async getPositions(accountId, environment = 'demo') {
    try {
      const response = await this.client.get(`/positions/${accountId}`, {
        params: { environment }
      });
      // Return positions array
      return response.data.positions || response.data || [];
    } catch (error) {
      logger.error(`Failed to get DXtrade positions for ${accountId}: ${error.message}`);
      return [];
    }
  }

  // ============= METASTATS OPERATIONS =============

  async getAccountMetrics(accountId) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/metrics`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get DXtrade metrics for ${accountId}: ${error.message}`);
      return {
        trades: 0,
        wonTrades: 0,
        lostTrades: 0,
        winRate: 0,
        profit: 0,
        loss: 0,
        balance: 0,
        equity: 0
      };
    }
  }

  async getTradeHistory(accountId, days = 30, limit = 100) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/trades`, {
        params: { days, limit }
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to get DXtrade trade history for ${accountId}: ${error.message}`);
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
      logger.error(`Failed to get DXtrade daily growth for ${accountId}: ${error.message}`);
      return { growth: [] };
    }
  }

  async getSymbolStats(accountId, symbol) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/symbol-stats/${symbol}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get DXtrade symbol stats for ${symbol}: ${error.message}`);
      return null;
    }
  }

  async getRiskStatus(accountId) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/risk-status`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get DXtrade risk status for ${accountId}: ${error.message}`);
      return null;
    }
  }

  async getOpenTrades(accountId) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/open-trades`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get DXtrade open trades for ${accountId}: ${error.message}`);
      return { open_trades: [], count: 0 };
    }
  }

  // ============= TRADING OPERATIONS =============

  async executeTrade(accountId, environment, tradeData) {
    try {
      const response = await this.client.post('/trade/execute', {
        account_id: accountId,
        environment: environment,
        symbol: tradeData.symbol,
        actionType: tradeData.actionType,
        volume: tradeData.volume,
        openPrice: tradeData.openPrice,
        stopLoss: tradeData.stopLoss,
        takeProfit: tradeData.takeProfit,
        comment: tradeData.comment,
        clientId: tradeData.clientId
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to execute DXtrade trade: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async modifyPosition(accountId, environment, positionId, stopLoss, takeProfit) {
    try {
      const response = await this.client.post('/position/modify', {
        account_id: accountId,
        environment: environment,
        position_id: positionId,
        stop_loss: stopLoss,
        take_profit: takeProfit
      });
      return response.data.success;
    } catch (error) {
      logger.error(`Failed to modify DXtrade position: ${error.message}`);
      return false;
    }
  }

  async closePosition(accountId, environment, positionId) {
    try {
      const response = await this.client.post('/position/close', {
        account_id: accountId,
        environment: environment,
        position_id: positionId
      });
      return {
        success: response.data.success,
        profit: response.data.profit || 0,
        orderId: response.data.order_id
      };
    } catch (error) {
      logger.error(`Failed to close DXtrade position: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============= STREAMING OPERATIONS =============

  async initializeStreaming(accountId, environment = 'demo') {
    try {
      const response = await this.client.post('/streaming/initialize', {
        account_id: accountId,
        environment: environment
      });
      return response.data.success;
    } catch (error) {
      logger.error(`Failed to initialize DXtrade streaming: ${error.message}`);
      return false;
    }
  }

  async subscribeToSymbol(symbol, accountId = null) {
    try {
      const response = await this.client.post('/streaming/subscribe', {
        symbol: symbol,
        account_id: accountId
      });
      return response.data.success;
    } catch (error) {
      logger.error(`Failed to subscribe to DXtrade ${symbol}: ${error.message}`);
      return false;
    }
  }

  async getPrice(symbol) {
    try {
      const response = await this.client.get(`/prices/${symbol}`);
      return response.data;
    } catch (error) {
      logger.debug(`No DXtrade price available for ${symbol}`);
      return null;
    }
  }

  async getAllPrices() {
    try {
      const response = await this.client.get('/prices');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get DXtrade prices: ${error.message}`);
      return {};
    }
  }

  // ============= POOL MANAGEMENT =============

  async getPoolStats() {
    try {
      const response = await this.client.get('/pool/stats');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get DXtrade pool stats: ${error.message}`);
      return {
        connectionsCreated: 0,
        connectionsReused: 0,
        tradesExecuted: 0,
        errors: 0,
        activeConnections: 0
      };
    }
  }

  async getAccountsSummary() {
    try {
      const response = await this.client.get('/accounts/summary');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get DXtrade accounts summary: ${error.message}`);
      return {};
    }
  }

  // ============= CONVENIENCE METHODS =============

  async hasOpenPosition(accountId, symbol, environment = 'demo') {
    const positions = await this.getPositions(accountId, environment);
    return positions.some(position => position.symbol === symbol);
  }

  async getPositionBySymbol(accountId, symbol, environment = 'demo') {
    const positions = await this.getPositions(accountId, environment);
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

    logger.warning(`Timeout waiting for DXtrade price update for ${symbol}`);
    return null;
  }

  // ============= HEALTH CHECK =============

  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      logger.error(`DXtrade Pool API health check failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  // ============= PLATFORM-SPECIFIC METHODS =============

  /**
   * Get pending orders (if DXtrade supports)
   */
  async getPendingOrders(accountId, environment = 'demo') {
    try {
      const response = await this.client.get(`/orders/${accountId}`, {
        params: { environment }
      });
      return response.data.orders || [];
    } catch (error) {
      logger.debug(`Failed to get DXtrade pending orders: ${error.message}`);
      return [];
    }
  }

  /**
   * Place limit order
   */
  async placeLimitOrder(accountId, environment, orderData) {
    try {
      const response = await this.client.post('/order/limit', {
        account_id: accountId,
        environment: environment,
        ...orderData
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to place DXtrade limit order: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(accountId, environment, orderId) {
    try {
      const response = await this.client.post('/order/cancel', {
        account_id: accountId,
        environment: environment,
        order_id: orderId
      });
      return response.data.success;
    } catch (error) {
      logger.error(`Failed to cancel DXtrade order: ${error.message}`);
      return false;
    }
  }
}

// Export singleton instance
export default new DXTradePoolClient();
