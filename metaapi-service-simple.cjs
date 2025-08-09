const MetaApi = require('metaapi.cloud-sdk').default;
<<<<<<< Updated upstream
const cache = require('./cache-service.cjs');
=======
>>>>>>> Stashed changes

class MetaApiService {
  constructor() {
    this.api = null;
    this.token = process.env.METAAPI_TOKEN;
    this.region = process.env.METAAPI_REGION || 'new-york';
    this.accountApi = null;
    this.connected = false;
    
    if (!this.token) {
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
    if (!this.connected || !accountId) return null;
    
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
<<<<<<< Updated upstream
      // Check cache first
      const cached = cache.get('metrics', accountId);
      if (cached) {
        return cached;
      }

      const account = await this.getAccount(accountId);
      if (!account) return null;
      
      console.log('💰 Fetching fresh metrics from MetaApi for:', accountId);
=======
      const account = await this.getAccount(accountId);
      if (!account) return null;
      
>>>>>>> Stashed changes
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      const terminalState = connection.terminalState;
      const accountInfo = terminalState.accountInformation;
      const positions = terminalState.positions || [];
      
      await connection.close();
      
      if (accountInfo) {
<<<<<<< Updated upstream
        const metrics = {
=======
        return {
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        
        // Cache the result
        cache.set('metrics', accountId, metrics);
        return metrics;
=======
>>>>>>> Stashed changes
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get metrics for ' + accountId + ':', error.message);
<<<<<<< Updated upstream
      // Return cached data if available, even if expired
      const cached = cache.get('metrics', accountId);
      if (cached) {
        console.log('⚠️ Returning stale cache due to error');
        return cached;
      }
=======
>>>>>>> Stashed changes
      return null;
    }
  }

  async getPositions(accountId) {
    try {
<<<<<<< Updated upstream
      // Check cache first
      const cached = cache.get('positions', accountId);
      if (cached) {
        return cached;
      }

      const account = await this.getAccount(accountId);
      if (!account) return [];
      
      console.log('📊 Fetching fresh positions from MetaApi for:', accountId);
=======
      const account = await this.getAccount(accountId);
      if (!account) return [];
      
>>>>>>> Stashed changes
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      const positions = connection.terminalState.positions || [];
      
      await connection.close();
      
<<<<<<< Updated upstream
      // Cache the result
      cache.set('positions', accountId, positions);
      return positions;
    } catch (error) {
      console.error('Failed to get positions for ' + accountId + ':', error.message);
      // Return cached data if available, even if expired
      const cached = cache.get('positions', accountId);
      if (cached) {
        console.log('⚠️ Returning stale cache due to error');
        return cached;
      }
=======
      return positions;
    } catch (error) {
      console.error('Failed to get positions for ' + accountId + ':', error.message);
>>>>>>> Stashed changes
      return [];
    }
  }

  async getDeals(accountId, startTime, endTime) {
    try {
<<<<<<< Updated upstream
      // Check cache first
      const cached = cache.get('deals', accountId);
      if (cached) {
        return cached;
      }

      const account = await this.getAccount(accountId);
      if (!account) return [];
      
      console.log('📈 Fetching fresh deals from MetaApi for:', accountId);
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      // Get deals from history storage
      const historyStorage = connection.historyStorage;
      const deals = historyStorage.deals || [];
      
      await connection.close();
      
      // Filter for actual trading deals (exclude balance operations)
      const tradingDeals = deals.filter(deal => 
        deal.type === 'DEAL_TYPE_BUY' || 
        deal.type === 'DEAL_TYPE_SELL'
      );
      
      // Return in the format expected by the frontend
      const formattedDeals = tradingDeals.map(deal => ({
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
      
      // Cache the result
      cache.set('deals', accountId, formattedDeals);
      return formattedDeals;
      
    } catch (error) {
      console.error('Failed to get deals for ' + accountId + ':', error.message);
      // Return cached data if available, even if expired
      const cached = cache.get('deals', accountId);
      if (cached) {
        console.log('⚠️ Returning stale cache due to error');
        return cached;
      }
=======
      const account = await this.getAccount(accountId);
      if (!account) return [];
      
      const connection = account.getRPCConnection();
      await connection.connect();
      
      const deals = await connection.getHistoryOrdersByTimeRange(
        startTime || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endTime || new Date()
      );
      
      await connection.close();
      
      return deals.filter(deal => deal.type === 'DEAL_TYPE_BUY' || deal.type === 'DEAL_TYPE_SELL');
    } catch (error) {
      console.error('Failed to get deals for ' + accountId + ':', error.message);
>>>>>>> Stashed changes
      return [];
    }
  }
}

module.exports = MetaApiService;