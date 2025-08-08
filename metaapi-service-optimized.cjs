const MetaApi = require('metaapi.cloud-sdk').default;
const cache = require('./sqlite-cache-optimized.cjs');
const EventEmitter = require('events');

/**
 * Optimized MetaApi Service with advanced caching, connection pooling,
 * and performance monitoring for cost reduction and speed improvements.
 */
class OptimizedMetaApiService extends EventEmitter {
  constructor() {
    super();
    this.api = null;
    this.token = process.env.METAAPI_TOKEN;
    this.region = process.env.METAAPI_REGION || 'new-york';
    this.accountApi = null;
    this.connected = false;
    
    // Connection pool for managing account connections
    this.connectionPool = new Map();
    this.connectionTimeout = 30000; // 30 seconds
    this.maxConnections = 10;
    
    // Performance metrics
    this.metrics = {
      apiCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      connectionReuses: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      lastReset: Date.now()
    };
    
    // Background refresh configuration
    this.backgroundRefresh = {
      enabled: true,
      interval: 5 * 60 * 1000, // 5 minutes
      timer: null
    };
    
    if (!this.token) {
      console.error('❌ METAAPI_TOKEN not found in environment variables');
      return;
    }
    
    this.initialize();
    this.startCacheCleanup();
    this.startBackgroundRefresh();
    this.startMetricsReset();
  }

  async initialize() {
    try {
      console.log('🔧 Initializing Optimized MetaApi service...');
      this.api = new MetaApi(this.token, {
        region: this.region,
        domain: 'agiliumtrade.agiliumtrade.ai',
        requestTimeout: 60000,
        retryOpts: {
          retries: 2,
          minDelayInSeconds: 1,
          maxDelayInSeconds: 10
        }
      });
      
      this.accountApi = this.api.metatraderAccountApi;
      this.connected = true;
      
      console.log('✅ Optimized MetaApi service initialized successfully');
      this.emit('initialized');
    } catch (error) {
      console.error('❌ Failed to initialize MetaApi:', error.message);
      this.connected = false;
    }
  }

  /**
   * Get or create a connection from the pool
   */
  async getConnection(accountId) {
    const startTime = Date.now();
    
    try {
      // Check if connection exists and is valid
      if (this.connectionPool.has(accountId)) {
        const pooledConnection = this.connectionPool.get(accountId);
        
        if (pooledConnection.isConnected && pooledConnection.isSynchronized()) {
          this.metrics.connectionReuses++;
          return pooledConnection.connection;
        } else {
          // Remove stale connection
          this.connectionPool.delete(accountId);
        }
      }
      
      // Create new connection if pool limit not reached
      if (this.connectionPool.size >= this.maxConnections) {
        // Remove oldest connection
        const oldestKey = this.connectionPool.keys().next().value;
        const oldestConnection = this.connectionPool.get(oldestKey);
        try {
          await oldestConnection.connection.close();
        } catch (e) { /* ignore */ }
        this.connectionPool.delete(oldestKey);
      }
      
      const account = await this.accountApi.getAccount(accountId);
      const connection = account.getStreamingConnection();
      
      // Connect with timeout
      await Promise.race([
        connection.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), this.connectionTimeout)
        )
      ]);
      
      await connection.waitSynchronized({ timeoutInSeconds: 30 });
      
      // Store in pool
      this.connectionPool.set(accountId, {
        connection,
        lastUsed: Date.now(),
        isConnected: true
      });
      
      this.metrics.apiCalls++;
      return connection;
      
    } catch (error) {
      console.error(`Failed to get connection for ${accountId}:`, error.message);
      throw error;
    } finally {
      this.updateResponseTime(Date.now() - startTime);
    }
  }

  /**
   * Batch request for all account data to reduce API calls
   */
  async getBatchAccountData(accountId, options = {}) {
    const {
      includeMetrics = true,
      includePositions = true,
      includeDeals = true,
      useCache = true
    } = options;
    
    this.metrics.totalRequests++;
    const startTime = Date.now();
    
    try {
      // Check cache first if enabled
      if (useCache) {
        const cachedBatch = await cache.getBatch(accountId);
        if (cachedBatch) {
          this.metrics.cacheHits++;
          return cachedBatch;
        }
      }
      
      this.metrics.cacheMisses++;
      console.log(`🚀 Fetching batch data for account ${accountId}`);
      
      const connection = await this.getConnection(accountId);
      const terminalState = connection.terminalState;
      const historyStorage = connection.historyStorage;
      
      const results = {};
      
      // Get metrics
      if (includeMetrics) {
        const accountInfo = terminalState.accountInformation;
        const positions = terminalState.positions || [];
        
        if (accountInfo) {
          results.metrics = {
            balance: accountInfo.balance,
            equity: accountInfo.equity,
            profit: accountInfo.profit || 0,
            margin: accountInfo.margin || 0,
            freeMargin: accountInfo.freeMargin || 0,
            marginLevel: accountInfo.marginLevel || 0,
            leverage: accountInfo.leverage || 0,
            currency: accountInfo.currency,
            openPositions: positions.length,
            lastUpdated: new Date().toISOString()
          };
        }
      }
      
      // Get positions
      if (includePositions) {
        results.positions = terminalState.positions || [];
      }
      
      // Get deals
      if (includeDeals) {
        const deals = historyStorage.deals || [];
        const tradingDeals = deals.filter(deal => 
          deal.type === 'DEAL_TYPE_BUY' || deal.type === 'DEAL_TYPE_SELL'
        );
        
        results.deals = tradingDeals.map(deal => ({
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
        
        // Store deals locally for future reference
        if (results.deals.length > 0) {
          await cache.storeDeals(accountId, results.deals);
        }
      }
      
      // Cache the batch results
      if (useCache) {
        await cache.setBatch(accountId, results, 15 * 60 * 1000); // 15 minutes
      }
      
      // Store snapshot for historical tracking
      if (results.metrics) {
        await cache.storeSnapshot(
          accountId, 
          results.metrics.balance, 
          results.metrics.equity, 
          results.metrics.profit
        );
      }
      
      console.log(`✅ Batch data retrieved for ${accountId}`);
      return results;
      
    } catch (error) {
      console.error(`Failed to get batch data for ${accountId}:`, error.message);
      
      // Try to return cached data on error
      const fallbackData = await cache.getBatch(accountId, true); // ignore expiration
      if (fallbackData) {
        console.log('⚠️ Returning cached fallback data');
        return fallbackData;
      }
      
      throw error;
    } finally {
      this.updateResponseTime(Date.now() - startTime);
    }
  }

  /**
   * Legacy methods for backward compatibility (now use batch internally)
   */
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
      const batchData = await this.getBatchAccountData(accountId, {
        includeMetrics: true,
        includePositions: false,
        includeDeals: false
      });
      
      return batchData.metrics;
    } catch (error) {
      console.error(`Failed to get metrics for ${accountId}:`, error.message);
      return null;
    }
  }

  async getPositions(accountId) {
    try {
      const batchData = await this.getBatchAccountData(accountId, {
        includeMetrics: false,
        includePositions: true,
        includeDeals: false
      });
      
      return batchData.positions || [];
    } catch (error) {
      console.error(`Failed to get positions for ${accountId}:`, error.message);
      return [];
    }
  }

  async getDeals(accountId, startTime, endTime) {
    try {
      const batchData = await this.getBatchAccountData(accountId, {
        includeMetrics: false,
        includePositions: false,
        includeDeals: true
      });
      
      return batchData.deals || [];
    } catch (error) {
      console.error(`Failed to get deals for ${accountId}:`, error.message);
      return [];
    }
  }

  /**
   * Warm up cache for specified accounts in background
   */
  async warmupCache(accountIds) {
    console.log(`🔥 Warming up cache for ${accountIds.length} accounts...`);
    
    const promises = accountIds.map(async (accountId) => {
      try {
        await this.getBatchAccountData(accountId, { useCache: false });
        console.log(`✅ Cache warmed for account ${accountId}`);
      } catch (error) {
        console.error(`❌ Failed to warm cache for account ${accountId}:`, error.message);
      }
    });
    
    await Promise.allSettled(promises);
    console.log('🔥 Cache warmup completed');
  }

  /**
   * Start background refresh for active accounts
   */
  startBackgroundRefresh() {
    if (!this.backgroundRefresh.enabled) return;
    
    this.backgroundRefresh.timer = setInterval(async () => {
      try {
        const activeAccounts = await cache.getActiveAccounts();
        if (activeAccounts.length > 0) {
          console.log(`🔄 Background refreshing ${activeAccounts.length} active accounts...`);
          await this.warmupCache(activeAccounts);
        }
      } catch (error) {
        console.error('Background refresh error:', error);
      }
    }, this.backgroundRefresh.interval);
    
    console.log(`🔄 Background refresh started (interval: ${this.backgroundRefresh.interval / 1000}s)`);
  }

  /**
   * Force refresh account data (bypass cache)
   */
  async forceRefresh(accountId) {
    console.log(`🔄 Force refreshing data for account ${accountId}`);
    
    try {
      // Clear cache first
      await cache.clearAccount(accountId);
      
      // Get fresh data
      const batchData = await this.getBatchAccountData(accountId, { useCache: false });
      
      console.log(`✅ Force refresh completed for ${accountId}`);
      return batchData;
    } catch (error) {
      console.error('Failed to force refresh:', error.message);
      return null;
    }
  }

  /**
   * Get performance metrics and cache statistics
   */
  async getPerformanceMetrics() {
    const cacheStats = await cache.getStatistics();
    const uptime = Date.now() - this.metrics.lastReset;
    
    return {
      ...this.metrics,
      uptime,
      cacheHitRate: this.metrics.totalRequests > 0 
        ? ((this.metrics.cacheHits / this.metrics.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      activeConnections: this.connectionPool.size,
      cache: cacheStats,
      costSavings: {
        estimatedApiCallsSaved: this.metrics.cacheHits,
        estimatedCostSaved: (this.metrics.cacheHits * 0.02).toFixed(2) + ' USD' // Estimate $0.02 per API call
      }
    };
  }

  /**
   * Clean up expired connections and cache
   */
  startCacheCleanup() {
    // Clean expired cache every hour
    setInterval(async () => {
      await cache.clearExpired();
      this.cleanupConnections();
    }, 60 * 60 * 1000);
  }

  /**
   * Clean up stale connections
   */
  cleanupConnections() {
    const now = Date.now();
    const staleTimeout = 30 * 60 * 1000; // 30 minutes
    
    for (const [accountId, connectionData] of this.connectionPool.entries()) {
      if (now - connectionData.lastUsed > staleTimeout) {
        try {
          connectionData.connection.close();
        } catch (e) { /* ignore */ }
        this.connectionPool.delete(accountId);
        console.log(`🗑️ Cleaned up stale connection for ${accountId}`);
      }
    }
  }

  /**
   * Update response time metrics
   */
  updateResponseTime(responseTime) {
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.totalRequests - 1) + responseTime) / 
      this.metrics.totalRequests;
  }

  /**
   * Reset metrics periodically
   */
  startMetricsReset() {
    setInterval(() => {
      console.log('📊 Metrics reset - Performance summary:', {
        totalRequests: this.metrics.totalRequests,
        cacheHitRate: this.metrics.totalRequests > 0 ? ((this.metrics.cacheHits / this.metrics.totalRequests) * 100).toFixed(1) + '%' : '0%',
        avgResponseTime: this.metrics.avgResponseTime.toFixed(0) + 'ms'
      });
      
      this.metrics = {
        apiCalls: 0,
        cacheHits: 0,
        cacheMisses: 0,
        connectionReuses: 0,
        totalRequests: 0,
        avgResponseTime: 0,
        lastReset: Date.now()
      };
    }, 24 * 60 * 60 * 1000); // Daily reset
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down MetaApi service...');
    
    // Clear background refresh timer
    if (this.backgroundRefresh.timer) {
      clearInterval(this.backgroundRefresh.timer);
    }
    
    // Close all connections
    for (const [accountId, connectionData] of this.connectionPool.entries()) {
      try {
        await connectionData.connection.close();
        console.log(`🔌 Closed connection for ${accountId}`);
      } catch (error) {
        console.error(`Error closing connection for ${accountId}:`, error);
      }
    }
    
    this.connectionPool.clear();
    console.log('✅ MetaApi service shutdown complete');
  }
}

module.exports = OptimizedMetaApiService;