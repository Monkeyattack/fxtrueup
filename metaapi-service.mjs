// MetaApi Service using ES modules
class MetaApiService {
  constructor() {
    this.token = process.env.METAAPI_TOKEN;
    this.region = process.env.METAAPI_REGION || 'new-york';
    this.api = null;
    this.initialized = false;
    this.accountCache = new Map();
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Use dynamic import for MetaApi SDK
      const { default: MetaApi } = await import('metaapi.cloud-sdk');
      this.api = new MetaApi(this.token, {
        region: this.region,
        requestTimeout: 60000
      });
      this.initialized = true;
      console.log('✅ MetaApi initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize MetaApi:', error.message);
      throw error;
    }
  }

  async getAccountInfo(metaApiAccountId) {
    await this.initialize();
    
    try {
      let account = this.accountCache.get(metaApiAccountId);
      
      if (!account) {
        const accounts = await this.api._metatraderAccountApi.getAccountsWithClassicPagination();
        const accountsArray = Array.isArray(accounts) ? accounts : [accounts];
        account = accountsArray.find(acc => acc.id === metaApiAccountId);
        
        if (!account) {
          console.log(`⚠️  Account ${metaApiAccountId} not found in MetaApi`);
          return null;
        }
        
        this.accountCache.set(metaApiAccountId, account);
      }

      // Check if account is deployed and connected
      if (account.state !== 'DEPLOYED') {
        console.log(`⏳ Account ${metaApiAccountId} not deployed, current state: ${account.state}`);
        return null;
      }

      // Get connection and account info
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();
      
      const accountInfo = await connection.getAccountInformation();
      
      return {
        balance: accountInfo.balance || 0,
        equity: accountInfo.equity || 0,
        margin: accountInfo.margin || 0,
        freeMargin: accountInfo.freeMargin || 0,
        marginLevel: accountInfo.marginLevel || 0,
        profit: accountInfo.profit || 0,
        credit: accountInfo.credit || 0,
        leverage: accountInfo.leverage || 1,
        currency: accountInfo.currency || 'USD',
        name: accountInfo.name || '',
        server: accountInfo.server || '',
        tradeAllowed: accountInfo.tradeAllowed || false
      };
    } catch (error) {
      console.error(`❌ Failed to get account info for ${metaApiAccountId}:`, error.message);
      return null;
    }
  }

  async getDeals(metaApiAccountId, startTime = null, endTime = null) {
    await this.initialize();
    
    try {
      const accounts = await this.api._metatraderAccountApi.getAccountsWithClassicPagination();
      const accountsArray = Array.isArray(accounts) ? accounts : [accounts];
      const account = accountsArray.find(acc => acc.id === metaApiAccountId);
      
      if (!account || account.state !== 'DEPLOYED') {
        console.log(`⏳ Account ${metaApiAccountId} not deployed for history`);
        return [];
      }

      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();

      // Get history for the last 30 days if no time range specified
      const end = endTime || new Date();
      const start = startTime || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const deals = await connection.getDealHistory(start, end);
      
      return deals.map(deal => ({
        id: deal.id,
        time: deal.time,
        type: deal.type,
        symbol: deal.symbol,
        volume: deal.volume,
        price: deal.price,
        commission: deal.commission,
        swap: deal.swap,
        profit: deal.profit,
        comment: deal.comment,
        orderId: deal.orderId,
        positionId: deal.positionId
      }));
    } catch (error) {
      console.error(`❌ Failed to get deals for ${metaApiAccountId}:`, error.message);
      return [];
    }
  }

  async getPositions(metaApiAccountId) {
    await this.initialize();
    
    try {
      const accounts = await this.api._metatraderAccountApi.getAccountsWithClassicPagination();
      const accountsArray = Array.isArray(accounts) ? accounts : [accounts];
      const account = accountsArray.find(acc => acc.id === metaApiAccountId);
      
      if (!account || account.state !== 'DEPLOYED') {
        console.log(`⏳ Account ${metaApiAccountId} not deployed for positions`);
        return [];
      }

      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();

      const positions = await connection.getPositions();
      
      return positions.map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        type: pos.type,
        volume: pos.volume,
        openPrice: pos.openPrice,
        currentPrice: pos.currentPrice,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        profit: pos.profit,
        unrealizedProfit: pos.unrealizedProfit,
        swap: pos.swap,
        commission: pos.commission,
        comment: pos.comment,
        time: pos.time,
        updateTime: pos.updateTime
      }));
    } catch (error) {
      console.error(`❌ Failed to get positions for ${metaApiAccountId}:`, error.message);
      return [];
    }
  }

  async getAccountMetrics(metaApiAccountId) {
    const accountInfo = await this.getAccountInfo(metaApiAccountId);
    const deals = await this.getDeals(metaApiAccountId);
    const positions = await this.getPositions(metaApiAccountId);

    if (!accountInfo) {
      return null;
    }

    // Calculate additional metrics from deals
    const profitableDeals = deals.filter(d => d.profit > 0).length;
    const totalDeals = deals.filter(d => d.profit !== 0).length;
    const winRate = totalDeals > 0 ? (profitableDeals / totalDeals) * 100 : 0;

    const totalProfit = deals.reduce((sum, d) => sum + (d.profit || 0), 0);
    const totalLoss = deals.filter(d => d.profit < 0).reduce((sum, d) => sum + Math.abs(d.profit), 0);
    const totalWin = deals.filter(d => d.profit > 0).reduce((sum, d) => sum + d.profit, 0);
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : 0;

    return {
      ...accountInfo,
      totalDeals,
      winRate,
      profitFactor,
      totalProfit,
      openPositions: positions.length,
      drawdown: Math.max(0, accountInfo.balance - accountInfo.equity)
    };
  }
}

export default MetaApiService;