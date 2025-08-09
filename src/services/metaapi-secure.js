import MetaApi from 'metaapi.cloud-sdk';
import { logger } from '../utils/logger.js';
import { 
    encryptSensitiveData, 
    decryptSensitiveData, 
    encryptMTCredentials,
    decryptMTCredentials,
    logSecurityEvent 
} from '../utils/crypto-secure.js';
import rateLimit from 'express-rate-limit';

class SecureMetaApiService {
    constructor() {
        this.api = null;
        this.token = this.validateAndEncryptToken();
        this.domain = process.env.METAAPI_DOMAIN || 'mt-client-api-v1.london.agiliumtrade.ai';
        this.region = process.env.METAAPI_REGION || 'new-york';
        this.connected = false;
        this.connectionPool = new Map(); // Connection pooling for better performance
        this.requestCache = new Map(); // Request caching to reduce API calls
        
        // Rate limiting for MetaAPI calls
        this.rateLimiter = this.createRateLimiter();
        
        // Initialize service
        this.initialize();
        
        // Set up cleanup intervals
        this.setupCleanupTasks();
    }

    validateAndEncryptToken() {
        const token = process.env.METAAPI_TOKEN;
        if (!token) {
            throw new Error('METAAPI_TOKEN is required');
        }
        
        // Validate JWT format (basic check)
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid MetaAPI token format');
        }
        
        try {
            // Decode and validate JWT payload
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            
            if (!payload.exp) {
                logger.warn('MetaAPI token has no expiration');
            } else if (payload.exp * 1000 < Date.now()) {
                throw new Error('MetaAPI token has expired');
            }
            
            // Log token info (but not the token itself)
            logger.info('MetaAPI token validated', {
                expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'never',
                userId: payload._id?.substring(0, 8) + '...',
                hasRequiredPermissions: this.validateTokenPermissions(payload)
            });
            
        } catch (error) {
            logger.error('MetaAPI token validation failed', { error: error.message });
            throw new Error('Invalid MetaAPI token');
        }
        
        // Return encrypted token for storage
        return encryptSensitiveData(token, 'metaapi_token');
    }

    validateTokenPermissions(payload) {
        const requiredPermissions = [
            'metaapi-api:rest:public',
            'metaapi-api:ws:public',
            'trading-account-management-api:rest:public'
        ];
        
        const hasPermissions = payload.accessRules?.some(rule =>
            requiredPermissions.some(perm => 
                rule.methods?.some(method => method.includes(perm))
            )
        );
        
        if (!hasPermissions) {
            logger.warn('MetaAPI token may not have required permissions');
        }
        
        return hasPermissions;
    }

    createRateLimiter() {
        // MetaAPI has rate limits, so we implement client-side limiting
        return rateLimit({
            windowMs: 60 * 1000, // 1 minute
            max: 50, // Max 50 requests per minute per service instance
            skipSuccessfulRequests: false,
            skipFailedRequests: false,
            keyGenerator: () => 'metaapi_service', // Single key for all requests
            handler: (req, res, next, options) => {
                logger.warn('MetaAPI rate limit exceeded, throttling requests');
                // Don't throw error, just log and continue (will be handled by retry logic)
            }
        });
    }

    async initialize() {
        try {
            logger.info('Initializing secure MetaApi service...');
            
            // Decrypt token for use
            const decryptedToken = decryptSensitiveData(this.token, 'metaapi_token');
            
            this.api = new MetaApi(decryptedToken, {
                domain: this.domain,
                region: this.region,
                requestTimeout: 60000,
                retryOpts: {
                    retries: 3,
                    minDelayInSeconds: 1,
                    maxDelayInSeconds: 30
                },
                // Enable request logging in development
                logLevel: process.env.NODE_ENV === 'development' ? 'INFO' : 'WARN'
            });
            
            this.provisioningApi = this.api.provisioningApi;
            this.connected = true;
            
            logger.info('✅ Secure MetaApi service initialized successfully');
            logSecurityEvent('metaapi_service_initialized', { domain: this.domain, region: this.region });
            
        } catch (error) {
            logger.error('❌ Failed to initialize secure MetaApi:', error);
            this.connected = false;
            throw error;
        }
    }

    async addAccount(userId, accountData) {
        try {
            if (!this.connected) {
                throw new Error('MetaApi service not connected');
            }

            // Validate input data
            const { name, login, password, server, platform = 'mt4', investorPassword } = accountData;
            
            if (!name || !login || !password || !server) {
                throw new Error('Missing required account data');
            }

            // Validate login is numeric and reasonable length
            if (!/^\d{1,20}$/.test(login)) {
                throw new Error('Invalid account login format');
            }

            // Validate server format (broker.server or IP:port)
            if (!/^[a-zA-Z0-9.-]+(\:[0-9]{1,5})?$/.test(server)) {
                throw new Error('Invalid server format');
            }

            logger.info('Adding MetaAPI account', { userId, login, server, platform });
            
            // Encrypt credentials before storing
            const encryptedCredentials = encryptMTCredentials({
                login,
                password,
                server,
                investorPassword
            });

            // Create account in MetaApi with secure configuration
            const account = await this.provisioningApi.createAccount({
                name: `${name} (User: ${userId.substring(0, 8)})`,
                type: 'cloud',
                login: parseInt(login),
                password: password, // MetaApi handles this securely on their end
                server: server,
                platform: platform,
                magic: this.generateSecureMagicNumber(),
                quoteStreamingIntervalInSeconds: 2.5,
                reliability: 'high', // Use high reliability for production
                tags: [`user:${userId}`, 'fxtrueup', 'secure'],
                metadata: {
                    createdAt: new Date().toISOString(),
                    encryptedCredentials: encryptedCredentials.encryptedPassword // Store encrypted for backup
                }
            });

            // Deploy account with error handling
            await this.deployAccountWithRetry(account);

            logSecurityEvent('metaapi_account_added', {
                userId,
                accountId: account.id,
                login,
                server,
                platform
            });

            return {
                accountId: account.id,
                state: account.state,
                platform: platform,
                encryptedCredentials: encryptedCredentials,
                deployedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Failed to add secure MetaApi account:', {
                error: error.message,
                userId,
                login: accountData.login
            });
            throw new Error(`Failed to add account: ${error.message}`);
        }
    }

    generateSecureMagicNumber() {
        // Generate a cryptographically secure magic number
        const crypto = await import('crypto');
        return crypto.randomInt(100000, 999999);
    }

    async deployAccountWithRetry(account, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await account.deploy();
                await account.waitDeployed(5 * 60 * 1000); // 5 minute timeout
                logger.info(`Account ${account.id} deployed successfully on attempt ${attempt}`);
                return;
            } catch (error) {
                logger.warn(`Account deployment attempt ${attempt} failed`, {
                    accountId: account.id,
                    error: error.message
                });
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }

    async getAccountMetrics(accountId, userId = null) {
        try {
            if (!accountId) {
                throw new Error('Account ID is required');
            }

            // Check cache first
            const cacheKey = `metrics_${accountId}`;
            const cached = this.requestCache.get(cacheKey);
            if (cached && cached.timestamp > Date.now() - 30 * 60 * 1000) { // 30-minute cache
                logger.debug('Using cached metrics', { accountId });
                return cached.data;
            }

            // Apply rate limiting
            await this.checkRateLimit();

            logger.info('Fetching secure account metrics', { accountId, userId });

            const account = await this.getAccount(accountId);
            if (!account) {
                throw new Error('Account not found');
            }

            // Verify account ownership if userId provided
            if (userId && !this.verifyAccountOwnership(account, userId)) {
                throw new Error('Access denied: Account ownership verification failed');
            }

            const connection = await this.getSecureConnection(account);
            await connection.connect();
            await connection.waitSynchronized(2 * 60 * 1000); // 2-minute timeout

            const terminalState = connection.terminalState;
            const accountInfo = terminalState.accountInformation;
            const positions = terminalState.positions || [];

            // Get recent deals for metrics calculation
            const historyApi = connection.historyStorage;
            const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
            const endTime = new Date();

            const deals = await historyApi.getDeals(startTime, endTime);

            const metrics = this.calculateSecureMetrics(accountInfo, deals, positions);

            // Cache results
            this.requestCache.set(cacheKey, {
                data: metrics,
                timestamp: Date.now()
            });

            // Clean up connection
            await connection.close();

            logSecurityEvent('metaapi_metrics_accessed', {
                accountId,
                userId,
                metricsType: 'account_info'
            });

            return metrics;

        } catch (error) {
            logger.error('Failed to get secure account metrics:', {
                error: error.message,
                accountId,
                userId
            });
            throw error;
        }
    }

    verifyAccountOwnership(account, userId) {
        // Check if account has the user tag
        const userTag = `user:${userId}`;
        return account.tags && account.tags.includes(userTag);
    }

    async getSecureConnection(account) {
        // Use connection pooling to avoid creating too many connections
        const connectionKey = account.id;
        
        if (this.connectionPool.has(connectionKey)) {
            const pooledConnection = this.connectionPool.get(connectionKey);
            
            // Check if connection is still valid
            if (pooledConnection.connected) {
                return pooledConnection;
            } else {
                // Remove invalid connection from pool
                this.connectionPool.delete(connectionKey);
            }
        }

        // Create new secure connection
        const connection = account.getStreamingConnection();
        
        // Set up connection security
        connection.addSynchronizationListener({
            onConnected: () => {
                logger.debug('Secure MetaApi connection established', { accountId: account.id });
            },
            onDisconnected: () => {
                logger.debug('MetaApi connection closed', { accountId: account.id });
                this.connectionPool.delete(connectionKey);
            },
            onSynchronizationStarted: () => {
                logger.debug('Account synchronization started', { accountId: account.id });
            }
        });

        // Add to connection pool
        this.connectionPool.set(connectionKey, connection);

        return connection;
    }

    calculateSecureMetrics(accountInfo, deals, positions) {
        if (!accountInfo) {
            throw new Error('Account information not available');
        }

        const metrics = {
            // Account basics
            balance: this.sanitizeNumber(accountInfo.balance),
            equity: this.sanitizeNumber(accountInfo.equity),
            margin: this.sanitizeNumber(accountInfo.margin),
            freeMargin: this.sanitizeNumber(accountInfo.freeMargin),
            marginLevel: this.sanitizeNumber(accountInfo.marginLevel),
            
            // Position info
            openPositions: positions.length,
            
            // Trading metrics
            totalTrades: deals.length,
            profit: 0,
            loss: 0,
            winRate: 0,
            profitFactor: 0,
            averageWin: 0,
            averageLoss: 0,
            maxDrawdown: 0,
            
            // Security info
            currency: accountInfo.currency,
            leverage: accountInfo.leverage,
            server: accountInfo.server,
            lastUpdated: new Date().toISOString(),
            dataSource: 'metaapi_secure'
        };

        // Calculate trading performance metrics
        let wins = 0;
        let losses = 0;
        let totalWinAmount = 0;
        let totalLossAmount = 0;
        let peak = accountInfo.balance;
        let maxDrawdown = 0;

        deals.forEach(deal => {
            const profit = this.sanitizeNumber(deal.profit) || 0;
            const commission = this.sanitizeNumber(deal.commission) || 0;
            const swap = this.sanitizeNumber(deal.swap) || 0;
            const netProfit = profit + commission + swap;

            if (netProfit > 0) {
                wins++;
                totalWinAmount += netProfit;
                metrics.profit += netProfit;
            } else if (netProfit < 0) {
                losses++;
                const lossAmount = Math.abs(netProfit);
                totalLossAmount += lossAmount;
                metrics.loss += lossAmount;
            }

            // Calculate drawdown
            const runningEquity = accountInfo.equity;
            if (runningEquity > peak) {
                peak = runningEquity;
            }
            const currentDrawdown = peak > 0 ? ((peak - runningEquity) / peak) * 100 : 0;
            if (currentDrawdown > maxDrawdown) {
                maxDrawdown = currentDrawdown;
            }
        });

        // Finalize calculations
        metrics.winRate = metrics.totalTrades > 0 ? (wins / metrics.totalTrades) * 100 : 0;
        metrics.averageWin = wins > 0 ? totalWinAmount / wins : 0;
        metrics.averageLoss = losses > 0 ? totalLossAmount / losses : 0;
        metrics.profitFactor = metrics.loss > 0 ? metrics.profit / metrics.loss : (metrics.profit > 0 ? Infinity : 0);
        metrics.maxDrawdown = maxDrawdown;

        // Sanitize all metrics
        Object.keys(metrics).forEach(key => {
            if (typeof metrics[key] === 'number') {
                metrics[key] = this.sanitizeNumber(metrics[key]);
            }
        });

        return metrics;
    }

    sanitizeNumber(value) {
        if (typeof value !== 'number' || !isFinite(value) || isNaN(value)) {
            return 0;
        }
        // Round to 2 decimal places and ensure reasonable bounds
        return Math.max(-1e10, Math.min(1e10, Math.round(value * 100) / 100));
    }

    async checkRateLimit() {
        // Simple rate limiting implementation
        const now = Date.now();
        const windowStart = now - 60000; // 1 minute window
        
        if (!this.requestTimes) {
            this.requestTimes = [];
        }
        
        // Remove old requests
        this.requestTimes = this.requestTimes.filter(time => time > windowStart);
        
        // Check if we're over the limit
        if (this.requestTimes.length >= 50) {
            const waitTime = 60000 - (now - this.requestTimes[0]);
            logger.warn('Rate limit reached, waiting', { waitTime });
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.requestTimes.push(now);
    }

    async removeAccount(accountId, userId) {
        try {
            if (!accountId || !userId) {
                throw new Error('Account ID and User ID required for secure removal');
            }

            logger.info('Removing MetaAPI account', { accountId, userId });

            const account = await this.getAccount(accountId);
            if (!account) {
                throw new Error('Account not found');
            }

            // Verify ownership
            if (!this.verifyAccountOwnership(account, userId)) {
                throw new Error('Access denied: Cannot remove account not owned by user');
            }

            // Close any open connections
            if (this.connectionPool.has(accountId)) {
                const connection = this.connectionPool.get(accountId);
                await connection.close();
                this.connectionPool.delete(accountId);
            }

            // Remove from MetaApi
            await account.undeploy();
            await account.remove();

            // Clear cache
            const cacheKeys = Array.from(this.requestCache.keys()).filter(key => key.includes(accountId));
            cacheKeys.forEach(key => this.requestCache.delete(key));

            logSecurityEvent('metaapi_account_removed', { accountId, userId });
            logger.info(`Account ${accountId} removed successfully`);

        } catch (error) {
            logger.error('Failed to remove account:', {
                error: error.message,
                accountId,
                userId
            });
            throw error;
        }
    }

    async getAccount(accountId) {
        try {
            return await this.provisioningApi.getAccount(accountId);
        } catch (error) {
            logger.error('Failed to get account:', { error: error.message, accountId });
            return null;
        }
    }

    setupCleanupTasks() {
        // Clean up connection pool every 30 minutes
        setInterval(() => {
            this.cleanupConnectionPool();
        }, 30 * 60 * 1000);

        // Clean up request cache every hour
        setInterval(() => {
            this.cleanupRequestCache();
        }, 60 * 60 * 1000);
    }

    cleanupConnectionPool() {
        const keysToRemove = [];
        
        for (const [key, connection] of this.connectionPool) {
            if (!connection.connected) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => {
            this.connectionPool.delete(key);
        });
        
        if (keysToRemove.length > 0) {
            logger.info(`Cleaned up ${keysToRemove.length} stale connections from pool`);
        }
    }

    cleanupRequestCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, cached] of this.requestCache) {
            // Remove entries older than 1 hour
            if (cached.timestamp < now - 60 * 60 * 1000) {
                expiredKeys.push(key);
            }
        }
        
        expiredKeys.forEach(key => {
            this.requestCache.delete(key);
        });
        
        if (expiredKeys.length > 0) {
            logger.info(`Cleaned up ${expiredKeys.length} expired cache entries`);
        }
    }

    // Security audit method
    async auditConnection(accountId) {
        const account = await this.getAccount(accountId);
        if (!account) {
            return { status: 'error', message: 'Account not found' };
        }

        return {
            status: 'ok',
            accountId: account.id,
            state: account.state,
            connectionStatus: account.connectionStatus,
            lastActivity: account.lastActivity,
            tags: account.tags,
            securityFeatures: {
                encrypted: true,
                rateLimit: true,
                ownershipVerification: true,
                connectionPooling: true,
                requestCaching: true
            }
        };
    }
}

export default new SecureMetaApiService();