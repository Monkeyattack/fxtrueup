// Account Detail Page
class AccountDetail {
    constructor() {
        this.token = null;
        this.accountId = null;
        this.account = null;
        this.transactions = [];
        this.positions = [];
        this.charts = {};
        this.init();
    }

    async init() {
        // Get account ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.accountId = urlParams.get('id');
        
        if (!this.accountId) {
            window.location.href = '/accounts';
            return;
        }

        // Get token
        this.token = localStorage.getItem('authToken');
        if (!this.token || !(await this.checkAuth())) {
            window.location.href = '/?auth=required';
            return;
        }

        this.initializeEventListeners();
        this.loadUserData();
        await this.loadAccountData();
        await this.loadMetrics();
    }

    async checkAuth() {
        try {
            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (response.ok) {
                this.user = await response.json();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error loading MetaApi data:', error);
            // Don't show error to user - we may have cached data
        }
    }

    updateMetrics(metrics) {
        const balance = metrics.balance || 0;
        const equity = metrics.equity || 0;
        const profit = metrics.profit || 0;

        document.getElementById('metricBalance').textContent = `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('metricEquity').textContent = `$${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        // Calculate win rate from transactions
        const winRate = this.calculateWinRate();
        document.getElementById('metricWinRate').textContent = `${winRate}%`;

        // Update P&L with color
        const pnlElement = document.getElementById('metricPnL');
        const profitIcon = document.getElementById('profitIcon');
        
        if (profit >= 0) {
            pnlElement.textContent = `+$${profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            pnlElement.className = 'text-2xl font-semibold text-green-600';
            profitIcon.className = 'flex-shrink-0 bg-green-100 rounded-full p-3';
            profitIcon.innerHTML = '<i class="fas fa-arrow-up text-2xl text-green-600"></i>';
        } else {
            pnlElement.textContent = `-$${Math.abs(profit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            pnlElement.className = 'text-2xl font-semibold text-red-600';
            profitIcon.className = 'flex-shrink-0 bg-red-100 rounded-full p-3';
            profitIcon.innerHTML = '<i class="fas fa-arrow-down text-2xl text-red-600"></i>';
        }
    }

    calculateWinRate() {
        if (this.transactions.length === 0) return 0;
        
        const trades = this.transactions.filter(t => 
            t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL'
        );
        
        if (trades.length === 0) return 0;
        
        const wins = trades.filter(t => (t.profit || 0) > 0).length;
        return ((wins / trades.length) * 100).toFixed(1);
    }

    async loadMetrics() {
        try {
            const response = await fetch(`/api/accounts/${this.accountId}/metrics`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (response.ok) {
                const metrics = await response.json();
                this.displayDetailedMetrics(metrics);
            }
        } catch (error) {
            console.error('Error loading metrics:', error);
        }
    }

    displayDetailedMetrics(metrics) {
        // Create metrics display section if it doesn't exist
        const metricsSection = document.getElementById('metricsSection');
        if (!metricsSection) {
            const container = document.createElement('div');
            container.id = 'metricsSection';
            container.className = 'bg-white shadow overflow-hidden sm:rounded-lg mt-6';
            container.innerHTML = `
                <div class="px-4 py-5 sm:px-6">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">
                        Trading Performance Metrics
                    </h3>
                </div>
                <div class="border-t border-gray-200 px-4 py-5 sm:p-6">
                    <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Win Rate</dt>
                            <dd class="mt-1 text-2xl font-semibold text-gray-900" id="metricWinRateDetail">${metrics.winRate}%</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Weighted Win Rate</dt>
                            <dd class="mt-1 text-2xl font-semibold text-gray-900" id="metricWeightedWinRate">${metrics.weightedWinRate}%</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Profit Factor</dt>
                            <dd class="mt-1 text-2xl font-semibold text-gray-900" id="metricProfitFactor">${metrics.profitFactor}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Total Trades</dt>
                            <dd class="mt-1 text-2xl font-semibold text-gray-900" id="metricTotalTrades">${metrics.totalTrades}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Average Win</dt>
                            <dd class="mt-1 text-xl font-semibold text-green-600" id="metricAvgWin">$${metrics.avgWin.toLocaleString()}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Average Loss</dt>
                            <dd class="mt-1 text-xl font-semibold text-red-600" id="metricAvgLoss">$${metrics.avgLoss.toLocaleString()}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Expectancy</dt>
                            <dd class="mt-1 text-xl font-semibold ${metrics.expectancy >= 0 ? 'text-green-600' : 'text-red-600'}" id="metricExpectancy">$${metrics.expectancy.toLocaleString()}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Current Streak</dt>
                            <dd class="mt-1 text-xl font-semibold ${metrics.currentStreak > 0 ? 'text-green-600' : 'text-red-600'}" id="metricCurrentStreak">${metrics.currentStreak > 0 ? '+' : ''}${metrics.currentStreak}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Best Win Streak</dt>
                            <dd class="mt-1 text-xl font-semibold text-green-600" id="metricBestStreak">${metrics.bestWinStreak}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Worst Loss Streak</dt>
                            <dd class="mt-1 text-xl font-semibold text-red-600" id="metricWorstStreak">${metrics.worstLossStreak}</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Max Drawdown</dt>
                            <dd class="mt-1 text-xl font-semibold text-red-600" id="metricMaxDrawdown">$${metrics.maxDrawdown.toLocaleString()} (${metrics.maxDrawdownPercent}%)</dd>
                        </div>
                        <div class="sm:col-span-1">
                            <dt class="text-sm font-medium text-gray-500">Current Drawdown</dt>
                            <dd class="mt-1 text-xl font-semibold ${metrics.currentDrawdown > 0 ? 'text-red-600' : 'text-gray-900'}" id="metricCurrentDrawdown">$${metrics.currentDrawdown.toLocaleString()} (${metrics.currentDrawdownPercent}%)</dd>
                        </div>
                    </dl>
                </div>
            `;
            
            // Insert after the main metrics cards
            const mainMetrics = document.querySelector('.grid.grid-cols-1.gap-5.sm\\:grid-cols-2.lg\\:grid-cols-4');
            if (mainMetrics && mainMetrics.parentNode) {
                mainMetrics.parentNode.insertBefore(container, mainMetrics.nextSibling);
            }
        } else {
            // Update existing values
            document.getElementById('metricWinRateDetail').textContent = `${metrics.winRate}%`;
            document.getElementById('metricWeightedWinRate').textContent = `${metrics.weightedWinRate}%`;
            document.getElementById('metricProfitFactor').textContent = metrics.profitFactor;
            document.getElementById('metricTotalTrades').textContent = metrics.totalTrades;
            document.getElementById('metricAvgWin').textContent = `$${metrics.avgWin.toLocaleString()}`;
            document.getElementById('metricAvgLoss').textContent = `$${metrics.avgLoss.toLocaleString()}`;
            document.getElementById('metricExpectancy').textContent = `$${metrics.expectancy.toLocaleString()}`;
            document.getElementById('metricCurrentStreak').textContent = `${metrics.currentStreak > 0 ? '+' : ''}${metrics.currentStreak}`;
            document.getElementById('metricBestStreak').textContent = metrics.bestWinStreak;
            document.getElementById('metricWorstStreak').textContent = metrics.worstLossStreak;
            document.getElementById('metricMaxDrawdown').textContent = `$${metrics.maxDrawdown.toLocaleString()} (${metrics.maxDrawdownPercent}%)`;
            document.getElementById('metricCurrentDrawdown').textContent = `$${metrics.currentDrawdown.toLocaleString()} (${metrics.currentDrawdownPercent}%)`;
        }
    }

    displayTransactions() {
        const tbody = document.getElementById('transactionsTableBody');
        if (!tbody) return;

        const filter = document.getElementById('transactionFilter').value;
        let filteredTransactions = this.transactions.filter(t => 
            t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL'
        );

        if (filter === 'profit') {
            filteredTransactions = filteredTransactions.filter(t => (t.profit || 0) > 0);
        } else if (filter === 'loss') {
            filteredTransactions = filteredTransactions.filter(t => (t.profit || 0) < 0);
        }

        // Sort by date descending
        filteredTransactions.sort((a, b) => new Date(b.time) - new Date(a.time));

        tbody.innerHTML = filteredTransactions.map(transaction => {
            const profit = transaction.profit || 0;
            const commission = transaction.commission || 0;
            const swap = transaction.swap || 0;
            const netProfit = profit + commission + swap;
            const profitClass = netProfit >= 0 ? 'text-green-600' : 'text-red-600';
            
            return `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${new Date(transaction.time).toLocaleString()}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${transaction.symbol || '-'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${transaction.type === 'DEAL_TYPE_BUY' ? 'Buy' : 'Sell'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${(transaction.volume || 0).toFixed(2)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${(transaction.price || 0).toFixed(5)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        $${commission.toFixed(2)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        $${swap.toFixed(2)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${profitClass}">
                        ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)}
                    </td>
                </tr>
            `;
        }).join('');

        if (filteredTransactions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-6 py-12 text-center text-gray-500">
                        No transactions found
                    </td>
                </tr>
            `;
        }
    }

    displayPositions() {
        const container = document.getElementById('positionsContainer');
        if (!container) return;

        if (this.positions.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-4"></i>
                    <p>No open positions</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Volume</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Open Price</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S/L</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">T/P</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">P&L</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${this.positions.map(position => {
                            const profit = position.profit || 0;
                            const profitClass = profit >= 0 ? 'text-green-600' : 'text-red-600';
                            
                            return `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${position.symbol}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${position.type === 'POSITION_TYPE_BUY' ? 'Buy' : 'Sell'}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${position.volume.toFixed(2)}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${position.openPrice.toFixed(5)}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${position.currentPrice.toFixed(5)}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${position.stopLoss || '-'}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${position.takeProfit || '-'}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${profitClass}">
                                        ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async loadPnLStatement() {
        const period = document.getElementById('pnlPeriod').value;
        const container = document.getElementById('pnlStatement');
        
        // Calculate date range
        const endDate = new Date();
        let startDate = new Date();
        
        switch (period) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(endDate.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(endDate.getFullYear() - 1);
                break;
            case 'all':
                startDate = new Date(2020, 0, 1); // Arbitrary old date
                break;
        }

        // Filter transactions by date
        const periodTransactions = this.transactions.filter(t => {
            const date = new Date(t.time);
            return date >= startDate && date <= endDate && 
                   (t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL');
        });

        // Calculate P&L metrics
        const metrics = this.calculatePnLMetrics(periodTransactions);

        container.innerHTML = `
            <div class="space-y-4">
                <div class="flex justify-between items-center pb-4 border-b">
                    <div>
                        <h4 class="text-lg font-semibold text-gray-900">${this.account.accountName}</h4>
                        <p class="text-sm text-gray-600">
                            ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-600">Account #${this.account.login}</p>
                        <p class="text-sm text-gray-600">${this.account.brokerName || 'Unknown Broker'}</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600">Total Trades</p>
                        <p class="text-lg font-semibold">${metrics.totalTrades}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Win Rate</p>
                        <p class="text-lg font-semibold">${metrics.winRate}%</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Gross Profit</p>
                        <p class="text-lg font-semibold text-green-600">+$${metrics.totalProfit}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Gross Loss</p>
                        <p class="text-lg font-semibold text-red-600">-$${metrics.totalLoss}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Total Commission</p>
                        <p class="text-lg font-semibold">$${metrics.totalCommission}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Total Swap</p>
                        <p class="text-lg font-semibold">$${metrics.totalSwap}</p>
                    </div>
                </div>

                <div class="pt-4 border-t">
                    <div class="flex justify-between items-center">
                        <p class="text-lg font-medium text-gray-900">Net Profit/Loss</p>
                        <p class="text-2xl font-bold ${parseFloat(metrics.netPnL) >= 0 ? 'text-green-600' : 'text-red-600'}">
                            ${parseFloat(metrics.netPnL) >= 0 ? '+' : ''}$${metrics.netPnL}
                        </p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4 pt-4 border-t text-sm">
                    <div>
                        <p class="text-gray-600">Profit Factor</p>
                        <p class="font-semibold">${metrics.profitFactor}</p>
                    </div>
                    <div>
                        <p class="text-gray-600">Average Win</p>
                        <p class="font-semibold text-green-600">$${metrics.averageWin}</p>
                    </div>
                    <div>
                        <p class="text-gray-600">Average Loss</p>
                        <p class="font-semibold text-red-600">$${metrics.averageLoss}</p>
                    </div>
                    <div>
                        <p class="text-gray-600">Total Volume</p>
                        <p class="font-semibold">${metrics.totalVolume} lots</p>
                    </div>
                </div>
            </div>
        `;
    }

    calculatePnLMetrics(transactions) {
        let totalProfit = 0;
        let totalLoss = 0;
        let winCount = 0;
        let lossCount = 0;
        let totalVolume = 0;
        let totalCommission = 0;
        let totalSwap = 0;

        transactions.forEach(deal => {
            const profit = deal.profit || 0;
            const commission = deal.commission || 0;
            const swap = deal.swap || 0;
            
            totalVolume += deal.volume || 0;
            totalCommission += Math.abs(commission);
            totalSwap += swap;

            const netProfit = profit + commission + swap;
            
            if (netProfit > 0) {
                totalProfit += netProfit;
                winCount++;
            } else if (netProfit < 0) {
                totalLoss += Math.abs(netProfit);
                lossCount++;
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

    loadAnalytics() {
        this.loadEquityChart();
        this.loadMonthlyReturnsChart();
        this.loadWinLossChart();
        this.loadTradingStats();
    }

    loadEquityChart() {
        const ctx = document.getElementById('equityChart');
        if (!ctx) return;

        // Calculate cumulative P&L
        const sortedTransactions = [...this.transactions]
            .filter(t => t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL')
            .sort((a, b) => new Date(a.time) - new Date(b.time));

        let cumulative = 0;
        const data = sortedTransactions.map(t => {
            const profit = (t.profit || 0) + (t.commission || 0) + (t.swap || 0);
            cumulative += profit;
            return {
                x: new Date(t.time),
                y: cumulative
            };
        });

        if (this.charts.equity) {
            this.charts.equity.destroy();
        }

        this.charts.equity = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Equity Curve',
                    data: data,
                    borderColor: data.length > 0 && data[data.length - 1].y >= 0 ? '#10b981' : '#ef4444',
                    backgroundColor: data.length > 0 && data[data.length - 1].y >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day'
                        }
                    },
                    y: {
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    loadMonthlyReturnsChart() {
        const ctx = document.getElementById('monthlyReturnsChart');
        if (!ctx) return;

        // Group transactions by month
        const monthlyData = {};
        this.transactions
            .filter(t => t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL')
            .forEach(t => {
                const date = new Date(t.time);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = 0;
                }
                
                monthlyData[monthKey] += (t.profit || 0) + (t.commission || 0) + (t.swap || 0);
            });

        const sortedMonths = Object.keys(monthlyData).sort();
        const values = sortedMonths.map(month => monthlyData[month]);
        const colors = values.map(v => v >= 0 ? '#10b981' : '#ef4444');

        if (this.charts.monthly) {
            this.charts.monthly.destroy();
        }

        this.charts.monthly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedMonths.map(m => {
                    const [year, month] = m.split('-');
                    return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                }),
                datasets: [{
                    label: 'Monthly Returns',
                    data: values,
                    backgroundColor: colors
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    loadWinLossChart() {
        const ctx = document.getElementById('winLossChart');
        if (!ctx) return;

        const metrics = this.calculatePnLMetrics(
            this.transactions.filter(t => t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL')
        );

        if (this.charts.winLoss) {
            this.charts.winLoss.destroy();
        }

        this.charts.winLoss = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Wins', 'Losses'],
                datasets: [{
                    data: [metrics.winCount, metrics.lossCount],
                    backgroundColor: ['#10b981', '#ef4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    loadTradingStats() {
        const container = document.getElementById('tradingStats');
        if (!container) return;

        const metrics = this.calculatePnLMetrics(
            this.transactions.filter(t => t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL')
        );

        // Calculate additional stats
        const trades = this.transactions.filter(t => t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL');
        const profits = trades.map(t => (t.profit || 0) + (t.commission || 0) + (t.swap || 0)).filter(p => p !== 0);
        
        let maxDrawdown = 0;
        let peak = 0;
        let runningTotal = 0;
        
        trades.forEach(t => {
            runningTotal += (t.profit || 0) + (t.commission || 0) + (t.swap || 0);
            if (runningTotal > peak) {
                peak = runningTotal;
            }
            const drawdown = peak - runningTotal;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        });

        const avgTrade = profits.length > 0 
            ? profits.reduce((a, b) => a + b, 0) / profits.length 
            : 0;

        container.innerHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <p class="text-gray-600">Total Trades</p>
                    <p class="font-semibold">${metrics.totalTrades}</p>
                </div>
                <div>
                    <p class="text-gray-600">Win Rate</p>
                    <p class="font-semibold">${metrics.winRate}%</p>
                </div>
                <div>
                    <p class="text-gray-600">Profit Factor</p>
                    <p class="font-semibold">${metrics.profitFactor}</p>
                </div>
                <div>
                    <p class="text-gray-600">Max Drawdown</p>
                    <p class="font-semibold text-red-600">$${maxDrawdown.toFixed(2)}</p>
                </div>
                <div>
                    <p class="text-gray-600">Average Trade</p>
                    <p class="font-semibold ${avgTrade >= 0 ? 'text-green-600' : 'text-red-600'}">
                        ${avgTrade >= 0 ? '+' : ''}$${avgTrade.toFixed(2)}
                    </p>
                </div>
                <div>
                    <p class="text-gray-600">Total Volume</p>
                    <p class="font-semibold">${metrics.totalVolume} lots</p>
                </div>
            </div>
        `;
    }

    showManualAccountData() {
        // For manual accounts, show limited data
        document.getElementById('metricBalance').textContent = 
            this.account.currentBalance ? `$${this.account.currentBalance.toLocaleString()}` : 'N/A';
        document.getElementById('metricEquity').textContent = 
            this.account.equity ? `$${this.account.equity.toLocaleString()}` : 'N/A';
        document.getElementById('metricWinRate').textContent = 'N/A';
        document.getElementById('metricPnL').textContent = 'N/A';

        // Show message in tabs
        const message = `
            <div class="text-center py-12 text-gray-500">
                <i class="fas fa-info-circle text-4xl mb-4"></i>
                <p class="text-lg">Manual Account</p>
                <p class="mt-2">Real-time data is not available for manually tracked accounts.</p>
                <p class="mt-4">To get real-time data, edit this account and connect it via MetaApi.</p>
            </div>
        `;

        document.getElementById('transactionsTableBody').innerHTML = `<tr><td colspan="8">${message}</td></tr>`;
        document.getElementById('positionsContainer').innerHTML = message;
        document.getElementById('pnlStatement').innerHTML = message;
        
        // Hide analytics tab for manual accounts
        document.getElementById('analyticsTab').classList.add('hidden');
    }

    switchTab(tab) {
        // Update active tab
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('border-primary', 'text-primary');
            btn.classList.add('border-transparent', 'text-gray-500');
        });
        
        document.getElementById(`${tab}Tab`).classList.remove('border-transparent', 'text-gray-500');
        document.getElementById(`${tab}Tab`).classList.add('border-primary', 'text-primary');

        // Show/hide content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        document.getElementById(`${tab}Content`).classList.remove('hidden');
    }

    filterTransactions() {
        this.displayTransactions();
    }

    exportTransactions() {
        // Create CSV content
        const headers = ['Date/Time', 'Symbol', 'Type', 'Volume', 'Price', 'Commission', 'Swap', 'P&L'];
        const rows = this.transactions
            .filter(t => t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL')
            .map(t => {
                const netProfit = (t.profit || 0) + (t.commission || 0) + (t.swap || 0);
                return [
                    new Date(t.time).toLocaleString(),
                    t.symbol || '',
                    t.type === 'DEAL_TYPE_BUY' ? 'Buy' : 'Sell',
                    t.volume || 0,
                    t.price || 0,
                    t.commission || 0,
                    t.swap || 0,
                    netProfit
                ];
            });

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        
        // Download file
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.account.accountName}_transactions_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportPnL() {
        // For now, just print the P&L statement
        window.print();
    }

    showError(message) {
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('errorState').classList.remove('hidden');
        document.getElementById('errorMessage').textContent = message;
    }

    async logout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
        
        localStorage.removeItem('authToken');
        window.location.href = '/';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AccountDetail();
});