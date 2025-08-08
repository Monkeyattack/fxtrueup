import MetaApi from 'metaapi.cloud-sdk';

// MetaApi Service Class
class MetaApiService {
  constructor() {
    this.token = process.env.METAAPI_TOKEN;
    this.region = process.env.METAAPI_REGION || 'new-york';
    this.api = null;
    this.initialized = false;
    this.accountCache = new Map(); // Cache for MetaApi account objects
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      this.api = new MetaApi(this.token, {
        region: this.region,
        requestTimeout: 60000
      });
      this.initialized = true;
      console.log('✅ MetaApi initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize MetaApi:', error);
      throw error;
    }
  }

  async createProvisioningProfile(account) {
    await this.initialize();
    
    try {
      // Check if provisioning profile already exists for this broker/server combo
      const profiles = await this.api.provisioningProfileApi.getProvisioningProfiles();
      const existingProfile = profiles.find(p => 
        p.name.toLowerCase().includes(account.brokerName?.toLowerCase() || account.serverName?.toLowerCase())
      );
      
      if (existingProfile) {
        console.log(`📋 Using existing provisioning profile: ${existingProfile.name}`);
        return existingProfile._id;
      }

      // Create new provisioning profile
      const profileName = `${account.brokerName || account.serverName}-${Date.now()}`;
      const profile = await this.api.provisioningProfileApi.createProvisioningProfile({
        name: profileName,
        version: account.accountType.toUpperCase() === 'MT5' ? 5 : 4,
        brokerTimezone: 'EET',
        brokerDSTSwitchTimezone: 'EET'
      });
      
      console.log(`✅ Created provisioning profile: ${profileName}`);
      return profile.id;
    } catch (error) {
      console.error('❌ Failed to create provisioning profile:', error);
      throw error;
    }
  }

  async deployAccount(accountData) {
    await this.initialize();
    
    try {
      // Create provisioning profile first
      const provisioningProfileId = await this.createProvisioningProfile(accountData);
      
      // Create MetaTrader account
      const metaAccount = await this.api.metatraderAccountApi.createAccount({
        name: accountData.accountName,
        type: 'cloud',
        login: accountData.login,
        password: accountData.password,
        server: accountData.serverName,
        provisioningProfileId: provisioningProfileId,
        magic: parseInt(accountData.magic) || 0,
        application: 'MetaApi',
        connectionStatus: 'connected'
      });

      console.log(`✅ Deployed account ${accountData.accountName} to MetaApi: ${metaAccount.id}`);
      
      // Wait for deployment
      await metaAccount.waitDeployed();
      console.log(`🚀 Account ${accountData.accountName} deployed successfully`);
      
      return {
        metaApiAccountId: metaAccount.id,
        provisioningProfileId: provisioningProfileId,
        state: metaAccount.state,
        connectionStatus: metaAccount.connectionStatus
      };
    } catch (error) {
      console.error('❌ Failed to deploy account to MetaApi:', error);
      throw error;
    }
  }

  async getAccountInfo(metaApiAccountId) {
    await this.initialize();
    
    try {
      let account = this.accountCache.get(metaApiAccountId);
      
      if (!account) {
        account = await this.api.metatraderAccountApi.getAccount(metaApiAccountId);
        this.accountCache.set(metaApiAccountId, account);
      }

      // Ensure account is connected
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
      const account = await this.api.metatraderAccountApi.getAccount(metaApiAccountId);
      
      if (account.state !== 'DEPLOYED') {
        console.log(`⏳ Account ${metaApiAccountId} not deployed for history`);
        return [];
      }

      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();

      // Get history for the last 30 days if no time range specified
      const end = endTime || new Date();
      const start = startTime || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

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
      const account = await this.api.metatraderAccountApi.getAccount(metaApiAccountId);
      
      if (account.state !== 'DEPLOYED') {
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
      drawdown: Math.max(0, accountInfo.balance - accountInfo.equity) // Simple drawdown calc
    };
  }
}

export default MetaApiService;