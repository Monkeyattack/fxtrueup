import axios from 'axios';
import { logger } from '../utils/logger.js';

/**
 * MetaAPI Pool Client
 * Connects to the meta-trader-hub connection pool API
 * instead of creating direct MetaAPI connections
 */
class PoolClient {
  constructor(poolUrl = process.env.POOL_API_URL || 'http://localhost:8087') {
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
    try {
      const response = await this.client.get(`/positions/${accountId}`, {
        params: { region }
      });
      // Meta-trader-hub returns object with positions array
      return response.data.positions || response.data || [];
    } catch (error) {
      logger.error(`Failed to get positions for ${accountId}: ${error.message}`);
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
      const response = await this.client.post('/trade/execute', {
        account_id: accountId,
        region: region,
        ...tradeData
      });
      return response.data;
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
      return response.data.success;
    } catch (error) {
      logger.error(`Failed to close position: ${error.message}`);
      return false;
    }
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
}

// Export singleton instance
export default new PoolClient();