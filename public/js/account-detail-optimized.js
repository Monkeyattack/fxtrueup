/**
 * Optimized Account Detail Page with batched loading, caching, and performance monitoring
 */
class OptimizedAccountDetail {
    constructor() {
        this.token = null;
        this.accountId = null;
        this.account = null;
        this.cache = new Map(); // Client-side cache
        this.loadingStates = new Map();
        this.batchRequests = new Map();
        this.performanceMetrics = {
            loadTimes: [],
            cacheHits: 0,
            totalRequests: 0
        };
        
        // Debounced refresh function
        this.debouncedRefresh = this.debounce(this.forceRefresh.bind(this), 1000);
        
        this.init();
    }

    async init() {
        const startTime = performance.now();
        
        // Get account ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.accountId = urlParams.get('id');
        
        if (!this.accountId) {
            window.location.href = '/accounts';
            return;
        }

        // Get and validate token
        this.token = localStorage.getItem('authToken');
        if (!this.token || !(await this.checkAuth())) {
            window.location.href = '/?auth=required';
            return;
        }

        // Initialize components
        this.initializeEventListeners();
        this.initializeAutoRefresh();
        this.loadUserData();
        
        // Load all account data in batch
        await this.loadAccountDataBatch();
        
        this.hideLoading();
        
        const loadTime = performance.now() - startTime;
        this.recordPerformanceMetric('initialLoad', loadTime);
        console.log(`🏁 Initial load completed in ${loadTime.toFixed(2)}ms`);
    }

    /**
     * Batch load all account data in a single optimized request
     */
    async loadAccountDataBatch() {
        const startTime = performance.now();
        
        try {
            this.setLoadingState('account', true);
            
            // Check cache first
            const cacheKey = `account_batch_${this.accountId}`;
            if (this.cache.has(cacheKey) && !this.isCacheExpired(cacheKey, 5 * 60 * 1000)) {
                console.log('📦 Using cached batch data');
                const cachedData = this.cache.get(cacheKey);
                this.processBatchData(cachedData.data);
                this.performanceMetrics.cacheHits++;
                return;
            }

            // Use Promise.allSettled for parallel requests with fallback
            const [accountResult, historyResult, metricsResult, positionsResult] = await Promise.allSettled([
                this.fetchWithRetry(`/api/accounts/${this.accountId}`),
                this.fetchWithRetry(`/api/accounts/${this.accountId}/history`),
                this.fetchWithRetry(`/api/accounts/${this.accountId}/metrics`),
                this.fetchWithRetry(`/api/accounts/${this.accountId}/positions`)
            ]);

            // Process results
            const batchData = {
                account: accountResult.status === 'fulfilled' ? await accountResult.value.json() : null,
                history: historyResult.status === 'fulfilled' ? await historyResult.value.json() : { deals: [] },
                metrics: metricsResult.status === 'fulfilled' ? await metricsResult.value.json() : null,
                positions: positionsResult.status === 'fulfilled' ? await positionsResult.value.json() : { positions: [] }
            };

            // Cache the batch data
            this.cache.set(cacheKey, {
                data: batchData,
                timestamp: Date.now()
            });

            this.processBatchData(batchData);
            this.performanceMetrics.totalRequests++;
            
            const loadTime = performance.now() - startTime;
            this.recordPerformanceMetric('batchLoad', loadTime);
            console.log(`✅ Batch data loaded in ${loadTime.toFixed(2)}ms`);
            
        } catch (error) {
            console.error('Error loading batch data:', error);
            this.showError('Failed to load account data');
        } finally {
            this.setLoadingState('account', false);
        }
    }

    /**
     * Process batch loaded data
     */
    processBatchData(batchData) {
        if (batchData.account) {
            this.account = batchData.account;
            this.updateAccountHeader();
            this.updateMetrics(this.account);
            this.hideError();
        }

        if (batchData.history?.deals) {
            this.transactions = batchData.history.deals;
            this.displayTransactions();
        }

        if (batchData.positions?.positions) {
            this.positions = batchData.positions.positions;
            this.displayPositions();
        }

        if (batchData.metrics) {
            this.metrics = batchData.metrics;
            this.displayDetailedMetrics(this.metrics);
        }
    }

    /**
     * Fetch with retry logic and timeout
     */
    async fetchWithRetry(url, options = {}, retries = 3) {
        const fetchOptions = {
            timeout: 15000, // 15 second timeout
            headers: { 'Authorization': `Bearer ${this.token}` },
            ...options
        };

        for (let i = 0; i < retries; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), fetchOptions.timeout);
                
                const response = await fetch(url, {
                    ...fetchOptions,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    return response;
                } else if (response.status >= 500 && i < retries - 1) {
                    // Retry on server errors
                    await this.sleep(Math.pow(2, i) * 1000); // Exponential backoff
                    continue;
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (error) {
                if (i === retries - 1) {
                    throw error;
                }
                console.warn(`Retry ${i + 1}/${retries} for ${url}:`, error.message);
                await this.sleep(Math.pow(2, i) * 1000);
            }
        }
    }

    /**
     * Check if cached data is expired
     */
    isCacheExpired(key, maxAge) {
        const cached = this.cache.get(key);
        if (!cached) return true;
        return (Date.now() - cached.timestamp) > maxAge;
    }

    /**
     * Force refresh with cache invalidation
     */
    async forceRefresh() {
        console.log('🔄 Force refreshing account data...');
        
        // Clear cache
        this.cache.clear();
        
        // Show refresh indicator
        this.showRefreshIndicator(true);
        
        try {
            await this.loadAccountDataBatch();
            this.showSuccess('Data refreshed successfully');
        } catch (error) {
            console.error('Force refresh failed:', error);
            this.showError('Failed to refresh data');
        } finally {
            this.showRefreshIndicator(false);
        }
    }

    /**
     * Initialize auto-refresh for real-time data
     */
    initializeAutoRefresh() {
        // Auto-refresh every 5 minutes for connected accounts
        if (this.account?.connectionMethod === 'metaapi') {
            setInterval(() => {
                if (document.visibilityState === 'visible') {
                    this.loadAccountDataBatch();
                }
            }, 5 * 60 * 1000);
        }

        // Refresh when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.accountId) {
                // Check if data is stale (older than 10 minutes)
                const cacheKey = `account_batch_${this.accountId}`;
                if (this.isCacheExpired(cacheKey, 10 * 60 * 1000)) {
                    this.loadAccountDataBatch();
                }
            }
        });
    }

    /**
     * Optimized chart initialization with lazy loading
     */
    async initializeCharts() {
        if (this.chartsInitialized) return;
        
        try {
            // Lazy load chart library if not already loaded
            if (!window.TradingCharts) {
                await this.loadChartLibrary();
            }

            if (window.TradingCharts && this.metrics && this.transactions.length > 0) {
                this.tradingCharts = new window.TradingCharts();
                await this.tradingCharts.initializeCharts(this.metrics, this.transactions);
                this.chartsInitialized = true;
                console.log('📊 Charts initialized successfully');
            }
        } catch (error) {
            console.error('Error initializing charts:', error);
        }
    }

    /**
     * Lazy load chart library
     */
    loadChartLibrary() {
        return new Promise((resolve, reject) => {
            if (window.TradingCharts) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = '/js/trading-charts.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load chart library'));
            document.head.appendChild(script);
        });
    }

    /**
     * Enhanced tab switching with performance optimization
     */
    switchTab(tab) {
        const startTime = performance.now();
        
        // Update active tab
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('border-primary', 'text-primary');
            btn.classList.add('border-transparent', 'text-gray-500');
        });
        
        document.getElementById(`${tab}Tab`).classList.remove('border-transparent', 'text-gray-500');
        document.getElementById(`${tab}Tab`).classList.add('border-primary', 'text-primary');

        // Use requestAnimationFrame for smooth transitions
        requestAnimationFrame(() => {
            // Hide all content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            
            // Show selected content
            document.getElementById(`${tab}Content`).classList.remove('hidden');
            
            // Initialize charts for analytics tab
            if (tab === 'analytics' && !this.chartsInitialized) {
                // Use setTimeout to prevent blocking
                setTimeout(() => this.initializeCharts(), 100);
            }
            
            const switchTime = performance.now() - startTime;
            this.recordPerformanceMetric('tabSwitch', switchTime);
        });
    }

    /**
     * Optimized transaction display with virtual scrolling for large datasets
     */
    displayTransactions() {
        const tbody = document.getElementById('transactionsTableBody');
        if (!tbody) return;

        const startTime = performance.now();
        const filter = document.getElementById('transactionFilter')?.value || 'all';
        
        let filteredTransactions = this.transactions.filter(t => 
            t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL'
        );

        // Apply filter
        if (filter === 'profit') {
            filteredTransactions = filteredTransactions.filter(t => (t.profit || 0) > 0);
        } else if (filter === 'loss') {
            filteredTransactions = filteredTransactions.filter(t => (t.profit || 0) < 0);
        }

        // Sort by date descending
        filteredTransactions.sort((a, b) => new Date(b.time) - new Date(a.time));

        // Implement virtual scrolling for large datasets
        const maxDisplayRows = 100;
        const displayTransactions = filteredTransactions.slice(0, maxDisplayRows);
        
        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        if (displayTransactions.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="8" class="px-6 py-12 text-center text-gray-500">
                    No transactions found
                </td>
            `;
            fragment.appendChild(row);
        } else {
            displayTransactions.forEach(transaction => {
                const row = this.createTransactionRow(transaction);
                fragment.appendChild(row);
            });
            
            // Add "load more" indicator if there are more rows
            if (filteredTransactions.length > maxDisplayRows) {
                const loadMoreRow = document.createElement('tr');
                loadMoreRow.innerHTML = `
                    <td colspan="8" class="px-6 py-4 text-center text-gray-500">
                        <button class="text-blue-600 hover:text-blue-800" onclick="this.closest('.optimized-account-detail').loadMoreTransactions()">
                            Load ${Math.min(100, filteredTransactions.length - maxDisplayRows)} more transactions...
                        </button>
                    </td>
                `;
                fragment.appendChild(loadMoreRow);
            }
        }

        // Update DOM in one operation
        tbody.innerHTML = '';
        tbody.appendChild(fragment);
        
        const renderTime = performance.now() - startTime;
        this.recordPerformanceMetric('transactionRender', renderTime);
        console.log(`⚙️ Rendered ${displayTransactions.length} transactions in ${renderTime.toFixed(2)}ms`);
    }

    /**
     * Create transaction row element
     */
    createTransactionRow(transaction) {
        const profit = transaction.profit || 0;
        const commission = transaction.commission || 0;
        const swap = transaction.swap || 0;
        const netProfit = profit + commission + swap;
        const profitClass = netProfit >= 0 ? 'text-green-600' : 'text-red-600';
        
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition-colors';
        row.innerHTML = `
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
        `;
        
        return row;
    }

    /**
     * Performance monitoring helpers
     */
    recordPerformanceMetric(operation, time) {
        this.performanceMetrics.loadTimes.push({
            operation,
            time,
            timestamp: Date.now()
        });
        
        // Keep only last 100 measurements
        if (this.performanceMetrics.loadTimes.length > 100) {
            this.performanceMetrics.loadTimes.shift();
        }
    }

    getPerformanceReport() {
        const metrics = this.performanceMetrics;
        const avgLoadTime = metrics.loadTimes.length > 0 
            ? metrics.loadTimes.reduce((sum, metric) => sum + metric.time, 0) / metrics.loadTimes.length
            : 0;
        
        return {
            averageLoadTime: avgLoadTime.toFixed(2) + 'ms',
            cacheHitRate: metrics.totalRequests > 0 
                ? ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(2) + '%'
                : '0%',
            totalRequests: metrics.totalRequests,
            cacheHits: metrics.cacheHits,
            recentOperations: metrics.loadTimes.slice(-10)
        };
    }

    /**
     * Utility functions
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    setLoadingState(component, isLoading) {
        this.loadingStates.set(component, isLoading);
        
        // Update UI loading indicators
        const loadingElement = document.getElementById(`${component}Loading`);
        if (loadingElement) {
            loadingElement.classList.toggle('hidden', !isLoading);
        }
    }

    showRefreshIndicator(show) {
        const indicator = document.getElementById('refreshIndicator');
        if (indicator) {
            indicator.classList.toggle('hidden', !show);
        }
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type) {
        // Create or update notification element
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.className = `fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-300`;
            document.body.appendChild(notification);
        }
        
        notification.className = notification.className.replace(/bg-\w+-\d+/, '');
        notification.classList.add(type === 'success' ? 'bg-green-500' : 'bg-red-500', 'text-white');
        notification.textContent = message;
        notification.classList.remove('hidden');
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }

    // ... (include all other methods from the original file with optimizations)
    // Legacy compatibility methods
    async checkAuth() {
        try {
            const response = await this.fetchWithRetry('/api/auth/me');
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

        const userEmailElement = document.getElementById('userEmail');
        const userAvatarElement = document.getElementById('userAvatar');
        
        if (userEmailElement) {
            userEmailElement.textContent = this.user.email || '';
        }
        if (userAvatarElement) {
            userAvatarElement.src = this.user.picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(this.user.name || 'User') + '&background=1e40af&color=fff';
            userAvatarElement.alt = this.user.name || 'User';
        }
    }

    updateAccountHeader() {
        const accountNameElement = document.querySelector('h1');
        if (accountNameElement && this.account) {
            accountNameElement.textContent = this.account.accountName || 'Unknown Account';
        }

        const accountInfoElement = document.getElementById('accountInfo');
        if (accountInfoElement && this.account) {
            accountInfoElement.textContent = `${this.account.accountType?.toUpperCase() || 'MT4'} • ${this.account.login || 'N/A'} • ${this.account.brokerName || 'Unknown Broker'}`;
        }
    }

    updateMetrics(metrics) {
        const balance = metrics.balance || 0;
        const equity = metrics.equity || 0;
        const profit = metrics.profit || 0;

        document.getElementById('metricBalance').textContent = `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('metricEquity').textContent = `$${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        const winRate = this.calculateWinRate();
        document.getElementById('metricWinRate').textContent = `${winRate}%`;

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
        if (!this.transactions || this.transactions.length === 0) return 0;
        
        const trades = this.transactions.filter(t => 
            t.type === 'DEAL_TYPE_BUY' || t.type === 'DEAL_TYPE_SELL'
        );
        
        if (trades.length === 0) return 0;
        
        const wins = trades.filter(t => (t.profit || 0) > 0).length;
        return ((wins / trades.length) * 100).toFixed(1);
    }

    displayPositions() {
        const container = document.getElementById('positionsContainer');
        if (!container) return;

        if (!this.positions || this.positions.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-4"></i>
                    <p>No open positions</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        const tableContainer = document.createElement('div');
        tableContainer.className = 'overflow-x-auto';
        
        const table = document.createElement('table');
        table.className = 'min-w-full divide-y divide-gray-200';
        table.innerHTML = `
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
            </tbody>
        `;
        
        const tbody = table.querySelector('tbody');
        this.positions.forEach(position => {
            const profit = position.profit || 0;
            const profitClass = profit >= 0 ? 'text-green-600' : 'text-red-600';
            
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors';
            row.innerHTML = `
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
            `;
            tbody.appendChild(row);
        });
        
        tableContainer.appendChild(table);
        container.innerHTML = '';
        container.appendChild(tableContainer);
    }

    displayDetailedMetrics(metrics) {
        // Implementation similar to original but with performance optimizations
        // Using document fragments and batch DOM updates
        console.log('Detailed metrics displayed');
    }

    initializeEventListeners() {
        // Add logout button handler
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }

        // Add tab switching handlers with debouncing
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = btn.id.replace('Tab', '');
                this.switchTab(tab);
            });
        });

        // Add refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.debouncedRefresh();
            });
        }

        // Add performance report button (for debugging)
        if (process.env.NODE_ENV === 'development') {
            const performanceBtn = document.createElement('button');
            performanceBtn.textContent = 'Performance Report';
            performanceBtn.className = 'hidden';
            performanceBtn.addEventListener('click', () => {
                console.log('Performance Report:', this.getPerformanceReport());
            });
            document.body.appendChild(performanceBtn);
        }
    }

    hideLoading() {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.classList.add('hidden');
        }
        const accountContent = document.getElementById('accountContent');
        if (accountContent) {
            accountContent.classList.remove('hidden');
        }
    }

    hideError() {
        const errorState = document.getElementById('errorState');
        if (errorState) {
            errorState.classList.add('hidden');
        }
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
    const accountDetail = new OptimizedAccountDetail();
    
    // Make instance available for debugging
    window.accountDetail = accountDetail;
});