import MetaApi from 'metaapi.cloud-sdk';
import dotenv from 'dotenv';

dotenv.config();

class MetaApiIntegration {
  constructor() {
    this.token = process.env.METAAPI_TOKEN;
    this.region = process.env.METAAPI_REGION || 'new-york';
    this.api = null;
    this.metatraderAccountApi = null;
    this.provisioningProfileApi = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      this.api = new MetaApi(this.token, {
        region: this.region,
        requestTimeout: 60000,
        retryOpts: {
          retries: 3,
          minDelayInSeconds: 1,
          maxDelayInSeconds: 30
        }
      });

      this.metatraderAccountApi = this.api.metatraderAccountApi;
      this.provisioningProfileApi = this.api.provisioningProfileApi;
      
      this.initialized = true;
      console.log('✅ MetaApi initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize MetaApi:', error.message);
      throw error;
    }
  }

  async createProvisioningProfile(brokerInfo) {
    await this.initialize();
    
    try {
      // Check if profile already exists
      const profiles = await this.provisioningProfileApi.getProvisioningProfiles();
      const existingProfile = profiles.find(p => 
        p.name === brokerInfo.name && p.version === brokerInfo.version
      );

      if (existingProfile) {
        console.log(`📋 Using existing provisioning profile: ${existingProfile._id}`);
        return existingProfile._id;
      }

      // Create new provisioning profile
      const profile = await this.provisioningProfileApi.createProvisioningProfile({
        name: brokerInfo.name,
        version: brokerInfo.version || 5,
        brokerTimezone: brokerInfo.timezone || 'EET',
        brokerDSTSwitchTimezone: brokerInfo.dstTimezone || 'America/New_York'
      });

      console.log(`📋 Created provisioning profile: ${profile.id}`);
      return profile.id;
    } catch (error) {
      console.error('❌ Failed to create provisioning profile:', error.message);
      throw error;
    }
  }

  async addTradingAccount(accountData) {
    await this.initialize();
    
    try {
      const {
        login,
        password,
        serverName,
        platform = 'mt5',
        brokerInfo = {},
        magic,
        baseCurrency,
        copyFactoryRoles,
        riskManagementApiEnabled = false,
        region
      } = accountData;

      // Create or get provisioning profile
      const provisioningProfileId = await this.createProvisioningProfile({
        name: brokerInfo.name || serverName,
        version: platform === 'mt4' ? 4 : 5,
        ...brokerInfo
      });

      // Add MetaTrader account
      const account = await this.metatraderAccountApi.createAccount({
        name: accountData.accountName || `${login}@${serverName}`,
        type: 'cloud',
        login: login.toString(),
        password: password,
        server: serverName,
        platform: platform,
        provisioningProfileId: provisioningProfileId,
        magic: magic,
        baseCurrency: baseCurrency,
        copyFactoryRoles: copyFactoryRoles ? [copyFactoryRoles] : [],
        riskManagementApiEnabled: riskManagementApiEnabled,
        region: region || this.region,
        reliability: 'high'
      });

      console.log(`✅ Added trading account: ${account.id}`);
      
      // Deploy account
      await this.deployAccount(account.id);
      
      return account;
    } catch (error) {
      console.error('❌ Failed to add trading account:', error.message);
      throw error;
    }
  }

  async deployAccount(accountId) {
    try {
      await this.metatraderAccountApi.deployAccount(accountId);
      console.log(`🚀 Deploying account: ${accountId}`);
      
      // Wait for deployment
      await this.waitForDeployment(accountId);
    } catch (error) {
      console.error('❌ Failed to deploy account:', error.message);
      throw error;
    }
  }

  async waitForDeployment(accountId, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
      const account = await this.metatraderAccountApi.getAccount(accountId);
      
      if (account.state === 'DEPLOYED') {
        console.log(`✅ Account deployed successfully: ${accountId}`);
        return account;
      } else if (account.state === 'DEPLOY_FAILED') {
        throw new Error(`Account deployment failed: ${account.stateDescription}`);
      }
      
      console.log(`⏳ Waiting for deployment... (${account.state})`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
    
    throw new Error('Account deployment timeout');
  }

  async getAccountInfo(accountId) {
    await this.initialize();
    
    try {
      const account = await this.metatraderAccountApi.getAccount(accountId);
      const connection = account.getStreamingConnection();
      await connection.connect();
      
      await connection.waitSynchronized();
      
      const accountInfo = connection.terminalState.accountInformation;
      const positions = connection.terminalState.positions;
      const orders = connection.terminalState.orders;
      
      return {
        account: accountInfo,
        positions: positions,
        orders: orders,
        balance: accountInfo.balance,
        equity: accountInfo.equity,
        margin: accountInfo.margin,
        freeMargin: accountInfo.freeMargin,
        marginLevel: accountInfo.marginLevel,
        profit: positions.reduce((sum, pos) => sum + pos.profit, 0)
      };
    } catch (error) {
      console.error('❌ Failed to get account info:', error.message);
      throw error;
    }
  }

  async removeAccount(accountId) {
    await this.initialize();
    
    try {
      // Undeploy first
      await this.metatraderAccountApi.undeployAccount(accountId);
      console.log(`📤 Undeploying account: ${accountId}`);
      
      // Wait for undeployment
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Remove account
      await this.metatraderAccountApi.removeAccount(accountId);
      console.log(`🗑️ Removed account: ${accountId}`);
    } catch (error) {
      console.error('❌ Failed to remove account:', error.message);
      throw error;
    }
  }

  async listAccounts() {
    await this.initialize();
    
    try {
      const accounts = await this.metatraderAccountApi.getAccounts();
      return accounts.map(account => ({
        id: account._id,
        name: account.name,
        login: account.login,
        server: account.server,
        platform: account.platform,
        state: account.state,
        connectionStatus: account.connectionStatus,
        region: account.region,
        reliability: account.reliability,
        baseCurrency: account.baseCurrency,
        balance: account.balance,
        equity: account.equity,
        margin: account.margin,
        freeMargin: account.freeMargin
      }));
    } catch (error) {
      console.error('❌ Failed to list accounts:', error.message);
      throw error;
    }
  }

  async testConnection() {
    await this.initialize();
    
    try {
      const accounts = await this.listAccounts();
      console.log(`✅ MetaApi connection successful. Found ${accounts.length} accounts.`);
      return true;
    } catch (error) {
      console.error('❌ MetaApi connection test failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
export default new MetaApiIntegration();