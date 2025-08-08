// FX True Up Dashboard - Real Data Implementation
class RealDashboard {
    constructor() {
        this.token = null;
        this.user = null;
        this.accounts = [];
        this.analytics = null;
        this.charts = {};
        this.tradingCharts = new TradingCharts();
        this.loadingStates = new Set();
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
            const newUrl = urlParams.toString() ? `/dashboard?${urlParams.toString()}` : '/dashboard';
            window.history.replaceState({}, document.title, newUrl);
            this.token = tokenFromUrl;
            apiClient.setToken(tokenFromUrl);
        } else {
            this.token = localStorage.getItem('authToken');
            if (this.token) {
                apiClient.setToken(this.token);
            }
        }

        // Check authentication
        if (!this.token || !(await this.checkAuth())) {
            window.location.href = '/?auth=required';
            return;
        }

        this.initializeEventListeners();
        await this.loadUserData();
        await this.loadDashboardData();
        this.setupRealTimeUpdates();
    }

    async checkAuth() {
        try {
            const response = await apiClient.request('/auth/me');
            this.user = response;
            return true;
        } catch (error) {
            console.error('Auth check failed:', error);
            return false;
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

        // Add Account button - redirect to add-account page
        const addAccountBtn = document.getElementById('addAccountBtn');
        if (addAccountBtn) {
            addAccountBtn.addEventListener('click', () => {
                window.location.href = '/add-account';
            });
        }

        // Connect First Account button in empty state
        document.addEventListener('click', (e) => {
            if (e.target.closest('.bg-accent')) {
                window.location.href = '/add-account';
            }
        });

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshDashboard();
            });
        }
    }

    async loadUserData() {
        if (!this.user) return;

        // Update user info in UI
        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl) userNameEl.textContent = this.user.name || this.user.email.split('@')[0];
        if (userEmailEl) userEmailEl.textContent = this.user.email;
        if (userAvatarEl) {
            userAvatarEl.src = this.user.picture || 
                'https://ui-avatars.com/api/?name=' + encodeURIComponent(this.user.name || this.user.email) + '&background=1e40af&color=fff';
        }

        // Update subscription badge
        const subscriptionBadgeEl = document.getElementById('subscriptionBadge');
        if (subscriptionBadgeEl && this.user.subscription) {
            const subscription = this.user.subscription.toLowerCase();
            let badgeText = '';
            let badgeClass = '';
            
            switch (subscription) {
                case 'enterprise':
                    badgeText = 'Enterprise';
                    badgeClass = 'bg-purple-100 text-purple-800';
                    break;
                case 'premium':
                case 'pro':
                    badgeText = 'Premium';
                    badgeClass = 'bg-blue-100 text-blue-800';
                    break;
                case 'basic':
                    badgeText = 'Basic';
                    badgeClass = 'bg-green-100 text-green-800';
                    break;
                default:
                    badgeText = 'Free Trial';
                    badgeClass = 'bg-gray-200 text-gray-700';
            }
            
            subscriptionBadgeEl.textContent = badgeText;
            subscriptionBadgeEl.className = 'px-3 py-1 text-sm font-medium rounded-full ' + badgeClass;
        }

        if (this.user.isAdmin) {
            const adminMenu = document.getElementById('adminMenu');
            if (adminMenu) adminMenu.classList.remove('hidden');
        }
    }

    async loadDashboardData() {
        try {
            this.showLoading('dashboard');
            
            // Load accounts and analytics data in parallel
            const [accountsData, analyticsData] = await Promise.all([
                apiClient.getAccounts(false), // Force fresh data
                apiClient.getAnalytics('30d', false)
            ]);

            this.accounts = accountsData.accounts || [];
            this.analytics = analyticsData;

            // Update UI with real data
            await this.updateStats();
            await this.renderAccounts();
            await this.updatePerformanceChart();
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showError('Failed to load dashboard data. Please refresh the page.');
        } finally {
            this.hideLoading('dashboard');
        }
    }

    async updateStats() {
        if (!this.analytics) {
            console.warn('No analytics data available for stats');
            return;
        }

        try {
            // Update stat cards with real data
            const totalBalanceEl = document.querySelector('.fa-wallet')?.parentElement?.parentElement?.querySelector('dd');
            const monthlyReturnEl = document.querySelector('.fa-chart-line')?.parentElement?.parentElement?.querySelector('dd');
            const totalTradesEl = document.querySelector('.fa-exchange-alt')?.parentElement?.parentElement?.querySelector('dd');
            const activeAccountsEl = document.querySelector('.fa-server')?.parentElement?.parentElement?.querySelector('dd');

            if (totalBalanceEl) {
                totalBalanceEl.textContent = TradingStatistics.formatMetric(this.analytics.totalBalance || 0, 'currency');
            }

            if (monthlyReturnEl) {
                const returnPercent = this.calculateMonthlyReturn();
                monthlyReturnEl.textContent = TradingStatistics.formatMetric(returnPercent, 'percentage');
                monthlyReturnEl.className = returnPercent >= 0 ? 'text-green-600' : 'text-red-600';
            }

            if (totalTradesEl) {
                totalTradesEl.textContent = TradingStatistics.formatMetric(this.analytics.totalTrades || 0, 'integer');
            }

            if (activeAccountsEl) {
                const activeCount = this.accounts.filter(acc => acc.connectionMethod === 'metaapi').length;
                activeAccountsEl.textContent = activeCount.toString();
            }

        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    calculateMonthlyReturn() {
        if (!this.analytics || !this.analytics.totalBalance || this.analytics.totalBalance <= 0) {
            return 0;
        }

        // Calculate return based on total profit vs total balance
        const returnAmount = this.analytics.totalProfit || 0;
        const baseAmount = this.analytics.totalBalance - returnAmount;
        
        if (baseAmount <= 0) return 0;
        
        return (returnAmount / baseAmount) * 100;
    }

    async renderAccounts() {
        const accountsList = document.getElementById('accountsList');
        if (!accountsList) return;
        
        if (this.accounts.length === 0) {
            // Show empty state
            accountsList.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-link text-6xl text-gray-300 mb-4"></i>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">No accounts connected yet</h3>
                    <p class="text-gray-500 mb-4">Connect your MT4/MT5 accounts to start tracking performance</p>
                    <a href="/add-account" class="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition duration-200">
                        <i class="fas fa-plug mr-2"></i>Connect First Account
                    </a>
                </div>
            `;
        } else {
            // Show accounts list with real data
            const accountCards = await Promise.all(
                this.accounts.map(account => this.renderAccountCard(account))
            );
            
            accountsList.innerHTML = `
                <div class="grid gap-4">
                    ${accountCards.join('')}
                </div>
            `;
        }
    }

    async renderAccountCard(account) {
        try {
            let realTimeData = null;
            
            // Try to get real-time data for connected accounts
            if (account.connectionMethod === 'metaapi' && account.metaApiAccountId) {
                try {
                    realTimeData = await apiClient.getAccountInfo(account.metaApiAccountId, true);
                } catch (error) {
                    console.warn(`Failed to get real-time data for account ${account.id}:`, error);
                }
            }

            const isConnected = account.connectionMethod === 'metaapi';
            const balance = realTimeData?.balance || account.currentBalance || 0;
            const equity = realTimeData?.equity || account.equity || balance;
            const initialBalance = account.initialBalance || balance;
            const profit = equity - initialBalance;
            const profitPercent = initialBalance > 0 ? ((profit / initialBalance) * 100) : 0;

            return `
                <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition duration-200">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="text-lg font-semibold text-gray-900">
                                    <a href="/account-detail?id=${account.id}" class="hover:text-primary transition-colors">
                                        ${account.accountName || 'Unnamed Account'}
                                    </a>
                                </h4>
                                <div class="flex items-center space-x-2">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        isConnected 
                                            ? 'bg-green-100 text-green-800' 
                                            : 'bg-yellow-100 text-yellow-800'
                                    }">
                                        <i class="fas fa-${isConnected ? 'link' : 'edit'} mr-1"></i>
                                        ${isConnected ? 'Connected' : 'Manual'}
                                    </span>
                                    ${realTimeData ? '<i class="fas fa-circle text-green-500 text-xs" title="Real-time data"></i>' : ''}
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span class="text-gray-500">Login:</span>
                                    <span class="ml-1 font-medium">${account.login}</span>
                                </div>
                                <div>
                                    <span class="text-gray-500">Broker:</span>
                                    <span class="ml-1 font-medium">${account.brokerName || account.serverName || 'N/A'}</span>
                                </div>
                                <div>
                                    <span class="text-gray-500">Platform:</span>
                                    <span class="ml-1 font-medium">${account.accountType?.toUpperCase()}</span>
                                </div>
                                <div>
                                    <span class="text-gray-500">Balance:</span>
                                    <span class="ml-1 font-medium">${TradingStatistics.formatMetric(balance, 'currency')}</span>
                                </div>
                                ${realTimeData ? `
                                <div class="col-span-2">
                                    <span class="text-gray-500">Equity:</span>
                                    <span class="ml-1 font-medium">${TradingStatistics.formatMetric(equity, 'currency')}</span>
                                    <span class="text-gray-500 ml-4">Margin:</span>
                                    <span class="ml-1 font-medium">${TradingStatistics.formatMetric(realTimeData.margin || 0, 'currency')}</span>
                                </div>
                                ` : ''}
                            </div>

                            ${account.tags && account.tags.length > 0 ? `
                                <div class="mt-3 flex flex-wrap gap-1">
                                    ${account.tags.map(tag => `
                                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            ${tag}
                                        </span>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="ml-4 text-right">
                            <div class="text-2xl font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}">
                                ${profit >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%
                            </div>
                            <div class="text-sm text-gray-500">
                                ${profit >= 0 ? '+' : ''}${TradingStatistics.formatMetric(profit, 'currency')}
                            </div>
                            ${realTimeData?.unrealizedProfit ? `
                                <div class="text-xs ${realTimeData.unrealizedProfit >= 0 ? 'text-green-600' : 'text-red-600'}">
                                    Floating: ${TradingStatistics.formatMetric(realTimeData.unrealizedProfit, 'currency')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error rendering account card:', error);
            return this.renderFallbackAccountCard(account);
        }
    }

    renderFallbackAccountCard(account) {
        const isConnected = account.connectionMethod === 'metaapi';
        const balance = account.currentBalance || 0;
        const equity = account.equity || balance;
        const profit = equity - (account.initialBalance || balance);
        const profitPercent = account.initialBalance ? ((profit / account.initialBalance) * 100) : 0;

        return `
            <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition duration-200">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <div class="flex items-center justify-between mb-2">
                            <h4 class="text-lg font-semibold text-gray-900">
                                <a href="/account-detail?id=${account.id}" class="hover:text-primary transition-colors">
                                    ${account.accountName || 'Unnamed Account'}
                                </a>
                            </h4>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                isConnected 
                                    ? 'bg-yellow-100 text-yellow-800' 
                                    : 'bg-gray-100 text-gray-800'
                            }">
                                <i class="fas fa-${isConnected ? 'exclamation-triangle' : 'edit'} mr-1"></i>
                                ${isConnected ? 'Connection Error' : 'Manual'}
                            </span>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-500">Login:</span>
                                <span class="ml-1 font-medium">${account.login}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Balance:</span>
                                <span class="ml-1 font-medium">${TradingStatistics.formatMetric(balance, 'currency')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="ml-4 text-right">
                        <div class="text-2xl font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}">
                            ${profit >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%
                        </div>
                        <div class="text-sm text-gray-500">
                            ${profit >= 0 ? '+' : ''}${TradingStatistics.formatMetric(profit, 'currency')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async updatePerformanceChart() {
        const canvas = document.getElementById('performanceChart');
        const noDataMessage = document.getElementById('noDataMessage');
        const chartContainer = document.getElementById('performanceChartContainer');

        if (!canvas || !chartContainer) {
            console.warn('Performance chart container not found');
            return;
        }

        try {
            if (this.accounts.length === 0 || !this.analytics) {
                canvas.classList.add('hidden');
                if (noDataMessage) noDataMessage.classList.remove('hidden');
                return;
            }

            canvas.classList.remove('hidden');
            if (noDataMessage) noDataMessage.classList.add('hidden');

            // Get real performance data
            const performanceData = await apiClient.getPortfolioPerformance('30d');
            
            if (performanceData && performanceData.equity && performanceData.equity.length > 0) {
                // Use real data for lightweight charts
                this.tradingCharts.createProfitLossChart('performanceChart', performanceData.equity, {
                    height: 300
                });
            } else {
                // Fallback: create chart with analytics data
                await this.createFallbackPerformanceChart();
            }

        } catch (error) {
            console.error('Error updating performance chart:', error);
            await this.createFallbackPerformanceChart();
        }
    }

    async createFallbackPerformanceChart() {
        try {
            // Generate basic performance data from analytics
            const data = [];
            const now = new Date();
            let runningTotal = 0;
            
            for (let i = 29; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                
                // Use real data if available, otherwise simulate based on analytics
                const dailyChange = this.analytics ? 
                    (this.analytics.totalProfit / 30) : 
                    (-20 + Math.random() * 40); // -$20 to +$20 daily
                
                runningTotal += dailyChange;
                
                data.push({
                    time: date,
                    value: runningTotal
                });
            }

            this.tradingCharts.createProfitLossChart('performanceChart', data, {
                height: 300
            });

        } catch (error) {
            console.error('Error creating fallback performance chart:', error);
        }
    }

    async refreshDashboard() {
        try {
            this.showLoading('refresh');
            
            // Clear all caches
            apiClient.clearCache();
            
            // Reload all data
            await this.loadDashboardData();
            
            this.showSuccess('Dashboard data refreshed');
        } catch (error) {
            console.error('Error refreshing dashboard:', error);
            this.showError('Failed to refresh dashboard data');
        } finally {
            this.hideLoading('refresh');
        }
    }

    setupRealTimeUpdates() {
        // Update dashboard every 5 minutes
        setInterval(async () => {
            try {
                await this.loadDashboardData();
            } catch (error) {
                console.error('Real-time update failed:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes

        // Update stats every minute for connected accounts
        setInterval(async () => {
            try {
                await this.updateStats();
            } catch (error) {
                console.error('Stats update failed:', error);
            }
        }, 60 * 1000); // 1 minute
    }

    // UI Helper Methods
    showLoading(context) {
        this.loadingStates.add(context);
        // You could show a loading indicator here
    }

    hideLoading(context) {
        this.loadingStates.delete(context);
        // You could hide the loading indicator here
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type) {
        // Remove existing message
        const existingMessage = document.querySelector('.notification-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create new message
        const messageDiv = document.createElement('div');
        messageDiv.className = `notification-message fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
            type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`;
        messageDiv.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'} mr-2"></i>${message}`;
        document.body.appendChild(messageDiv);

        // Auto remove after 5 seconds
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }

    async logout() {
        try {
            await apiClient.logout();
        } catch (error) {
            console.error('Logout error:', error);
            // Force logout even if API call fails
            localStorage.removeItem('authToken');
            window.location.href = '/';
        }
    }

    // Cleanup method
    cleanup() {
        this.tradingCharts.cleanup();
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new RealDashboard();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.dashboard) {
        window.dashboard.cleanup();
    }
});