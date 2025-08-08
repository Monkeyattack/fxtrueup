const MetaApi = require('metaapi.cloud-sdk').default;
const cache = require('./sqlite-cache.cjs');

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
    this.startCacheCleanup();
  }

  async initialize() {
    try {
      console.log('🔧 Initializing MetaApi service with SQLite cache...');
      this.api = new MetaApi(this.token, {
        region: this.region,
        domain: 'agiliumtrade.agiliumtrade.ai'
      });
      
      this.accountApi = this.api.metatraderAccountApi;
      this.connected = true;
      console.log('✅ MetaApi service with SQLite cache initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize MetaApi:', error.message);
      this.connected = false;
    }
  }

  startCacheCleanup() {
    // Clean expired cache every hour
    setInterval(async () => {
      await cache.clearExpired();
    }, 60 * 60 * 1000);
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
      // Check SQLite cache first (30-minute cache for cost savings)
      const cached = await cache.get('metrics', accountId);
      if (cached) {
        console.log(`📦 Using cached metrics for ${accountId}`);
        return cached;
      }

      const account = await this.getAccount(accountId);
      if (!account) return null;
      
      console.log('💰 Fetching fresh metrics from MetaApi for:', accountId);
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      const terminalState = connection.terminalState;
      const accountInfo = terminalState.accountInformation;
      const positions = terminalState.positions || [];
      
      await connection.close();
      
      if (accountInfo) {
        const metrics = {
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
          currency: accountInfo.currency,
          lastUpdated: new Date().toISOString()
        };
        
        // Cache for 30 minutes to reduce API calls
        await cache.set('metrics', accountId, metrics, 30 * 60 * 1000);
        
        // Store account snapshot for historical tracking
        await cache.storeSnapshot(accountId, metrics.balance, metrics.equity, metrics.profit);
        
        return metrics;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get metrics for ' + accountId + ':', error.message);
      // Return cached data if available, even if expired
      const cached = await cache.get('metrics', accountId);
      if (cached) {
        console.log('⚠️ Returning cached metrics due to error');
        return cached;
      }
      return null;
    }
  }

  async getPositions(accountId) {
    try {
      // Check cache first (5-minute cache for positions as they change frequently)
      const cached = await cache.get('positions', accountId);
      if (cached) {
        return cached;
      }

      const account = await this.getAccount(accountId);
      if (!account) return [];
      
      console.log('📊 Fetching fresh positions from MetaApi for:', accountId);
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      const positions = connection.terminalState.positions || [];
      
      await connection.close();
      
      // Cache positions for 5 minutes (they change frequently)
      await cache.set('positions', accountId, positions, 5 * 60 * 1000);
      return positions;
    } catch (error) {
      console.error('Failed to get positions for ' + accountId + ':', error.message);
      // Return cached data if available
      const cached = await cache.get('positions', accountId);
      if (cached) {
        console.log('⚠️ Returning cached positions due to error');
        return cached;
      }
      return [];
    }
  }

  async getDeals(accountId, startTime, endTime) {
    try {
      // Get locally stored deals first
      const latestDealTime = await cache.getLatestDealTime(accountId);
      const storedDeals = await cache.getStoredDeals(accountId);
      
      // If we have recent deals, check if we need fresh data
      const needsFreshData = !latestDealTime || 
                           (Date.now() - new Date(latestDealTime).getTime()) > (30 * 60 * 1000); // 30 minutes

      if (storedDeals.length > 0 && !needsFreshData) {
        console.log(`📋 Using ${storedDeals.length} locally stored deals for ${accountId}`);
        return storedDeals;
      }

      const account = await this.getAccount(accountId);
      if (!account) {
        // Return stored deals if available, even if we can't connect
        if (storedDeals.length > 0) {
          console.log(`📋 Returning ${storedDeals.length} stored deals (connection failed)`);
          return storedDeals;
        }
        return [];
      }
      
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
      
      // Format deals for frontend
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
      
      // Store deals locally to avoid future API calls
      if (formattedDeals.length > 0) {
        await cache.storeDeals(accountId, formattedDeals);
      }
      
      // Merge with any existing stored deals (deduplicate by deal ID)
      const allDeals = [...formattedDeals];
      storedDeals.forEach(stored => {
        if (!allDeals.find(deal => deal.id === stored.id)) {
          allDeals.push(stored);
        }
      });
      
      // Sort by time descending
      allDeals.sort((a, b) => new Date(b.time) - new Date(a.time));
      
      console.log(`✅ Retrieved ${allDeals.length} total deals for ${accountId}`);
      return allDeals;
      
    } catch (error) {
      console.error('Failed to get deals for ' + accountId + ':', error.message);
      
      // Return stored deals if available
      const storedDeals = await cache.getStoredDeals(accountId);
      if (storedDeals.length > 0) {
        console.log(`⚠️ Returning ${storedDeals.length} stored deals due to error`);
        return storedDeals;
      }
      return [];
    }
  }

  /**
   * Force refresh account data (bypass cache)
   */
  async forceRefresh(accountId) {
    console.log(`🔄 Force refreshing data for account ${accountId}`);
    
    try {
      // Get fresh data
      const metrics = await this.getAccountMetrics(accountId);
      const positions = await this.getPositions(accountId);
      const deals = await this.getDeals(accountId);
      
      return { metrics, positions, deals };
    } catch (error) {
      console.error('Failed to force refresh:', error.message);
      return null;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    // This would need to be implemented in SQLiteCache
    return {
      message: 'Cache stats not implemented yet'
    };
  }
}

module.exports = MetaApiService;