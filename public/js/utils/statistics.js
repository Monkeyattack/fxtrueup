/**
 * Statistics Calculation Utilities for Trading Data
 * Provides accurate calculations for trading performance metrics
 */

class TradingStatistics {
    /**
     * Calculate comprehensive trading metrics from deals data
     */
    static calculateMetrics(deals, initialBalance = 10000) {
        if (!deals || deals.length === 0) {
            return this.getEmptyMetrics();
        }

        const metrics = {
            totalTrades: deals.length,
            winningTrades: 0,
            losingTrades: 0,
            totalProfit: 0,
            totalLoss: 0,
            largestWin: 0,
            largestLoss: 0,
            consecutiveWins: 0,
            consecutiveLosses: 0,
            maxConsecutiveWins: 0,
            maxConsecutiveLosses: 0,
            totalCommission: 0,
            totalSwap: 0,
            totalVolume: 0,
            profitFactor: 0,
            winRate: 0,
            averageWin: 0,
            averageLoss: 0,
            averageTrade: 0,
            maxDrawdown: 0,
            maxDrawdownPercent: 0,
            sharpeRatio: 0,
            expectancy: 0,
            recoveryFactor: 0,
            calmarRatio: 0,
            sterlingRatio: 0,
            sortino: 0,
            profitToMaxDrawdown: 0,
            equity: [],
            drawdownHistory: [],
            monthlyReturns: {}
        };

        let runningBalance = initialBalance;
        let peak = initialBalance;
        let currentConsecutiveWins = 0;
        let currentConsecutiveLosses = 0;
        let dailyReturns = [];

        // Process each deal
        deals.forEach((deal, index) => {
            const profit = parseFloat(deal.profit || 0);
            const commission = parseFloat(deal.commission || 0);
            const swap = parseFloat(deal.swap || 0);
            const volume = parseFloat(deal.volume || 0);
            const netProfit = profit + commission + swap;

            // Update totals
            metrics.totalCommission += commission;
            metrics.totalSwap += swap;
            metrics.totalVolume += volume;

            // Track running balance and equity
            runningBalance += netProfit;
            metrics.equity.push({
                time: deal.time || deal.brokerTime,
                balance: runningBalance,
                profit: netProfit
            });

            // Calculate drawdown
            if (runningBalance > peak) {
                peak = runningBalance;
            }
            
            const drawdown = peak - runningBalance;
            const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
            
            metrics.drawdownHistory.push({
                time: deal.time || deal.brokerTime,
                drawdown: drawdown,
                drawdownPercent: drawdownPercent
            });

            if (drawdown > metrics.maxDrawdown) {
                metrics.maxDrawdown = drawdown;
            }
            if (drawdownPercent > metrics.maxDrawdownPercent) {
                metrics.maxDrawdownPercent = drawdownPercent;
            }

            // Classify trade
            if (netProfit > 0) {
                metrics.winningTrades++;
                metrics.totalProfit += netProfit;
                
                if (netProfit > metrics.largestWin) {
                    metrics.largestWin = netProfit;
                }

                currentConsecutiveWins++;
                currentConsecutiveLosses = 0;
                
                if (currentConsecutiveWins > metrics.maxConsecutiveWins) {
                    metrics.maxConsecutiveWins = currentConsecutiveWins;
                }
            } else if (netProfit < 0) {
                metrics.losingTrades++;
                metrics.totalLoss += Math.abs(netProfit);
                
                if (Math.abs(netProfit) > Math.abs(metrics.largestLoss)) {
                    metrics.largestLoss = netProfit;
                }

                currentConsecutiveLosses++;
                currentConsecutiveWins = 0;
                
                if (currentConsecutiveLosses > metrics.maxConsecutiveLosses) {
                    metrics.maxConsecutiveLosses = currentConsecutiveLosses;
                }
            }

            // Calculate daily return for Sharpe ratio
            const returnPercent = initialBalance > 0 ? (netProfit / initialBalance) * 100 : 0;
            dailyReturns.push(returnPercent);

            // Track monthly returns
            const date = new Date(deal.time || deal.brokerTime);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!metrics.monthlyReturns[monthKey]) {
                metrics.monthlyReturns[monthKey] = 0;
            }
            metrics.monthlyReturns[monthKey] += netProfit;
        });

        // Calculate derived metrics
        metrics.winRate = metrics.totalTrades > 0 ? (metrics.winningTrades / metrics.totalTrades) * 100 : 0;
        metrics.averageWin = metrics.winningTrades > 0 ? metrics.totalProfit / metrics.winningTrades : 0;
        metrics.averageLoss = metrics.losingTrades > 0 ? metrics.totalLoss / metrics.losingTrades : 0;
        metrics.averageTrade = metrics.totalTrades > 0 ? (metrics.totalProfit - metrics.totalLoss) / metrics.totalTrades : 0;
        metrics.profitFactor = metrics.totalLoss > 0 ? metrics.totalProfit / metrics.totalLoss : (metrics.totalProfit > 0 ? Infinity : 0);
        
        const netProfit = metrics.totalProfit - metrics.totalLoss;
        metrics.expectancy = metrics.totalTrades > 0 ? netProfit / metrics.totalTrades : 0;
        metrics.recoveryFactor = metrics.maxDrawdown > 0 ? netProfit / metrics.maxDrawdown : 0;
        metrics.profitToMaxDrawdown = metrics.maxDrawdown > 0 ? netProfit / metrics.maxDrawdown : 0;

        // Calculate Sharpe ratio (simplified - assumes daily returns)
        if (dailyReturns.length > 1) {
            const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
            const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / dailyReturns.length;
            const stdDev = Math.sqrt(variance);
            metrics.sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
        }

        // Calculate Sortino ratio (downside deviation)
        const negativeReturns = dailyReturns.filter(ret => ret < 0);
        if (negativeReturns.length > 0) {
            const avgNegativeReturn = negativeReturns.reduce((sum, ret) => sum + ret, 0) / negativeReturns.length;
            const downsideVariance = negativeReturns.reduce((sum, ret) => sum + Math.pow(ret - avgNegativeReturn, 2), 0) / negativeReturns.length;
            const downsideDeviation = Math.sqrt(downsideVariance);
            const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
            metrics.sortino = downsideDeviation > 0 ? avgReturn / downsideDeviation : 0;
        }

        // Calculate Calmar ratio (annual return / max drawdown)
        const totalReturn = netProfit;
        metrics.calmarRatio = metrics.maxDrawdownPercent > 0 ? (totalReturn / initialBalance * 100) / metrics.maxDrawdownPercent : 0;

        return metrics;
    }

    /**
     * Calculate position sizing metrics
     */
    static calculatePositionSizing(deals) {
        if (!deals || deals.length === 0) {
            return {};
        }

        const volumes = deals.map(deal => parseFloat(deal.volume || 0));
        const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
        const minVolume = Math.min(...volumes);
        const maxVolume = Math.max(...volumes);

        // Calculate volume distribution
        const volumeDistribution = {};
        volumes.forEach(vol => {
            const key = vol.toString();
            volumeDistribution[key] = (volumeDistribution[key] || 0) + 1;
        });

        return {
            averageVolume: avgVolume,
            minVolume: minVolume,
            maxVolume: maxVolume,
            volumeDistribution: volumeDistribution,
            totalVolume: volumes.reduce((sum, vol) => sum + vol, 0)
        };
    }

    /**
     * Calculate symbol-specific performance
     */
    static calculateSymbolPerformance(deals) {
        if (!deals || deals.length === 0) {
            return {};
        }

        const symbolStats = {};

        deals.forEach(deal => {
            const symbol = deal.symbol;
            const profit = parseFloat(deal.profit || 0);
            const commission = parseFloat(deal.commission || 0);
            const swap = parseFloat(deal.swap || 0);
            const netProfit = profit + commission + swap;

            if (!symbolStats[symbol]) {
                symbolStats[symbol] = {
                    trades: 0,
                    wins: 0,
                    losses: 0,
                    totalProfit: 0,
                    totalLoss: 0,
                    volume: 0
                };
            }

            const stats = symbolStats[symbol];
            stats.trades++;
            stats.volume += parseFloat(deal.volume || 0);

            if (netProfit > 0) {
                stats.wins++;
                stats.totalProfit += netProfit;
            } else if (netProfit < 0) {
                stats.losses++;
                stats.totalLoss += Math.abs(netProfit);
            }
        });

        // Calculate derived metrics for each symbol
        Object.keys(symbolStats).forEach(symbol => {
            const stats = symbolStats[symbol];
            stats.winRate = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;
            stats.netProfit = stats.totalProfit - stats.totalLoss;
            stats.profitFactor = stats.totalLoss > 0 ? stats.totalProfit / stats.totalLoss : (stats.totalProfit > 0 ? Infinity : 0);
            stats.averageProfit = stats.wins > 0 ? stats.totalProfit / stats.wins : 0;
            stats.averageLoss = stats.losses > 0 ? stats.totalLoss / stats.losses : 0;
        });

        return symbolStats;
    }

    /**
     * Calculate time-based performance (hourly, daily, monthly)
     */
    static calculateTimeBasedPerformance(deals) {
        if (!deals || deals.length === 0) {
            return { hourly: {}, daily: {}, monthly: {} };
        }

        const hourlyStats = {};
        const dailyStats = {};
        const monthlyStats = {};

        deals.forEach(deal => {
            const date = new Date(deal.time || deal.brokerTime);
            const hour = date.getHours();
            const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            const profit = parseFloat(deal.profit || 0);
            const commission = parseFloat(deal.commission || 0);
            const swap = parseFloat(deal.swap || 0);
            const netProfit = profit + commission + swap;

            // Hourly stats
            if (!hourlyStats[hour]) {
                hourlyStats[hour] = { trades: 0, netProfit: 0, wins: 0, losses: 0 };
            }
            hourlyStats[hour].trades++;
            hourlyStats[hour].netProfit += netProfit;
            if (netProfit > 0) hourlyStats[hour].wins++;
            else if (netProfit < 0) hourlyStats[hour].losses++;

            // Daily stats (by day of week)
            if (!dailyStats[dayOfWeek]) {
                dailyStats[dayOfWeek] = { trades: 0, netProfit: 0, wins: 0, losses: 0 };
            }
            dailyStats[dayOfWeek].trades++;
            dailyStats[dayOfWeek].netProfit += netProfit;
            if (netProfit > 0) dailyStats[dayOfWeek].wins++;
            else if (netProfit < 0) dailyStats[dayOfWeek].losses++;

            // Monthly stats
            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = { trades: 0, netProfit: 0, wins: 0, losses: 0 };
            }
            monthlyStats[monthKey].trades++;
            monthlyStats[monthKey].netProfit += netProfit;
            if (netProfit > 0) monthlyStats[monthKey].wins++;
            else if (netProfit < 0) monthlyStats[monthKey].losses++;
        });

        // Calculate win rates
        [hourlyStats, dailyStats, monthlyStats].forEach(stats => {
            Object.keys(stats).forEach(key => {
                const stat = stats[key];
                stat.winRate = stat.trades > 0 ? (stat.wins / stat.trades) * 100 : 0;
            });
        });

        return {
            hourly: hourlyStats,
            daily: dailyStats,
            monthly: monthlyStats
        };
    }

    /**
     * Generate P&L history for charting
     */
    static generatePLHistory(deals, initialBalance = 10000) {
        if (!deals || deals.length === 0) {
            return [{ time: new Date(), cumulativePL: 0, dailyPL: 0, balance: initialBalance }];
        }

        const history = [];
        let runningBalance = initialBalance;
        let cumulativePL = 0;

        deals.forEach(deal => {
            const profit = parseFloat(deal.profit || 0);
            const commission = parseFloat(deal.commission || 0);
            const swap = parseFloat(deal.swap || 0);
            const netProfit = profit + commission + swap;

            cumulativePL += netProfit;
            runningBalance += netProfit;

            history.push({
                time: deal.time || deal.brokerTime,
                cumulativePL: cumulativePL,
                dailyPL: netProfit,
                balance: runningBalance,
                profit: profit,
                commission: commission,
                swap: swap,
                netProfit: netProfit,
                symbol: deal.symbol,
                volume: deal.volume
            });
        });

        return history;
    }

    /**
     * Return empty metrics structure
     */
    static getEmptyMetrics() {
        return {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalProfit: 0,
            totalLoss: 0,
            largestWin: 0,
            largestLoss: 0,
            consecutiveWins: 0,
            consecutiveLosses: 0,
            maxConsecutiveWins: 0,
            maxConsecutiveLosses: 0,
            totalCommission: 0,
            totalSwap: 0,
            totalVolume: 0,
            profitFactor: 0,
            winRate: 0,
            averageWin: 0,
            averageLoss: 0,
            averageTrade: 0,
            maxDrawdown: 0,
            maxDrawdownPercent: 0,
            sharpeRatio: 0,
            expectancy: 0,
            recoveryFactor: 0,
            calmarRatio: 0,
            sterlingRatio: 0,
            sortino: 0,
            profitToMaxDrawdown: 0,
            equity: [],
            drawdownHistory: [],
            monthlyReturns: {}
        };
    }

    /**
     * Format metric value for display
     */
    static formatMetric(value, type) {
        if (typeof value !== 'number' || !isFinite(value)) {
            return type === 'currency' ? '$0.00' : '0.00';
        }

        switch (type) {
            case 'currency':
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(value);
            
            case 'percentage':
                return `${value.toFixed(2)}%`;
            
            case 'ratio':
                return value.toFixed(2);
            
            case 'integer':
                return Math.round(value).toLocaleString();
            
            default:
                return value.toFixed(2);
        }
    }
}

// Export for use in other modules
window.TradingStatistics = TradingStatistics;