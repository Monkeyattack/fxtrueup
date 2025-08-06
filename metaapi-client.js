import MetaApi from 'metaapi.cloud-sdk';
import tokenStore from './token-store.js';

class MetaApiClient {
    constructor() {
        this.token = process.env.METAAPI_TOKEN;
        this.region = process.env.METAAPI_REGION || 'new-york';
        this.api = null;
        this.accounts = new Map(); // Cache MetaApi account connections
    }

    async initialize() {
        if (!this.api && this.token) {
            this.api = new MetaApi(this.token, {
                region: this.region,
                requestTimeout: 60000,
                connectTimeout: 60000
            });
        }
        return this.api;
    }

    async connectAccount(accountData) {
        try {
            await this.initialize();
            if (!this.api) {
                throw new Error('MetaApi not initialized');
            }

            const provisioningProfile = await this.api.provisioningProfileApi.createProvisioningProfile({
                name: `${accountData.accountName}_profile`,
                version: accountData.accountType === 'mt5' ? 5 : 4,
                brokerTimezone: 'EET',
                brokerDSTSwitchTimezone: 'EET'
            });

            const account = await this.api.metatraderAccountApi.createAccount({
                name: accountData.accountName,
                type: 'cloud',
                login: accountData.login,
                password: accountData.password,
                server: accountData.serverName,
                provisioningProfileId: provisioningProfile.id,
                magic: accountData.magic || undefined,
                quoteStreamingIntervalInSeconds: 2.5,
                tags: accountData.tags || [],
                metadata: {
                    userId: accountData.userId,
                    brokerName: accountData.brokerName || '',
                    accountRegion: accountData.accountRegion || ''
                }
            });

            // Deploy account
            await account.deploy();
            
            // Wait for deployment
            await account.waitDeployed();

            return {
                success: true,
                metaApiAccountId: account.id,
                provisioningProfileId: provisioningProfile.id
            };
        } catch (error) {
            console.error('MetaApi connection error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getAccountConnection(metaApiAccountId) {
        try {
            if (this.accounts.has(metaApiAccountId)) {
                return this.accounts.get(metaApiAccountId);
            }

            await this.initialize();
            const account = await this.api.metatraderAccountApi.getAccount(metaApiAccountId);
            const connection = await account.getStreamingConnection();
            await connection.connect();
            await connection.waitSynchronized();

            this.accounts.set(metaApiAccountId, connection);
            return connection;
        } catch (error) {
            console.error('Error getting account connection:', error);
            throw error;
        }
    }

    async getAccountMetrics(metaApiAccountId) {
        try {
            const connection = await this.getAccountConnection(metaApiAccountId);
            const accountInfo = await connection.getAccountInformation();
            const positions = await connection.getPositions();
            const orders = await connection.getOrders();
            
            return {
                accountInfo,
                positions,
                orders,
                metrics: {
                    balance: accountInfo.balance,
                    equity: accountInfo.equity,
                    margin: accountInfo.margin,
                    freeMargin: accountInfo.freeMargin,
                    marginLevel: accountInfo.marginLevel,
                    profit: accountInfo.profit,
                    credit: accountInfo.credit,
                    leverage: accountInfo.leverage,
                    currency: accountInfo.currency
                }
            };
        } catch (error) {
            console.error('Error getting account metrics:', error);
            throw error;
        }
    }

    async getAccountHistory(metaApiAccountId, startTime, endTime) {
        try {
            const connection = await this.getAccountConnection(metaApiAccountId);
            
            // Get deals (closed trades)
            const deals = await connection.getDealsByTimeRange(
                new Date(startTime),
                new Date(endTime)
            );

            // Get historical orders
            const historyOrders = await connection.getHistoryOrdersByTimeRange(
                new Date(startTime),
                new Date(endTime)
            );

            return {
                deals,
                historyOrders,
                summary: this.calculateTradingSummary(deals)
            };
        } catch (error) {
            console.error('Error getting account history:', error);
            throw error;
        }
    }

    calculateTradingSummary(deals) {
        let totalProfit = 0;
        let totalLoss = 0;
        let winCount = 0;
        let lossCount = 0;
        let totalVolume = 0;
        let totalCommission = 0;
        let totalSwap = 0;

        deals.forEach(deal => {
            if (deal.type === 'DEAL_TYPE_BUY' || deal.type === 'DEAL_TYPE_SELL') {
                const profit = deal.profit || 0;
                const commission = deal.commission || 0;
                const swap = deal.swap || 0;
                
                totalVolume += deal.volume || 0;
                totalCommission += commission;
                totalSwap += swap;

                const netProfit = profit + commission + swap;
                
                if (netProfit > 0) {
                    totalProfit += netProfit;
                    winCount++;
                } else if (netProfit < 0) {
                    totalLoss += Math.abs(netProfit);
                    lossCount++;
                }
            }
        });

        const totalTrades = winCount + lossCount;
        const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
        const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
        const netPnL = totalProfit - totalLoss;

        return {
            totalTrades,
            winCount,
            lossCount,
            winRate: winRate.toFixed(2),
            totalProfit: totalProfit.toFixed(2),
            totalLoss: totalLoss.toFixed(2),
            netPnL: netPnL.toFixed(2),
            profitFactor: profitFactor === Infinity ? 'Infinity' : profitFactor.toFixed(2),
            totalVolume: totalVolume.toFixed(2),
            totalCommission: totalCommission.toFixed(2),
            totalSwap: totalSwap.toFixed(2),
            averageWin: winCount > 0 ? (totalProfit / winCount).toFixed(2) : '0.00',
            averageLoss: lossCount > 0 ? (totalLoss / lossCount).toFixed(2) : '0.00'
        };
    }

    async getAllAccountsMetrics(userId) {
        try {
            const userAccounts = tokenStore.getUserAccounts(userId);
            const metricsPromises = [];

            for (const account of userAccounts) {
                if (account.metaApiAccountId) {
                    metricsPromises.push(
                        this.getAccountMetrics(account.metaApiAccountId)
                            .then(metrics => ({
                                accountId: account.id,
                                accountName: account.accountName,
                                ...metrics
                            }))
                            .catch(error => ({
                                accountId: account.id,
                                accountName: account.accountName,
                                error: error.message
                            }))
                    );
                }
            }

            const results = await Promise.all(metricsPromises);
            
            // Calculate overall metrics
            let totalBalance = 0;
            let totalEquity = 0;
            let totalProfit = 0;
            const accountMetrics = [];

            results.forEach(result => {
                if (!result.error && result.metrics) {
                    totalBalance += result.metrics.balance || 0;
                    totalEquity += result.metrics.equity || 0;
                    totalProfit += result.metrics.profit || 0;
                    accountMetrics.push(result);
                }
            });

            return {
                totalBalance: totalBalance.toFixed(2),
                totalEquity: totalEquity.toFixed(2),
                totalProfit: totalProfit.toFixed(2),
                accountCount: accountMetrics.length,
                accounts: accountMetrics,
                topPerformers: this.getTopPerformers(accountMetrics),
                bottomPerformers: this.getBottomPerformers(accountMetrics)
            };
        } catch (error) {
            console.error('Error getting all accounts metrics:', error);
            throw error;
        }
    }

    getTopPerformers(accounts, limit = 3) {
        return accounts
            .filter(acc => acc.metrics)
            .sort((a, b) => (b.metrics.profit || 0) - (a.metrics.profit || 0))
            .slice(0, limit)
            .map(acc => ({
                accountId: acc.accountId,
                accountName: acc.accountName,
                profit: acc.metrics.profit,
                profitPercent: acc.metrics.balance > 0 
                    ? ((acc.metrics.profit / acc.metrics.balance) * 100).toFixed(2)
                    : '0.00'
            }));
    }

    getBottomPerformers(accounts, limit = 3) {
        return accounts
            .filter(acc => acc.metrics)
            .sort((a, b) => (a.metrics.profit || 0) - (b.metrics.profit || 0))
            .slice(0, limit)
            .map(acc => ({
                accountId: acc.accountId,
                accountName: acc.accountName,
                profit: acc.metrics.profit,
                profitPercent: acc.metrics.balance > 0 
                    ? ((acc.metrics.profit / acc.metrics.balance) * 100).toFixed(2)
                    : '0.00'
            }));
    }

    async getMetricsByCategory(userId) {
        try {
            const userAccounts = tokenStore.getUserAccounts(userId);
            const categoryMetrics = new Map();

            for (const account of userAccounts) {
                if (account.metaApiAccountId && account.tags) {
                    try {
                        const metrics = await this.getAccountMetrics(account.metaApiAccountId);
                        
                        account.tags.forEach(tag => {
                            if (!categoryMetrics.has(tag)) {
                                categoryMetrics.set(tag, {
                                    totalBalance: 0,
                                    totalEquity: 0,
                                    totalProfit: 0,
                                    accountCount: 0,
                                    accounts: []
                                });
                            }

                            const category = categoryMetrics.get(tag);
                            category.totalBalance += metrics.metrics.balance || 0;
                            category.totalEquity += metrics.metrics.equity || 0;
                            category.totalProfit += metrics.metrics.profit || 0;
                            category.accountCount++;
                            category.accounts.push({
                                accountId: account.id,
                                accountName: account.accountName,
                                profit: metrics.metrics.profit
                            });
                        });
                    } catch (error) {
                        console.error(`Error getting metrics for account ${account.id}:`, error);
                    }
                }
            }

            // Convert Map to array with formatted values
            const result = [];
            categoryMetrics.forEach((metrics, category) => {
                result.push({
                    category,
                    totalBalance: metrics.totalBalance.toFixed(2),
                    totalEquity: metrics.totalEquity.toFixed(2),
                    totalProfit: metrics.totalProfit.toFixed(2),
                    profitPercent: metrics.totalBalance > 0 
                        ? ((metrics.totalProfit / metrics.totalBalance) * 100).toFixed(2)
                        : '0.00',
                    accountCount: metrics.accountCount,
                    accounts: metrics.accounts
                });
            });

            return result.sort((a, b) => b.totalProfit - a.totalProfit);
        } catch (error) {
            console.error('Error getting metrics by category:', error);
            throw error;
        }
    }

    async disconnectAll() {
        for (const [accountId, connection] of this.accounts) {
            try {
                await connection.close();
            } catch (error) {
                console.error(`Error closing connection for ${accountId}:`, error);
            }
        }
        this.accounts.clear();
    }
}

// Create singleton instance
const metaApiClient = new MetaApiClient();

export default metaApiClient;