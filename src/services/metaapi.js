// Import the Node.js specific distribution to avoid browser-specific code
import MetaApi from 'metaapi.cloud-sdk/esm-node';
import poolClient from './poolClient.js';
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
      // Use pool client to get metrics from MetaStats
      const metrics = await poolClient.getAccountMetrics(accountId);
      
      // Get account info and positions from pool
      const accountInfo = await poolClient.getAccountInfo(accountId);
      const positions = await poolClient.getOpenTrades(accountId);
      
      // Get trade history if time range is specified
      let trades = [];
      if (startTime && endTime) {
        const days = Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));
        const tradeHistory = await poolClient.getTradeHistory(accountId, days);
        trades = tradeHistory.trades || [];
      }

      return {
        accountInfo,
        deals: trades,
        positions: positions.open_trades || [],
        metrics: {
          balance: metrics.balance || 0,
          equity: metrics.equity || 0,
          margin: metrics.margin || 0,
          freeMargin: metrics.freeMargin || 0,
          marginLevel: metrics.marginLevel || 0,
          totalTrades: metrics.trades || 0,
          openPositions: positions.count || 0,
          profit: metrics.profit || 0,
          winRate: metrics.winRate || 0,
          profitFactor: metrics.profitFactor || 0,
          averageWin: metrics.averageWin || 0,
          averageLoss: metrics.averageLoss || 0,
          maxDrawdown: metrics.maxDrawdownPercent || 0,
          expectancy: metrics.expectancy || 0,
          sharpeRatio: metrics.sharpeRatio || 0,
          sortinoRatio: metrics.sortinoRatio || 0,
          calmarRatio: metrics.calmarRatio || 0
        },
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

  async getDailyGrowth(accountId, days = 30) {
    try {
      const growthData = await poolClient.getDailyGrowth(accountId, days);
      return growthData;
    } catch (error) {
      logger.error(`Failed to get daily growth for ${accountId}:`, error);
      throw error;
    }
  }

  async getRiskStatus(accountId) {
    try {
      const riskStatus = await poolClient.getRiskStatus(accountId);
      return riskStatus;
    } catch (error) {
      logger.error(`Failed to get risk status for ${accountId}:`, error);
      throw error;
    }
  }

  async getSymbolStatistics(accountId, symbol) {
    try {
      const stats = await poolClient.getSymbolStats(accountId, symbol);
      return stats;
    } catch (error) {
      logger.error(`Failed to get symbol statistics for ${symbol}:`, error);
      throw error;
    }
  }

  async getAccountConnectionStatus(accountId) {
    try {
      // Get account info from pool which includes connection status
      const accountInfo = await poolClient.getAccountInfo(accountId);
      const poolStats = await poolClient.getPoolStats();
      
      return {
        state: accountInfo ? 'DEPLOYED' : 'UNDEPLOYED',
        connectionStatus: accountInfo ? 'CONNECTED' : 'DISCONNECTED',
        synchronizationStatus: accountInfo ? 'SYNCHRONIZED' : 'NOT_SYNCHRONIZED',
        poolStatus: poolStats
      };
    } catch (error) {
      logger.error(`Failed to get connection status for ${accountId}:`, error);
      throw error;
    }
  }
}

export default new MetaApiService();