import MetaApi from 'metaapi.cloud-sdk';
import { logger } from '../utils/logger.js';
import { encrypt, decrypt } from '../utils/crypto.js';

class MetaApiService {
  constructor() {
    this.token = process.env.METAAPI_TOKEN;
    this.domain = process.env.METAAPI_DOMAIN || 'mt-client-api-v1.london.agiliumtrade.ai';
    this.api = null;
    this.provisioningApi = null;
  }

  async initialize() {
    try {
      this.api = new MetaApi(this.token, {
        domain: this.domain,
        requestTimeout: 60000,
        retryOpts: {
          retries: 3,
          minDelayInSeconds: 1,
          maxDelayInSeconds: 30
        }
      });
      
      this.provisioningApi = this.api.provisioningApi;
      logger.info('MetaApi service initialized');
    } catch (error) {
      logger.error('Failed to initialize MetaApi:', error);
      throw error;
    }
  }

  async addAccount(userId, accountData) {
    try {
      const { name, login, password, server, platform = 'mt4' } = accountData;
      
      // Encrypt investor password before storing
      const encryptedPassword = encrypt(password);
      
      // Create account in MetaApi
      const account = await this.provisioningApi.createAccount({
        name: `${name} (${userId})`,
        type: 'cloud',
        login: login,
        password: password, // MetaApi handles this securely
        server: server,
        platform: platform,
        magic: Math.floor(Math.random() * 1000000), // Random magic number
        quoteStreamingIntervalInSeconds: 2.5,
        tags: [`user:${userId}`, 'fxtrueup']
      });

      // Deploy account
      await account.deploy();
      await account.waitDeployed();

      return {
        accountId: account.id,
        state: account.state,
        platform: platform,
        encryptedPassword // Store this in Firestore
      };
    } catch (error) {
      logger.error('Failed to add MetaApi account:', error);
      throw new Error(`Failed to add account: ${error.message}`);
    }
  }

  async getAccountMetrics(accountId, startTime, endTime) {
    try {
      const account = await this.api.metatraderAccountApi.getAccount(accountId);
      const connection = await account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();

      const historyApi = connection.historyStorage;
      const terminalState = connection.terminalState;

      // Get account information
      const accountInfo = terminalState.accountInformation;
      
      // Get deals (closed trades) within time range
      const deals = await historyApi.deals
        .filter(deal => {
          const dealTime = new Date(deal.time);
          return dealTime >= startTime && dealTime <= endTime;
        })
        .sort((a, b) => new Date(a.time) - new Date(b.time));

      // Get current open positions
      const positions = terminalState.positions;

      // Calculate metrics
      const metrics = this.calculateMetrics(accountInfo, deals, positions);

      return {
        accountInfo,
        deals,
        positions,
        metrics,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get metrics for account ${accountId}:`, error);
      throw error;
    }
  }

  calculateMetrics(accountInfo, deals, positions) {
    const metrics = {
      balance: accountInfo.balance || 0,
      equity: accountInfo.equity || 0,
      margin: accountInfo.margin || 0,
      freeMargin: accountInfo.freeMargin || 0,
      marginLevel: accountInfo.marginLevel || 0,
      totalTrades: deals.length,
      openPositions: positions.length,
      profit: 0,
      loss: 0,
      winRate: 0,
      profitFactor: 0,
      averageWin: 0,
      averageLoss: 0,
      maxDrawdown: 0,
      totalCommission: 0,
      totalSwap: 0
    };

    let wins = 0;
    let losses = 0;
    let totalWinAmount = 0;
    let totalLossAmount = 0;
    let peak = accountInfo.balance;
    let drawdown = 0;

    deals.forEach(deal => {
      const profit = deal.profit || 0;
      const commission = deal.commission || 0;
      const swap = deal.swap || 0;
      const netProfit = profit + commission + swap;

      metrics.totalCommission += commission;
      metrics.totalSwap += swap;

      if (netProfit > 0) {
        wins++;
        totalWinAmount += netProfit;
        metrics.profit += netProfit;
      } else if (netProfit < 0) {
        losses++;
        totalLossAmount += Math.abs(netProfit);
        metrics.loss += Math.abs(netProfit);
      }

      // Calculate drawdown
      const runningBalance = accountInfo.balance - metrics.loss + metrics.profit;
      if (runningBalance > peak) {
        peak = runningBalance;
      }
      const currentDrawdown = (peak - runningBalance) / peak * 100;
      if (currentDrawdown > drawdown) {
        drawdown = currentDrawdown;
      }
    });

    metrics.winRate = metrics.totalTrades > 0 ? (wins / metrics.totalTrades) * 100 : 0;
    metrics.averageWin = wins > 0 ? totalWinAmount / wins : 0;
    metrics.averageLoss = losses > 0 ? totalLossAmount / losses : 0;
    metrics.profitFactor = metrics.loss > 0 ? metrics.profit / metrics.loss : metrics.profit > 0 ? Infinity : 0;
    metrics.maxDrawdown = drawdown;

    return metrics;
  }

  async removeAccount(accountId) {
    try {
      const account = await this.api.metatraderAccountApi.getAccount(accountId);
      await account.undeploy();
      await account.remove();
      logger.info(`Account ${accountId} removed successfully`);
    } catch (error) {
      logger.error(`Failed to remove account ${accountId}:`, error);
      throw error;
    }
  }

  async getAccountConnectionStatus(accountId) {
    try {
      const account = await this.api.metatraderAccountApi.getAccount(accountId);
      return {
        state: account.state,
        connectionStatus: account.connectionStatus,
        synchronizationStatus: account.synchronizationStatus
      };
    } catch (error) {
      logger.error(`Failed to get connection status for ${accountId}:`, error);
      throw error;
    }
  }
}

export default new MetaApiService();