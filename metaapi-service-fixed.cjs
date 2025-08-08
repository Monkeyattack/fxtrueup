const MetaApi = require('metaapi.cloud-sdk').default;

class MetaApiService {
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
        domain: 'agiliumtrade.agiliumtrade.ai'
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
      console.error('Failed to get account ' + accountId + ':', error.message);
      return null;
    }
  }

  async getAccountMetrics(accountId) {
    try {
      const account = await this.getAccount(accountId);
      if (\!account) return null;
      
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      const terminalState = connection.terminalState;
      const accountInfo = terminalState.accountInformation;
      const positions = terminalState.positions || [];
      
      await connection.close();
      
      if (accountInfo) {
        return {
          balance: accountInfo.balance,
          equity: accountInfo.equity,
          profit: accountInfo.profit || 0,
          totalDeals: 0,
          winRate: 0,
          profitFactor: 0,
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
      console.error('Failed to get metrics for ' + accountId + ':', error.message);
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
      
      return positions;
    } catch (error) {
      console.error('Failed to get positions for ' + accountId + ':', error.message);
      return [];
    }
  }

  async getDeals(accountId, startTime, endTime) {
    try {
      const account = await this.getAccount(accountId);
      if (\!account) return [];
      
      console.log('Getting deals for account:', accountId);
      
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      // Get deals from history storage
      const historyStorage = connection.historyStorage;
      const deals = historyStorage.deals || [];
      
      console.log('Found ' + deals.length + ' total deals in history');
      
      await connection.close();
      
      // Filter for actual trading deals (exclude balance operations)
      const tradingDeals = deals.filter(deal => 
        deal.type === 'DEAL_TYPE_BUY' || 
        deal.type === 'DEAL_TYPE_SELL'
      );
      
      console.log('Returning ' + tradingDeals.length + ' trading deals');
      
      // Return in the format expected by the frontend
      return tradingDeals.map(deal => ({
        id: deal.id,
        time: deal.time,
        symbol: deal.symbol,
        type: deal.type,
        volume: deal.volume,
        price: deal.price,
        commission: deal.commission || 0,
        swap: deal.swap || 0,
        profit: deal.profit || 0,
        comment: deal.comment || deal.brokerComment || ''
      }));
      
    } catch (error) {
      console.error('Failed to get deals for ' + accountId + ':', error.message);
      return [];
    }
  }
}

module.exports = MetaApiService;
