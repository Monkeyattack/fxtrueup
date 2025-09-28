/**
 * cTrader Connection Handler
 * Manages individual cTrader connections using OpenApiPy
 * Note: This is a Node.js wrapper that communicates with the Python pool service
 */

import axios from 'axios';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import dataMapper from './dataMapper.js';
import auth from './auth.js';

// Order types mapping
const OrderType = {
  MARKET: 1,
  LIMIT: 2,
  STOP: 3,
  STOP_LOSS_TAKE_PROFIT: 4,
  MARKET_RANGE: 5,
  STOP_LIMIT: 6
};

// Trade side mapping
const TradeSide = {
  BUY: 'BUY',
  SELL: 'SELL'
};

class CTraderConnection extends EventEmitter {
  constructor(accountId, environment = 'demo') {
    super();
    this.accountId = accountId;
    this.environment = environment;
    this.isConnected = false;
    this.connectionId = null;
    this.credentials = null;
    this.positionsCache = new Map();
    this.ordersCache = new Map();
    this.pricesCache = new Map();
    this.lastActivity = Date.now();
  }

  /**
   * Connect to cTrader account
   */
  async connect() {
    try {
      logger.info(`Connecting to cTrader account ${this.accountId} (${this.environment})`);

      // Get access token
      const accessToken = await auth.getAccessToken(this.accountId);
      if (!accessToken) {
        throw new Error('Failed to get access token');
      }

      // Get account credentials from Vault
      this.credentials = await auth.getCredentialsFromVault(this.accountId);
      if (!this.credentials) {
        throw new Error('No credentials found in Vault');
      }

      // Initialize connection via Python pool
      const initResponse = await this._callPoolAPI('/connection/initialize', {
        account_id: this.accountId,
        access_token: accessToken,
        environment: this.environment,
        ctid_account_id: this.credentials.ctidTraderAccountId,
        acc_num: this.credentials.accNum || 1
      });

      if (initResponse.success) {
        this.connectionId = initResponse.connection_id;
        this.isConnected = true;
        logger.info(`Connected to cTrader account ${this.accountId}`);
        this.emit('connected', { accountId: this.accountId });

        // Start heartbeat
        this._startHeartbeat();

        return true;
      } else {
        throw new Error(initResponse.error || 'Failed to initialize connection');
      }
    } catch (error) {
      logger.error(`Failed to connect to cTrader account ${this.accountId}: ${error.message}`);
      this.isConnected = false;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect from cTrader
   */
  async disconnect() {
    try {
      if (this.connectionId) {
        await this._callPoolAPI('/connection/close', {
          connection_id: this.connectionId
        });
      }

      this.isConnected = false;
      this.connectionId = null;
      this._stopHeartbeat();

      logger.info(`Disconnected from cTrader account ${this.accountId}`);
      this.emit('disconnected', { accountId: this.accountId });
    } catch (error) {
      logger.error(`Error disconnecting from cTrader: ${error.message}`);
    }
  }

  /**
   * Get account info
   */
  async getAccountInfo() {
    const response = await this._callPoolAPI('/account/info', {
      connection_id: this.connectionId
    });

    if (response.success) {
      return dataMapper.mapAccountInfo(response.data);
    }
    throw new Error(response.error || 'Failed to get account info');
  }

  /**
   * Get positions
   */
  async getPositions() {
    const response = await this._callPoolAPI('/positions/get', {
      connection_id: this.connectionId
    });

    if (response.success) {
      const positions = response.data.map(pos => dataMapper.mapPosition(pos));

      // Update cache
      this.positionsCache.clear();
      positions.forEach(pos => this.positionsCache.set(pos.id, pos));

      return positions;
    }
    throw new Error(response.error || 'Failed to get positions');
  }

  /**
   * Get pending orders
   */
  async getOrders() {
    const response = await this._callPoolAPI('/orders/get', {
      connection_id: this.connectionId
    });

    if (response.success) {
      const orders = response.data.map(order => dataMapper.mapOrder(order));

      // Update cache
      this.ordersCache.clear();
      orders.forEach(order => this.ordersCache.set(order.id, order));

      return orders;
    }
    throw new Error(response.error || 'Failed to get orders');
  }

  /**
   * Execute a trade
   */
  async executeTrade(tradeData) {
    try {
      // Map MetaAPI format to cTrader format
      const cTraderOrder = dataMapper.mapOrderRequest(tradeData);

      const response = await this._callPoolAPI('/trade/execute', {
        connection_id: this.connectionId,
        ...cTraderOrder
      });

      if (response.success) {
        const result = {
          success: true,
          orderId: response.data.executionId?.toString() || '',
          positionId: response.data.positionId?.toString() || '',
          executedVolume: (response.data.executedVolume || 0) / 100,
          executedPrice: response.data.executionPrice || 0,
          comment: response.data.comment || ''
        };

        this.emit('trade', {
          accountId: this.accountId,
          ...result
        });

        return result;
      } else {
        throw new Error(response.error || 'Trade execution failed');
      }
    } catch (error) {
      logger.error(`Failed to execute trade on cTrader: ${error.message}`);
      throw error;
    }
  }

  /**
   * Modify position (update SL/TP)
   */
  async modifyPosition(positionId, stopLoss, takeProfit) {
    const response = await this._callPoolAPI('/position/modify', {
      connection_id: this.connectionId,
      position_id: positionId,
      stop_loss: stopLoss,
      take_profit: takeProfit
    });

    if (response.success) {
      this.emit('positionModified', {
        accountId: this.accountId,
        positionId,
        stopLoss,
        takeProfit
      });
      return true;
    }
    throw new Error(response.error || 'Failed to modify position');
  }

  /**
   * Close position
   */
  async closePosition(positionId, volume = null) {
    const response = await this._callPoolAPI('/position/close', {
      connection_id: this.connectionId,
      position_id: positionId,
      volume: volume ? Math.round(volume * 100) : null
    });

    if (response.success) {
      this.emit('positionClosed', {
        accountId: this.accountId,
        positionId,
        closedVolume: volume
      });
      return true;
    }
    throw new Error(response.error || 'Failed to close position');
  }

  /**
   * Place limit order
   */
  async placeLimitOrder(orderData) {
    const cTraderOrder = dataMapper.mapOrderRequest(orderData);
    cTraderOrder.orderType = OrderType.LIMIT;

    const response = await this._callPoolAPI('/order/limit', {
      connection_id: this.connectionId,
      ...cTraderOrder
    });

    if (response.success) {
      return {
        success: true,
        orderId: response.data.orderId?.toString() || ''
      };
    }
    throw new Error(response.error || 'Failed to place limit order');
  }

  /**
   * Place stop order
   */
  async placeStopOrder(orderData) {
    const cTraderOrder = dataMapper.mapOrderRequest(orderData);
    cTraderOrder.orderType = OrderType.STOP;

    const response = await this._callPoolAPI('/order/stop', {
      connection_id: this.connectionId,
      ...cTraderOrder
    });

    if (response.success) {
      return {
        success: true,
        orderId: response.data.orderId?.toString() || ''
      };
    }
    throw new Error(response.error || 'Failed to place stop order');
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    const response = await this._callPoolAPI('/order/cancel', {
      connection_id: this.connectionId,
      order_id: orderId
    });

    if (response.success) {
      this.emit('orderCancelled', {
        accountId: this.accountId,
        orderId
      });
      return true;
    }
    throw new Error(response.error || 'Failed to cancel order');
  }

  /**
   * Subscribe to symbol for price updates
   */
  async subscribeToSymbol(symbol) {
    const symbolMapping = dataMapper.symbolMapping[symbol];
    if (!symbolMapping) {
      throw new Error(`Unknown symbol: ${symbol}`);
    }

    const response = await this._callPoolAPI('/streaming/subscribe', {
      connection_id: this.connectionId,
      symbol_id: symbolMapping.cTraderId,
      symbol: symbol
    });

    if (response.success) {
      logger.info(`Subscribed to ${symbol} price updates`);
      return true;
    }
    throw new Error(response.error || 'Failed to subscribe to symbol');
  }

  /**
   * Get current price for symbol
   */
  async getPrice(symbol) {
    const cached = this.pricesCache.get(symbol);
    if (cached && (Date.now() - cached.timestamp) < 1000) {
      return cached.data;
    }

    const response = await this._callPoolAPI('/prices/get', {
      connection_id: this.connectionId,
      symbol: symbol
    });

    if (response.success && response.data) {
      const priceData = {
        symbol: symbol,
        bid: response.data.bid,
        ask: response.data.ask,
        brokerTime: new Date().toISOString()
      };

      this.pricesCache.set(symbol, {
        data: priceData,
        timestamp: Date.now()
      });

      return priceData;
    }
    return null;
  }

  /**
   * Get historical data
   */
  async getHistoricalData(symbol, timeframe, from, to) {
    const symbolMapping = dataMapper.symbolMapping[symbol];
    if (!symbolMapping) {
      throw new Error(`Unknown symbol: ${symbol}`);
    }

    const response = await this._callPoolAPI('/historical/get', {
      connection_id: this.connectionId,
      symbol_id: symbolMapping.cTraderId,
      period: this._mapTimeframe(timeframe),
      from_timestamp: new Date(from).getTime(),
      to_timestamp: new Date(to).getTime()
    });

    if (response.success) {
      return response.data.map(bar => ({
        time: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume
      }));
    }
    throw new Error(response.error || 'Failed to get historical data');
  }

  /**
   * Call the Python pool API
   */
  async _callPoolAPI(endpoint, data) {
    try {
      const poolUrl = process.env.CTRADER_POOL_URL || 'http://localhost:8089';
      const response = await axios.post(`${poolUrl}${endpoint}`, data, {
        timeout: 30000
      });

      this.lastActivity = Date.now();
      return response.data;
    } catch (error) {
      if (error.response) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Map MetaAPI timeframe to cTrader period
   */
  _mapTimeframe(timeframe) {
    const mapping = {
      '1m': 'M1',
      '5m': 'M5',
      '15m': 'M15',
      '30m': 'M30',
      '1h': 'H1',
      '4h': 'H4',
      '1d': 'D1',
      '1w': 'W1',
      '1M': 'MN'
    };
    return mapping[timeframe] || 'H1';
  }

  /**
   * Start heartbeat to keep connection alive
   */
  _startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (Date.now() - this.lastActivity > 30000) {
          await this._callPoolAPI('/connection/heartbeat', {
            connection_id: this.connectionId
          });
        }
      } catch (error) {
        logger.error(`Heartbeat failed: ${error.message}`);
      }
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export default CTraderConnection;