import axios from 'axios';
import { logger } from '../utils/logger.js';

class MyFxBookService {
  constructor() {
    this.baseUrl = 'https://www.myfxbook.com/api';
    this.sessions = new Map(); // Cache sessions by email
  }

  async login(email, password) {
    try {
      // Check if we have a valid session cached
      const cached = this.sessions.get(email);
      if (cached && cached.expires > Date.now()) {
        return cached.session;
      }

      const response = await axios.get(`${this.baseUrl}/login.json`, {
        params: { email, password }
      });

      if (response.data.error) {
        throw new Error(response.data.message || 'Login failed');
      }

      const session = response.data.session;
      
      // Cache session for 50 minutes (they expire in 1 hour)
      this.sessions.set(email, {
        session,
        expires: Date.now() + 50 * 60 * 1000
      });

      return session;
    } catch (error) {
      logger.error('MyFxBook login failed:', error);
      throw new Error('Failed to authenticate with MyFxBook');
    }
  }

  async getAccounts(session) {
    try {
      const response = await axios.get(`${this.baseUrl}/get-my-accounts.json`, {
        params: { session }
      });

      if (response.data.error) {
        throw new Error(response.data.message || 'Failed to get accounts');
      }

      return response.data.accounts.map(account => ({
        id: account.id,
        name: account.name,
        server: account.server,
        accountId: account.accountId,
        platform: account.platform,
        broker: account.broker,
        currency: account.currency,
        leverage: account.leverage,
        type: account.type,
        balance: account.balance,
        profit: account.profit,
        profitPercent: account.profitPercent,
        equity: account.equity,
        withdrawals: account.withdrawals,
        deposits: account.deposits,
        lastUpdate: account.lastUpdateDate,
        createdAt: account.firstTradeDate,
        tracking: account.tracking,
        views: account.views,
        gain: account.gain,
        absGain: account.absGain,
        daily: account.daily,
        monthly: account.monthly,
        drawdown: account.drawdown,
        customerId: account.customerId
      }));
    } catch (error) {
      logger.error('Failed to get MyFxBook accounts:', error);
      throw error;
    }
  }

  async getAccountDetails(session, accountId) {
    try {
      const response = await axios.get(`${this.baseUrl}/get-account.json`, {
        params: { session, id: accountId }
      });

      if (response.data.error) {
        throw new Error(response.data.message || 'Failed to get account details');
      }

      return response.data;
    } catch (error) {
      logger.error(`Failed to get MyFxBook account ${accountId}:`, error);
      throw error;
    }
  }

  async getHistory(session, accountId, start, end) {
    try {
      const response = await axios.get(`${this.baseUrl}/get-history.json`, {
        params: {
          session,
          id: accountId,
          start: start ? start.toISOString().split('T')[0] : undefined,
          end: end ? end.toISOString().split('T')[0] : undefined
        }
      });

      if (response.data.error) {
        throw new Error(response.data.message || 'Failed to get history');
      }

      return response.data.history;
    } catch (error) {
      logger.error(`Failed to get MyFxBook history for ${accountId}:`, error);
      throw error;
    }
  }

  async getDailyGain(session, accountId, start, end) {
    try {
      const response = await axios.get(`${this.baseUrl}/get-daily-gain.json`, {
        params: {
          session,
          id: accountId,
          start: start ? start.toISOString().split('T')[0] : undefined,
          end: end ? end.toISOString().split('T')[0] : undefined
        }
      });

      if (response.data.error) {
        throw new Error(response.data.message || 'Failed to get daily gain');
      }

      return response.data.dailyGain;
    } catch (error) {
      logger.error(`Failed to get MyFxBook daily gain for ${accountId}:`, error);
      throw error;
    }
  }

  async getCustomReport(session, accountId, reportType = 'monthly') {
    try {
      const now = new Date();
      const start = new Date();
      
      if (reportType === 'quarterly') {
        start.setMonth(now.getMonth() - 3);
      } else {
        start.setMonth(now.getMonth() - 1);
      }

      // Get account details
      const account = await this.getAccountDetails(session, accountId);
      
      // Get trading history
      const history = await this.getHistory(session, accountId, start, now);
      
      // Get daily performance
      const dailyGain = await this.getDailyGain(session, accountId, start, now);

      // Calculate metrics similar to MetaApi
      const metrics = this.calculateMetrics(account, history, dailyGain);

      return {
        accountId: accountId,
        accountInfo: {
          name: account.name,
          broker: account.broker,
          server: account.server,
          platform: account.platform,
          currency: account.currency,
          leverage: account.leverage,
          balance: account.balance,
          equity: account.equity,
          profit: account.profit,
          profitPercent: account.profitPercent
        },
        deals: history,
        metrics,
        dailyPerformance: dailyGain,
        lastUpdate: new Date().toISOString(),
        source: 'myfxbook'
      };
    } catch (error) {
      logger.error(`Failed to generate custom report for ${accountId}:`, error);
      throw error;
    }
  }

  calculateMetrics(account, history, dailyGain) {
    const trades = history || [];
    let wins = 0;
    let losses = 0;
    let totalProfit = 0;
    let totalLoss = 0;

    trades.forEach(trade => {
      const profit = parseFloat(trade.profit) || 0;
      if (profit > 0) {
        wins++;
        totalProfit += profit;
      } else if (profit < 0) {
        losses++;
        totalLoss += Math.abs(profit);
      }
    });

    return {
      balance: parseFloat(account.balance) || 0,
      equity: parseFloat(account.equity) || 0,
      totalTrades: trades.length,
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
      profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0,
      totalProfit: totalProfit,
      totalLoss: totalLoss,
      netProfit: totalProfit - totalLoss,
      maxDrawdown: parseFloat(account.drawdown) || 0,
      averageWin: wins > 0 ? totalProfit / wins : 0,
      averageLoss: losses > 0 ? totalLoss / losses : 0,
      monthlyReturn: parseFloat(account.monthly) || 0,
      totalReturn: parseFloat(account.gain) || 0,
      absoluteReturn: parseFloat(account.absGain) || 0
    };
  }

  async validateApiAccess(email, password) {
    try {
      const session = await this.login(email, password);
      const accounts = await this.getAccounts(session);
      
      return {
        valid: true,
        accountCount: accounts.length,
        accounts: accounts.map(a => ({
          id: a.id,
          name: a.name,
          broker: a.broker
        }))
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

export default new MyFxBookService();