// ES Module wrapper for MetaApi service
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const MetaApi = require('metaapi.cloud-sdk').default;

export default class MetaApiService {
  constructor() {
    this.api = null;
    this.token = process.env.METAAPI_TOKEN;
    this.region = process.env.METAAPI_REGION || 'new-york';
    this.accountApi = null;
    this.connected = false;
    
    if (\!this.token) {
      console.error('❌ METAAPI_TOKEN not found in environment variables');
      return;
    }
    
    this.initialize();
  }

  async initialize() {
    try {
      console.log('🔧 Initializing MetaApi service...');
      this.api = new MetaApi(this.token, {
        region: this.region,
        domain: 'agiliumtrade.agiliumtrade.ai',
        requestTimeout: 60000,
        retryOpts: {
          retries: 5,
          minDelayInSeconds: 1,
          maxDelayInSeconds: 30
        }
      });
      
      this.accountApi = this.api.metatraderAccountApi;
      this.connected = true;
      console.log('✅ MetaApi service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize MetaApi:', error.message);
      this.connected = false;
    }
  }

  async getAccount(accountId) {
    if (\!this.connected || \!accountId) return null;
    
    try {
      const account = await this.accountApi.getAccount(accountId);
      return account;
    } catch (error) {
      console.error(\, error.message);
      return null;
    }
  }

  async getAccountMetrics(accountId) {
    try {
      const account = await this.getAccount(accountId);
      if (\!account) return null;
      
      // Create streaming connection for real-time data
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      // Get terminal state
      const terminalState = connection.terminalState;
      const accountInfo = terminalState.accountInformation;
      const positions = terminalState.positions || [];
      
      // Close connection after getting data
      await connection.close();
      
      if (accountInfo) {
        return {
          balance: accountInfo.balance,
          equity: accountInfo.equity,
          profit: accountInfo.profit || 0,
          totalDeals: 0, // Would need history API for this
          winRate: 0, // Would need to calculate from history
          profitFactor: 0, // Would need to calculate from history
          openPositions: positions.length,
          margin: accountInfo.margin || 0,
          freeMargin: accountInfo.freeMargin || 0,
          marginLevel: accountInfo.marginLevel || 0,
          leverage: accountInfo.leverage || 0,
          currency: accountInfo.currency
        };
      }
      
      return null;
    } catch (error) {
      console.error(\, error.message);
      return null;
    }
  }

  async getPositions(accountId) {
    try {
      const account = await this.getAccount(accountId);
      if (\!account) return [];
      
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      const positions = connection.terminalState.positions || [];
      
      await connection.close();
      
      return positions.map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        type: pos.type,
        volume: pos.volume,
        openPrice: pos.openPrice,
        currentPrice: pos.currentPrice,
        profit: pos.profit,
        swap: pos.swap,
        commission: pos.commission,
        time: pos.time,
        updateTime: pos.updateTime
      }));
    } catch (error) {
      console.error(\, error.message);
      return [];
    }
  }

  async getDeals(accountId, startTime, endTime) {
    try {
      const account = await this.getAccount(accountId);
      if (\!account) return [];
      
      const connection = account.getRPCConnection();
      await connection.connect();
      
      const deals = await connection.getHistoryOrdersByTimeRange(
        startTime || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endTime || new Date()
      );
      
      await connection.close();
      
      return deals.filter(deal => deal.type === 'DEAL_TYPE_BUY' || deal.type === 'DEAL_TYPE_SELL')
        .map(deal => ({
          id: deal.id,
          time: deal.time,
          symbol: deal.symbol,
          type: deal.type,
          volume: deal.volume,
          price: deal.price,
          commission: deal.commission,
          swap: deal.swap,
          profit: deal.profit
        }));
    } catch (error) {
      console.error(\, error.message);
      return [];
    }
  }
}
