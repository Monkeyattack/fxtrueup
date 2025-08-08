/**
 * Trading Metrics Calculator
 * Calculates win rate, weighted win rate, streaks, and drawdown from trade data
 */

class TradingMetrics {
    constructor() {}

    /**
     * Calculate all metrics from an array of trades/deals
     * @param {Array} trades - Array of trade objects with at least: { profit, time }
     * @param {Number} initialBalance - Starting balance for drawdown calculations
     * @returns {Object} Calculated metrics
     */
    calculateMetrics(trades, initialBalance = 10000) {
        if (!trades || trades.length === 0) {
            return this.getEmptyMetrics();
        }

        // Sort trades by time
        const sortedTrades = [...trades].sort((a, b) => 
            new Date(a.time) - new Date(b.time)
        );

        // Basic calculations
        const winningTrades = sortedTrades.filter(t => t.profit > 0);
        const losingTrades = sortedTrades.filter(t => t.profit < 0);
        const totalProfit = sortedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
        const totalWinProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
        const totalLossProfit = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));

        // Win rates
        const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
        const weightedWinRate = this.calculateWeightedWinRate(sortedTrades);

        // Streaks
        const streaks = this.calculateStreaks(sortedTrades);

        // Drawdown
        const drawdown = this.calculateDrawdown(sortedTrades, initialBalance);

        // Profit factor
        const profitFactor = totalLossProfit > 0 ? totalWinProfit / totalLossProfit : 
                           totalWinProfit > 0 ? Infinity : 0;

        // Average win/loss
        const avgWin = winningTrades.length > 0 ? totalWinProfit / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? totalLossProfit / losingTrades.length : 0;

        // Expectancy
        const expectancy = trades.length > 0 ? totalProfit / trades.length : 0;

        return {
            totalTrades: trades.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate: Number(winRate.toFixed(2)),
            weightedWinRate: Number(weightedWinRate.toFixed(2)),
            profitFactor: Number(profitFactor.toFixed(2)),
            totalProfit: Number(totalProfit.toFixed(2)),
            avgWin: Number(avgWin.toFixed(2)),
            avgLoss: Number(avgLoss.toFixed(2)),
            expectancy: Number(expectancy.toFixed(2)),
            largestWin: winningTrades.length > 0 ? 
                Math.max(...winningTrades.map(t => t.profit)) : 0,
            largestLoss: losingTrades.length > 0 ? 
                Math.abs(Math.min(...losingTrades.map(t => t.profit))) : 0,
            currentStreak: streaks.current,
            bestWinStreak: streaks.bestWin,
            worstLossStreak: streaks.worstLoss,
            maxDrawdown: drawdown.maxDrawdown,
            maxDrawdownPercent: drawdown.maxDrawdownPercent,
            currentDrawdown: drawdown.currentDrawdown,
            currentDrawdownPercent: drawdown.currentDrawdownPercent
        };
    }

    /**
     * Calculate weighted win rate (by profit size)
     */
    calculateWeightedWinRate(trades) {
        if (trades.length === 0) return 0;

        const totalAbsProfit = trades.reduce((sum, t) => sum + Math.abs(t.profit || 0), 0);
        if (totalAbsProfit === 0) return 0;

        const winProfitWeight = trades
            .filter(t => t.profit > 0)
            .reduce((sum, t) => sum + t.profit, 0);

        return (winProfitWeight / totalAbsProfit) * 100;
    }

    /**
     * Calculate winning and losing streaks
     */
    calculateStreaks(trades) {
        let currentStreak = 0;
        let bestWinStreak = 0;
        let worstLossStreak = 0;
        let tempWinStreak = 0;
        let tempLossStreak = 0;

        for (const trade of trades) {
            if (trade.profit > 0) {
                // Win
                tempWinStreak++;
                tempLossStreak = 0;
                currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
                bestWinStreak = Math.max(bestWinStreak, tempWinStreak);
            } else if (trade.profit < 0) {
                // Loss
                tempLossStreak++;
                tempWinStreak = 0;
                currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
                worstLossStreak = Math.max(worstLossStreak, tempLossStreak);
            }
            // Skip trades with 0 profit
        }

        return {
            current: currentStreak,
            bestWin: bestWinStreak,
            worstLoss: worstLossStreak
        };
    }

    /**
     * Calculate drawdown metrics
     */
    calculateDrawdown(trades, initialBalance) {
        let balance = initialBalance;
        let peak = initialBalance;
        let maxDrawdown = 0;
        let maxDrawdownPercent = 0;
        let currentDrawdown = 0;
        let currentDrawdownPercent = 0;

        // Track balance over time
        const balanceHistory = [{ time: new Date(0), balance: initialBalance }];

        for (const trade of trades) {
            balance += (trade.profit || 0);
            balanceHistory.push({
                time: new Date(trade.time),
                balance: balance
            });

            // Update peak
            if (balance > peak) {
                peak = balance;
            }

            // Calculate drawdown from peak
            const drawdownFromPeak = peak - balance;
            const drawdownPercent = peak > 0 ? (drawdownFromPeak / peak) * 100 : 0;

            // Update max drawdown
            if (drawdownFromPeak > maxDrawdown) {
                maxDrawdown = drawdownFromPeak;
                maxDrawdownPercent = drawdownPercent;
            }
        }

        // Current drawdown
        currentDrawdown = peak - balance;
        currentDrawdownPercent = peak > 0 ? (currentDrawdown / peak) * 100 : 0;

        return {
            maxDrawdown: Number(maxDrawdown.toFixed(2)),
            maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
            currentDrawdown: Number(currentDrawdown.toFixed(2)),
            currentDrawdownPercent: Number(currentDrawdownPercent.toFixed(2)),
            balanceHistory: balanceHistory
        };
    }

    /**
     * Get empty metrics object
     */
    getEmptyMetrics() {
        return {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            winRate: 0,
            weightedWinRate: 0,
            profitFactor: 0,
            totalProfit: 0,
            avgWin: 0,
            avgLoss: 0,
            expectancy: 0,
            largestWin: 0,
            largestLoss: 0,
            currentStreak: 0,
            bestWinStreak: 0,
            worstLossStreak: 0,
            maxDrawdown: 0,
            maxDrawdownPercent: 0,
            currentDrawdown: 0,
            currentDrawdownPercent: 0
        };
    }

    /**
     * Format metrics for display
     */
    formatMetrics(metrics) {
        return {
            ...metrics,
            winRate: `${metrics.winRate}%`,
            weightedWinRate: `${metrics.weightedWinRate}%`,
            profitFactor: metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toString(),
            totalProfit: `$${metrics.totalProfit.toLocaleString()}`,
            avgWin: `$${metrics.avgWin.toLocaleString()}`,
            avgLoss: `$${metrics.avgLoss.toLocaleString()}`,
            expectancy: `$${metrics.expectancy.toLocaleString()}`,
            largestWin: `$${metrics.largestWin.toLocaleString()}`,
            largestLoss: `$${metrics.largestLoss.toLocaleString()}`,
            maxDrawdown: `$${metrics.maxDrawdown.toLocaleString()}`,
            maxDrawdownPercent: `${metrics.maxDrawdownPercent}%`,
            currentDrawdown: `$${metrics.currentDrawdown.toLocaleString()}`,
            currentDrawdownPercent: `${metrics.currentDrawdownPercent}%`
        };
    }
}

module.exports = new TradingMetrics();