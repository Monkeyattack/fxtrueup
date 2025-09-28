/**
 * Data Mapper for cTrader to MetaAPI format conversion
 * Ensures compatibility with existing MetaAPI-based systems
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CTraderDataMapper {
  constructor() {
    this.symbolMapping = {};
    this.reverseSymbolMapping = {};
    this.initialized = false;
    this.initPromise = this.loadSymbolMapping();
  }

  async loadSymbolMapping() {
    try {
      const configPath = path.join(__dirname, 'config', 'symbols.json');
      const data = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(data);
      this.symbolMapping = config.symbolMapping || {};

      // Create reverse mapping for quick lookups
      this.reverseSymbolMapping = {};
      for (const [mt5Symbol, mapping] of Object.entries(this.symbolMapping)) {
        this.reverseSymbolMapping[mapping.cTraderId] = {
          ...mapping,
          mt5Symbol
        };
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to load symbol mapping:', error);
      this.symbolMapping = {};
      this.reverseSymbolMapping = {};
      this.initialized = true;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initPromise;
    }
  }

  /**
   * Convert cTrader position to MetaAPI format
   */
  async mapPosition(cTraderPosition) {
    await this.ensureInitialized();

    const symbolInfo = this.reverseSymbolMapping[cTraderPosition.symbolId] || {};
    const mt5Symbol = symbolInfo.mt5Symbol || `UNKNOWN_${cTraderPosition.symbolId}`;

    // cTrader uses volume * 100
    const volume = (cTraderPosition.volume || 0) / 100;

    // Calculate current price based on position type
    const isBuy = cTraderPosition.tradeSide === 'BUY';
    const currentPrice = isBuy ?
      cTraderPosition.currentPrice || cTraderPosition.entryPrice :
      cTraderPosition.currentPrice || cTraderPosition.entryPrice;

    return {
      id: cTraderPosition.positionId?.toString() || '',
      type: isBuy ? 'POSITION_TYPE_BUY' : 'POSITION_TYPE_SELL',
      symbol: mt5Symbol,
      magic: cTraderPosition.label ? parseInt(cTraderPosition.label) || 0 : 0,
      openPrice: cTraderPosition.entryPrice || 0,
      currentPrice: currentPrice,
      currentTickValue: symbolInfo.tickValue || 1,
      volume: volume,
      swap: cTraderPosition.swap || 0,
      profit: cTraderPosition.profit || 0,
      commission: cTraderPosition.commission || 0,
      clientId: cTraderPosition.comment || '',
      stopLoss: cTraderPosition.stopLoss || 0,
      takeProfit: cTraderPosition.takeProfit || 0,
      comment: cTraderPosition.comment || '',
      updateTime: new Date(cTraderPosition.utcLastUpdateTimestamp || Date.now()).toISOString(),
      openTime: new Date(cTraderPosition.utcTimestamp || Date.now()).toISOString(),
      realizedProfit: cTraderPosition.realizedProfit || 0,
      unrealizedProfit: cTraderPosition.unrealizedProfit || cTraderPosition.profit || 0
    };
  }

  /**
   * Convert MetaAPI order format to cTrader format
   */
  async mapOrderRequest(metaApiOrder) {
    await this.ensureInitialized();

    const symbolMapping = this.symbolMapping[metaApiOrder.symbol];
    if (!symbolMapping) {
      throw new Error(`Unknown symbol: ${metaApiOrder.symbol}`);
    }

    // Convert volume (MetaAPI uses lots, cTrader uses volume * 100)
    const volume = Math.round((metaApiOrder.volume || 0) * 100);

    // Map order type
    const orderTypeMap = {
      'ORDER_TYPE_BUY': 1,         // MARKET
      'ORDER_TYPE_SELL': 1,        // MARKET
      'ORDER_TYPE_BUY_LIMIT': 2,   // LIMIT
      'ORDER_TYPE_SELL_LIMIT': 2,  // LIMIT
      'ORDER_TYPE_BUY_STOP': 3,    // STOP
      'ORDER_TYPE_SELL_STOP': 3    // STOP
    };

    // Map trade side
    const actionType = metaApiOrder.actionType || 'ORDER_TYPE_BUY';
    const tradeSide = actionType.includes('BUY') ? 'BUY' : 'SELL';

    const cTraderOrder = {
      symbolId: symbolMapping.cTraderId,
      orderType: orderTypeMap[actionType] || 1,
      tradeSide: tradeSide,
      volume: volume,
      comment: metaApiOrder.comment || '',
      label: metaApiOrder.clientId || ''
    };

    // Add price for limit/stop orders
    if (actionType.includes('LIMIT')) {
      cTraderOrder.limitPrice = metaApiOrder.openPrice || 0;
    } else if (actionType.includes('STOP')) {
      cTraderOrder.stopPrice = metaApiOrder.openPrice || 0;
    }

    // Add SL/TP if provided
    if (metaApiOrder.stopLoss) {
      cTraderOrder.stopLoss = metaApiOrder.stopLoss;
    }
    if (metaApiOrder.takeProfit) {
      cTraderOrder.takeProfit = metaApiOrder.takeProfit;
    }

    return cTraderOrder;
  }

  /**
   * Convert cTrader account info to MetaAPI format
   */
  async mapAccountInfo(cTraderAccount) {
    await this.ensureInitialized();

    const accountId = cTraderAccount.accountId || cTraderAccount.ctidTraderAccountId || '';

    return {
      id: accountId.toString(),
      brokerTime: new Date().toISOString(),
      broker: cTraderAccount.brokerName || 'cTrader',
      currency: cTraderAccount.currency || 'USD',
      server: cTraderAccount.environment || 'demo',
      balance: cTraderAccount.balance || 0,
      equity: cTraderAccount.equity || cTraderAccount.balance || 0,
      margin: cTraderAccount.margin || 0,
      freeMargin: cTraderAccount.freeMargin || cTraderAccount.balance || 0,
      leverage: cTraderAccount.leverage || 100,
      marginLevel: cTraderAccount.marginLevel || 0,
      tradeAllowed: cTraderAccount.tradeAllowed !== false,
      investorMode: false,
      platform: 'ctrader'
    };
  }

  /**
   * Convert cTrader order to MetaAPI format
   */
  async mapOrder(cTraderOrder) {
    await this.ensureInitialized();

    const symbolInfo = this.reverseSymbolMapping[cTraderOrder.symbolId] || {};
    const mt5Symbol = symbolInfo.mt5Symbol || `UNKNOWN_${cTraderOrder.symbolId}`;

    // Volume conversion
    const volume = (cTraderOrder.volume || 0) / 100;

    // Map cTrader order type to MetaAPI
    const orderTypeMap = {
      1: 'ORDER_TYPE_BUY',      // MARKET
      2: 'ORDER_TYPE_BUY_LIMIT', // LIMIT
      3: 'ORDER_TYPE_BUY_STOP',  // STOP
      4: 'ORDER_TYPE_SELL',      // For SL/TP
      5: 'ORDER_TYPE_BUY',       // MARKET_RANGE
      6: 'ORDER_TYPE_BUY_STOP'   // STOP_LIMIT
    };

    let orderType = orderTypeMap[cTraderOrder.orderType] || 'ORDER_TYPE_BUY';
    if (cTraderOrder.tradeSide === 'SELL') {
      orderType = orderType.replace('BUY', 'SELL');
    }

    return {
      id: cTraderOrder.orderId?.toString() || '',
      type: orderType,
      state: this.mapOrderState(cTraderOrder.orderStatus || 'PENDING'),
      symbol: mt5Symbol,
      magic: cTraderOrder.label ? parseInt(cTraderOrder.label) || 0 : 0,
      openPrice: cTraderOrder.limitPrice || cTraderOrder.stopPrice || 0,
      currentPrice: cTraderOrder.executionPrice || 0,
      volume: volume,
      currentVolume: volume,
      comment: cTraderOrder.comment || '',
      clientId: cTraderOrder.label || '',
      updateTime: new Date(cTraderOrder.utcLastUpdateTimestamp || Date.now()).toISOString(),
      openTime: new Date(cTraderOrder.utcTimestamp || Date.now()).toISOString()
    };
  }

  /**
   * Map cTrader order status to MetaAPI state
   */
  mapOrderState(cTraderStatus) {
    const stateMap = {
      'PENDING': 'ORDER_STATE_PLACED',
      'ACCEPTED': 'ORDER_STATE_PLACED',
      'FILLED': 'ORDER_STATE_FILLED',
      'CANCELLED': 'ORDER_STATE_CANCELED',
      'EXPIRED': 'ORDER_STATE_EXPIRED',
      'REJECTED': 'ORDER_STATE_REJECTED'
    };
    return stateMap[cTraderStatus] || 'ORDER_STATE_PLACED';
  }

  /**
   * Convert cTrader symbol info to MetaAPI format
   */
  async mapSymbolInfo(cTraderSymbol, mt5Symbol) {
    await this.ensureInitialized();

    return {
      symbol: mt5Symbol,
      tickSize: cTraderSymbol.tickSize || 0.00001,
      minVolume: (cTraderSymbol.minVolume || 100) / 100,
      maxVolume: (cTraderSymbol.maxVolume || 10000000) / 100,
      volumeStep: (cTraderSymbol.volumeStep || 100) / 100,
      contractSize: cTraderSymbol.contractSize || 100000,
      pipPosition: cTraderSymbol.pipPosition || 4,
      spreadFloating: true,
      bid: cTraderSymbol.bid || 0,
      ask: cTraderSymbol.ask || 0,
      profitCurrency: cTraderSymbol.quoteCurrency || 'USD'
    };
  }

  /**
   * Convert cTrader execution event to MetaAPI trade format
   */
  async mapExecutionEvent(executionEvent) {
    await this.ensureInitialized();

    const symbolInfo = this.reverseSymbolMapping[executionEvent.symbolId] || {};
    const mt5Symbol = symbolInfo.mt5Symbol || `UNKNOWN_${executionEvent.symbolId}`;

    return {
      id: executionEvent.executionId?.toString() || '',
      type: `DEAL_TYPE_${executionEvent.tradeSide || 'BUY'}`,
      symbol: mt5Symbol,
      magic: executionEvent.label ? parseInt(executionEvent.label) || 0 : 0,
      orderId: executionEvent.orderId?.toString() || '',
      positionId: executionEvent.positionId?.toString() || '',
      volume: (executionEvent.volume || 0) / 100,
      price: executionEvent.executionPrice || 0,
      commission: executionEvent.commission || 0,
      swap: executionEvent.swap || 0,
      profit: executionEvent.profit || 0,
      time: new Date(executionEvent.utcTimestamp || Date.now()).toISOString(),
      clientId: executionEvent.label || '',
      comment: executionEvent.comment || ''
    };
  }

  /**
   * Map price/quote data from cTrader to MetaAPI format
   */
  async mapPriceData(symbolId, bid, ask) {
    await this.ensureInitialized();

    const symbolInfo = this.reverseSymbolMapping[symbolId] || {};
    const mt5Symbol = symbolInfo.mt5Symbol || `UNKNOWN_${symbolId}`;

    return {
      symbol: mt5Symbol,
      bid: bid || 0,
      ask: ask || 0,
      brokerTime: new Date().toISOString(),
      spread: Math.abs((ask || 0) - (bid || 0)),
      profitTickValue: symbolInfo.tickValue || 1,
      lossTickValue: symbolInfo.tickValue || 1
    };
  }

  /**
   * Get symbol mapping for MT5 symbol
   */
  async getSymbolMapping(mt5Symbol) {
    await this.ensureInitialized();
    return this.symbolMapping[mt5Symbol];
  }

  /**
   * Get all available MT5 symbols
   */
  async getAllSymbols() {
    await this.ensureInitialized();
    return Object.keys(this.symbolMapping);
  }
}

// Export singleton instance
export default new CTraderDataMapper();