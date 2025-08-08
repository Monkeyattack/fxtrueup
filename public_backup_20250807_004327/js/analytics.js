// Analytics Management
class AnalyticsManager {
    constructor() {
        this.token = null;
        this.user = null;
        this.accounts = [];
        this.currentPeriod = 7;
        this.charts = {};
        this.init();
    }

    async init() {
        // Get token from URL or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('token');
        
        if (tokenFromUrl) {
            // Store token and clean URL
            localStorage.setItem('authToken', tokenFromUrl);
            urlParams.delete('token');
            const newUrl = urlParams.toString() ? `/analytics?${urlParams.toString()}` : '/analytics';
            window.history.replaceState({}, document.title, newUrl);
            this.token = tokenFromUrl;
        } else {
            this.token = localStorage.getItem('authToken');
        }

        // Check authentication
        if (!this.token || !(await this.checkAuth())) {
            window.location.href = '/?auth=required';
            return;
        }

        this.initializeEventListeners();
        this.loadUserData();
        this.loadAnalyticsData();
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
            return false;
        }
    }

    loadUserData() {
        if (!this.user) return;

        document.getElementById('userEmail').textContent = this.user.email;
        document.getElementById('userAvatar').src = this.user.picture || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(this.user.name || this.user.email)}&background=1e40af&color=fff`;

        if (this.user.isAdmin) {
            document.getElementById('adminMenu').classList.remove('hidden');
        }
    }

    initializeEventListeners() {
        // User menu
        const userMenuBtn = document.getElementById('userMenuBtn');
        const userDropdown = document.getElementById('userDropdown');
        
        if (userMenuBtn) {
            userMenuBtn.addEventListener('click', () => {
                userDropdown.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!userMenuBtn.contains(e.target)) {
                    userDropdown.classList.add('hidden');
                }
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }

        // Period buttons
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                document.querySelectorAll('.period-btn').forEach(b => {
                    b.classList.remove('active', 'bg-primary', 'text-white');
                    b.classList.add('bg-gray-100', 'text-gray-700');
                });
                btn.classList.add('active', 'bg-primary', 'text-white');
                btn.classList.remove('bg-gray-100', 'text-gray-700');

                // Update period and reload data
                this.currentPeriod = parseInt(btn.getAttribute('data-period'));
                this.loadAnalyticsData();
            });
        });
    }

    async loadAnalyticsData() {
        try {
            // Load accounts first
            const accountsResponse = await fetch('/api/accounts', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (accountsResponse.ok) {
                const accountsData = await accountsResponse.json();
                this.accounts = accountsData.accounts || [];
                
                // Generate analytics data
                this.generateAnalytics();
                this.updateMetrics();
                this.updateCharts();
                this.updateCategoryPerformance();
                this.updateStatsTable();
            } else {
                console.error('Failed to load accounts');
            }
        } catch (error) {
            console.error('Error loading analytics data:', error);
        }
    }

    generateAnalytics() {
        // Generate mock analytics data based on accounts
        this.analytics = {
            totalPL: 0,
            winRate: 0,
            totalTrades: 0,
            profitFactor: 0,
            categories: {},
            accountPerformance: {},
            plHistory: [],
            trades: {
                winning: 0,
                losing: 0
            }
        };

        this.accounts.forEach(account => {
            // Mock some trading data for each account
            const mockTrades = Math.floor(Math.random() * 100) + 20;
            const mockWinRate = 0.4 + Math.random() * 0.4; // 40-80% win rate
            const mockPL = -5000 + Math.random() * 15000; // -$5k to +$10k
            
            this.analytics.totalTrades += mockTrades;
            this.analytics.totalPL += mockPL;
            
            const winningTrades = Math.floor(mockTrades * mockWinRate);
            const losingTrades = mockTrades - winningTrades;
            
            this.analytics.trades.winning += winningTrades;
            this.analytics.trades.losing += losingTrades;

            // Category performance
            if (account.tags) {
                account.tags.forEach(tag => {
                    if (!this.analytics.categories[tag]) {
                        this.analytics.categories[tag] = { pl: 0, trades: 0 };
                    }
                    this.analytics.categories[tag].pl += mockPL / account.tags.length;
                    this.analytics.categories[tag].trades += Math.floor(mockTrades / account.tags.length);
                });
            }

            // Account performance
            this.analytics.accountPerformance[account.accountName || account.id] = {
                pl: mockPL,
                trades: mockTrades,
                winRate: mockWinRate
            };
        });

        // Calculate derived metrics
        this.analytics.winRate = this.analytics.totalTrades > 0 
            ? (this.analytics.trades.winning / this.analytics.totalTrades) * 100 
            : 0;

        const totalWinnings = this.analytics.trades.winning * 150; // Avg $150 win
        const totalLosses = Math.abs(this.analytics.trades.losing * 80); // Avg $80 loss
        this.analytics.profitFactor = totalLosses > 0 ? totalWinnings / totalLosses : 0;

        // Generate P&L history
        this.generatePLHistory();
    }

    generatePLHistory() {
        const days = this.currentPeriod;
        const history = [];
        let cumulativePL = 0;
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            
            // Generate daily P&L (-200 to +300)
            const dailyPL = -200 + Math.random() * 500;
            cumulativePL += dailyPL;
            
            history.push({
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                pl: cumulativePL,
                dailyPL: dailyPL
            });
        }
        
        this.analytics.plHistory = history;
    }

    updateMetrics() {
        document.getElementById('totalPL').textContent = 
            `$${this.analytics.totalPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('totalPL').className = 
            `text-2xl font-semibold ${this.analytics.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`;

        document.getElementById('winRate').textContent = `${this.analytics.winRate.toFixed(1)}%`;
        document.getElementById('totalTrades').textContent = this.analytics.totalTrades.toLocaleString();
        document.getElementById('profitFactor').textContent = this.analytics.profitFactor.toFixed(2);
    }

    updateCharts() {
        this.updatePLChart();
        this.updateWinLossChart();
        this.updateAccountComparisonChart();
    }

    updatePLChart() {
        const ctx = document.getElementById('plChart').getContext('2d');
        
        if (this.charts.plChart) {
            this.charts.plChart.destroy();
        }

        this.charts.plChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.analytics.plHistory.map(h => h.date),
                datasets: [{
                    label: 'Cumulative P&L',
                    data: this.analytics.plHistory.map(h => h.pl),
                    borderColor: this.analytics.totalPL >= 0 ? '#10b981' : '#ef4444',
                    backgroundColor: this.analytics.totalPL >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { display: true },
                    y: {
                        display: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    updateWinLossChart() {
        const ctx = document.getElementById('winLossChart').getContext('2d');
        
        if (this.charts.winLossChart) {
            this.charts.winLossChart.destroy();
        }

        this.charts.winLossChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Winning Trades', 'Losing Trades'],
                datasets: [{
                    data: [this.analytics.trades.winning, this.analytics.trades.losing],
                    backgroundColor: ['#10b981', '#ef4444'],
                    borderWidth: 0
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

    updateAccountComparisonChart() {
        const ctx = document.getElementById('accountComparisonChart').getContext('2d');
        
        if (this.charts.accountChart) {
            this.charts.accountChart.destroy();
        }

        const accountNames = Object.keys(this.analytics.accountPerformance);
        const accountPLs = accountNames.map(name => this.analytics.accountPerformance[name].pl);

        this.charts.accountChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: accountNames,
                datasets: [{
                    label: 'Account P&L',
                    data: accountPLs,
                    backgroundColor: accountPLs.map(pl => pl >= 0 ? '#10b981' : '#ef4444'),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { display: true },
                    y: {
                        display: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    updateCategoryPerformance() {
        const container = document.getElementById('categoryPerformance');
        const categories = Object.keys(this.analytics.categories);

        if (categories.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-8">No category data available</p>';
            return;
        }

        container.innerHTML = categories.map(category => {
            const data = this.analytics.categories[category];
            const plClass = data.pl >= 0 ? 'text-green-600' : 'text-red-600';
            const percentage = this.analytics.totalTrades > 0 ? ((data.trades / this.analytics.totalTrades) * 100) : 0;

            return `
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                        <h4 class="font-semibold text-gray-900 capitalize">${category}</h4>
                        <p class="text-sm text-gray-500">${data.trades} trades (${percentage.toFixed(1)}%)</p>
                    </div>
                    <div class="text-right">
                        <p class="font-semibold ${plClass}">
                            ${data.pl >= 0 ? '+' : ''}$${data.pl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateStatsTable() {
        const tbody = document.getElementById('statsTableBody');
        const stats = [
            { metric: 'Average Trade', value: `$${(this.analytics.totalPL / Math.max(this.analytics.totalTrades, 1)).toFixed(2)}`, description: 'Average profit/loss per trade' },
            { metric: 'Best Trade', value: '$347.50', description: 'Highest single trade profit' },
            { metric: 'Worst Trade', value: '-$189.25', description: 'Largest single trade loss' },
            { metric: 'Max Drawdown', value: '8.7%', description: 'Maximum peak-to-trough decline' },
            { metric: 'Sharpe Ratio', value: '1.23', description: 'Risk-adjusted return measure' },
            { metric: 'Average Hold Time', value: '2.4 hours', description: 'Average position duration' }
        ];

        tbody.innerHTML = stats.map(stat => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${stat.metric}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${stat.value}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${stat.description}</td>
            </tr>
        `).join('');
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
    new AnalyticsManager();
});