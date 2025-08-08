/**
 * API Client for Real Data Fetching
 * Handles all API calls to fetch real MetaAPI data instead of mock data
 */

class APIClient {
    constructor() {
        this.baseURL = '/api';
        this.token = localStorage.getItem('authToken');
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Set authentication token
     */
    setToken(token) {
        this.token = token;
        localStorage.setItem('authToken', token);
    }

    /**
     * Get authentication headers
     */
    getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }

    /**
     * Generic API request method
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const config = {
            ...options,
            headers: {
                ...this.getAuthHeaders(),
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired or invalid
                    localStorage.removeItem('authToken');
                    window.location.href = '/?auth=required';
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`API request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    /**
     * Get data with caching
     */
    async getCachedData(cacheKey, fetchFunction) {
        const cached = this.cache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const data = await fetchFunction();
            this.cache.set(cacheKey, {
                data: data,
                timestamp: now
            });
            return data;
        } catch (error) {
            // Return cached data if available, even if expired
            if (cached) {
                console.warn('Using expired cache due to API error:', error);
                return cached.data;
            }
            throw error;
        }
    }

    /**
     * Clear cache for specific key or all cache
     */
    clearCache(key = null) {
        if (key) {
            this.cache.delete(key);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Get user accounts with real data
     */
    async getAccounts(useCache = true) {
        const cacheKey = 'accounts';
        
        if (!useCache) {
            this.clearCache(cacheKey);
        }

        return this.getCachedData(cacheKey, async () => {
            return await this.request('/accounts');
        });
    }

    /**
     * Get account details with real trading data
     */
    async getAccountDetails(accountId, useCache = true) {
        const cacheKey = `account-${accountId}`;
        
        if (!useCache) {
            this.clearCache(cacheKey);
        }

        return this.getCachedData(cacheKey, async () => {
            return await this.request(`/api/accounts/${accountId}/details`);
        });
    }

    /**
     * Get account deals (trading history)
     */
    async getAccountDeals(accountId, options = {}) {
        const { startDate, endDate, limit = 1000 } = options;
        let endpoint = `/api/accounts/${accountId}/deals?limit=${limit}`;
        
        if (startDate) {
            endpoint += `&startDate=${startDate}`;
        }
        if (endDate) {
            endpoint += `&endDate=${endDate}`;
        }

        const cacheKey = `deals-${accountId}-${startDate}-${endDate}-${limit}`;
        
        return this.getCachedData(cacheKey, async () => {
            return await this.request(endpoint);
        });
    }

    /**
     * Get account positions (open trades)
     */
    async getAccountPositions(accountId, useCache = true) {
        const cacheKey = `positions-${accountId}`;
        
        if (!useCache) {
            this.clearCache(cacheKey);
        }

        return this.getCachedData(cacheKey, async () => {
            return await this.request(`/api/accounts/${accountId}/positions`);
        });
    }

    /**
     * Get analytics data for dashboard and analytics page
     */
    async getAnalytics(period = '30d', useCache = true) {
        const cacheKey = `analytics-${period}`;
        
        if (!useCache) {
            this.clearCache(cacheKey);
        }

        return this.getCachedData(cacheKey, async () => {
            return await this.request(`/api/analytics?period=${period}`);
        });
    }

    /**
     * Get portfolio performance data for charts
     */
    async getPortfolioPerformance(period = '30d', accountIds = []) {
        let endpoint = `/api/analytics/performance?period=${period}`;
        
        if (accountIds.length > 0) {
            endpoint += `&accounts=${accountIds.join(',')}`;
        }

        const cacheKey = `performance-${period}-${accountIds.join(',')}`;
        
        return this.getCachedData(cacheKey, async () => {
            return await this.request(endpoint);
        });
    }

    /**
     * Get trade distribution data
     */
    async getTradeDistribution(accountId, options = {}) {
        const { groupBy = 'symbol', period = '30d' } = options;
        const endpoint = `/api/accounts/${accountId}/distribution?groupBy=${groupBy}&period=${period}`;
        
        const cacheKey = `distribution-${accountId}-${groupBy}-${period}`;
        
        return this.getCachedData(cacheKey, async () => {
            return await this.request(endpoint);
        });
    }

    /**
     * Get account metrics with real calculations
     */
    async getAccountMetrics(accountId, period = '30d') {
        const cacheKey = `metrics-${accountId}-${period}`;
        
        return this.getCachedData(cacheKey, async () => {
            return await this.request(`/api/accounts/${accountId}/metrics?period=${period}`);
        });
    }

    /**
     * Get multiple accounts comparison data
     */
    async getAccountsComparison(accountIds, period = '30d') {
        const endpoint = `/api/analytics/comparison?accounts=${accountIds.join(',')}&period=${period}`;
        const cacheKey = `comparison-${accountIds.join(',')}-${period}`;
        
        return this.getCachedData(cacheKey, async () => {
            return await this.request(endpoint);
        });
    }

    /**
     * Get drawdown analysis
     */
    async getDrawdownAnalysis(accountId, period = '30d') {
        const cacheKey = `drawdown-${accountId}-${period}`;
        
        return this.getCachedData(cacheKey, async () => {
            return await this.request(`/api/accounts/${accountId}/drawdown?period=${period}`);
        });
    }

    /**
     * Get risk metrics
     */
    async getRiskMetrics(accountId, period = '30d') {
        const cacheKey = `risk-${accountId}-${period}`;
        
        return this.getCachedData(cacheKey, async () => {
            return await this.request(`/api/accounts/${accountId}/risk?period=${period}`);
        });
    }

    /**
     * Get real-time account information
     */
    async getAccountInfo(accountId, useCache = false) {
        const cacheKey = `info-${accountId}`;
        
        if (!useCache) {
            this.clearCache(cacheKey);
        }

        return this.getCachedData(cacheKey, async () => {
            return await this.request(`/api/accounts/${accountId}/info`);
        });
    }

    /**
     * Refresh all account data (invalidate cache)
     */
    async refreshAccountData(accountId) {
        // Clear all related cache entries
        const keysToDelete = [];
        for (let key of this.cache.keys()) {
            if (key.includes(accountId) || key === 'accounts' || key.includes('analytics')) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.cache.delete(key));

        // Fetch fresh data
        return await this.getAccountDetails(accountId, false);
    }

    /**
     * Get system health status
     */
    async getHealthStatus() {
        return await this.request('/health', { 
            headers: {} // No auth required for health check
        });
    }

    /**
     * Batch request multiple endpoints
     */
    async batchRequest(requests) {
        const promises = requests.map(({ endpoint, options }) => 
            this.request(endpoint, options).catch(error => ({ error, endpoint }))
        );
        
        return await Promise.all(promises);
    }

    /**
     * Subscribe to real-time updates (if WebSocket available)
     */
    subscribeToUpdates(accountId, callback) {
        // This would implement WebSocket connection for real-time updates
        // For now, we'll use polling as a fallback
        const interval = setInterval(async () => {
            try {
                const data = await this.getAccountInfo(accountId, false);
                callback(data);
            } catch (error) {
                console.error('Real-time update failed:', error);
            }
        }, 30000); // Update every 30 seconds

        return () => clearInterval(interval);
    }

    /**
     * Format API error for display
     */
    formatError(error) {
        if (error.message) {
            return error.message;
        }
        
        if (typeof error === 'string') {
            return error;
        }
        
        return 'An unexpected error occurred';
    }

    /**
     * Check if we have valid authentication
     */
    isAuthenticated() {
        return !!this.token;
    }

    /**
     * Logout and clear token
     */
    async logout() {
        try {
            await this.request('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout API call failed:', error);
        } finally {
            this.token = null;
            localStorage.removeItem('authToken');
            this.clearCache();
            window.location.href = '/';
        }
    }
}

// Create singleton instance
const apiClient = new APIClient();

// Export for use in other modules
window.APIClient = APIClient;
window.apiClient = apiClient;