const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');
const compression = require('compression');

const tokenStore = require('./token-store.cjs');
const OptimizedMetaApiService = require('./metaapi-service-optimized.cjs');
const tradingMetrics = require('./trading-metrics.cjs');
const cache = require('./sqlite-cache-optimized.cjs');

dotenv.config();

// Performance monitoring
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            requests: 0,
            responses: 0,
            errors: 0,
            totalResponseTime: 0,
            slowQueries: [],
            memoryUsage: [],
            startTime: Date.now()
        };
        
        this.startMemoryMonitoring();
        this.startPeriodicReporting();
    }
    
    recordRequest(req, res, responseTime) {
        this.metrics.requests++;
        this.metrics.totalResponseTime += responseTime;
        
        if (responseTime > 5000) { // Slow query threshold
            this.metrics.slowQueries.push({
                url: req.url,
                method: req.method,
                responseTime,
                timestamp: new Date().toISOString()
            });
            
            // Keep only last 50 slow queries
            if (this.metrics.slowQueries.length > 50) {
                this.metrics.slowQueries.shift();
            }
        }
    }
    
    recordError() {
        this.metrics.errors++;
    }
    
    startMemoryMonitoring() {
        setInterval(() => {
            const memUsage = process.memoryUsage();
            this.metrics.memoryUsage.push({
                timestamp: Date.now(),
                rss: memUsage.rss,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal
            });
            
            // Keep only last hour of memory data
            const hourAgo = Date.now() - (60 * 60 * 1000);
            this.metrics.memoryUsage = this.metrics.memoryUsage.filter(m => m.timestamp > hourAgo);
        }, 30000); // Every 30 seconds
    }
    
    startPeriodicReporting() {
        setInterval(() => {
            const uptime = Date.now() - this.metrics.startTime;
            const avgResponseTime = this.metrics.requests > 0 
                ? (this.metrics.totalResponseTime / this.metrics.requests).toFixed(2)
                : 0;
            
            console.log(`📊 Performance Summary:`);
            console.log(`  Uptime: ${(uptime / 1000 / 60).toFixed(2)} minutes`);
            console.log(`  Requests: ${this.metrics.requests}`);
            console.log(`  Errors: ${this.metrics.errors}`);
            console.log(`  Avg Response Time: ${avgResponseTime}ms`);
            console.log(`  Slow Queries: ${this.metrics.slowQueries.length}`);
            
            if (this.metrics.memoryUsage.length > 0) {
                const latestMem = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
                console.log(`  Memory Usage: ${(latestMem.heapUsed / 1024 / 1024).toFixed(2)}MB`);
            }
        }, 10 * 60 * 1000); // Every 10 minutes
    }
    
    getMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        return {
            ...this.metrics,
            uptime,
            avgResponseTime: this.metrics.requests > 0 
                ? (this.metrics.totalResponseTime / this.metrics.requests).toFixed(2) + 'ms'
                : '0ms',
            errorRate: this.metrics.requests > 0 
                ? ((this.metrics.errors / this.metrics.requests) * 100).toFixed(2) + '%'
                : '0%'
        };
    }
}

// Cluster setup for production
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
    const numWorkers = process.env.WORKERS || Math.min(4, os.cpus().length);
    
    console.log(`🚀 Starting ${numWorkers} worker processes...`);
    
    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
    
    return;
}

const app = express();
const PORT = process.env.PORT || 8080;
const performanceMonitor = new PerformanceMonitor();

// Initialize optimized MetaApi service
const metaApiService = new OptimizedMetaApiService();

// Performance middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        performanceMonitor.recordRequest(req, res, responseTime);
        
        // Log slow requests
        if (responseTime > 2000) {
            console.warn(`⚠️ Slow request: ${req.method} ${req.url} - ${responseTime}ms`);
        }
    });
    
    next();
});

// Compression middleware
app.use(compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    },
    level: 6
}));

// Security middleware with optimized CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 
                       "https://cdn.jsdelivr.net", "https://unpkg.com", 
                       "https://cdn.tailwindcss.com", "blob:"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", 
                      "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.fxtrueup.com"],
            workerSrc: ["'self'", "blob:"],
        },
    },
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'https://fxtrueup.com'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' })); // Reduced from 50mb for security
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving with aggressive caching
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
    etag: true,
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
        
        // Cache static assets aggressively in production
        if (process.env.NODE_ENV === 'production') {
            if (path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
            }
        }
    }
}));

// Auth middleware with rate limiting
const rateLimiter = new Map();

function requireAuth(req, res, next) {
    // Simple rate limiting by IP
    const clientIp = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const maxRequests = 100; // Max requests per window
    
    if (!rateLimiter.has(clientIp)) {
        rateLimiter.set(clientIp, { count: 1, resetTime: now + windowMs });
    } else {
        const rateLimitInfo = rateLimiter.get(clientIp);
        
        if (now > rateLimitInfo.resetTime) {
            rateLimitInfo.count = 1;
            rateLimitInfo.resetTime = now + windowMs;
        } else {
            rateLimitInfo.count++;
            
            if (rateLimitInfo.count > maxRequests) {
                return res.status(429).json({ error: 'Rate limit exceeded' });
            }
        }
    }
    
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    if (!token) {
        return res.status(401).json({ error: 'Authorization token required' });
    }
    
    if (!tokenStore.hasToken(token)) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = tokenStore.getToken(token);
    next();
}

// Request timeout middleware
app.use((req, res, next) => {
    req.setTimeout(30000, () => {
        res.status(408).json({ error: 'Request timeout' });
    });
    next();
});

// Google OAuth routes (unchanged)
app.get('/api/auth/google/login', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || '75344539904-i1537el99trrm9dndv5kkt12p9as5bs8.apps.googleusercontent.com';
    const redirectUri = 'https://fxtrueup.com/api/auth/google/callback';
    const scope = 'openid email profile';
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
    res.redirect(googleAuthUrl);
});

app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    
    if (code) {
        try {
            const token = crypto.randomBytes(32).toString('hex');
            const user = {
                id: '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb',
                email: 'meredith@monkeyattack.com',
                name: 'C. Meredith',
                picture: 'https://ui-avatars.com/api/?name=C+Meredith&background=1e40af&color=fff',
                isAdmin: true,
                subscription: 'enterprise',
                subscriptionTier: 'Contact Us'
            };
            
            tokenStore.setToken(token, user);
            res.redirect(`/dashboard?token=${token}`);
        } catch (error) {
            console.error('OAuth error:', error);
            performanceMonitor.recordError();
            res.redirect('/?auth=error');
        }
    } else {
        res.redirect('/?auth=error');
    }
});

app.post('/auth/logout', requireAuth, (req, res) => {
    const token = req.headers.authorization.substring(7);
    tokenStore.deleteToken(token);
    res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json(req.user);
});

// Optimized account endpoints with caching
app.get('/api/accounts', requireAuth, async (req, res) => {
    try {
        const accounts = tokenStore.getUserAccounts(req.user.id) || [];
        
        // Use Promise.allSettled for parallel processing with error handling
        const enhancedAccounts = await Promise.allSettled(
            accounts.map(async (account) => {
                if (account.metaApiAccountId && metaApiService) {
                    try {
                        const realMetrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
                        
                        if (realMetrics) {
                            return {
                                ...account,
                                ...realMetrics,
                                dataSource: 'metaapi',
                                lastUpdated: new Date().toISOString()
                            };
                        }
                    } catch (error) {
                        console.error(`Failed to get MetaApi data for ${account.accountName}:`, error.message);
                    }
                }
                
                return account;
            })
        );
        
        const results = enhancedAccounts
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);
        
        res.json({ accounts: results });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to fetch accounts' });
    }
});

// Optimized batch endpoint for account detail data
app.get('/api/accounts/:id/batch', requireAuth, async (req, res) => {
    try {
        const { id: accountId } = req.params;
        const accounts = tokenStore.getUserAccounts(req.user.id) || [];
        const account = accounts.find(acc => acc.id === accountId);
        
        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }
        
        if (account.metaApiAccountId && metaApiService) {
            const batchData = await metaApiService.getBatchAccountData(account.metaApiAccountId, {
                includeMetrics: true,
                includePositions: true,
                includeDeals: true,
                useCache: true
            });
            
            // Enhance with account info
            const result = {
                account: { ...account, ...batchData.metrics },
                history: { deals: batchData.deals || [] },
                positions: { positions: batchData.positions || [] },
                metrics: batchData.metrics ? 
                    tradingMetrics.calculateMetrics(batchData.deals || [], account.initialBalance || 10000) : 
                    null
            };
            
            res.json(result);
        } else {
            // Manual account - return basic data
            res.json({
                account,
                history: { deals: [] },
                positions: { positions: [] },
                metrics: null
            });
        }
    } catch (error) {
        console.error('Error fetching batch account data:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to fetch account data' });
    }
});

// Legacy endpoints for backward compatibility (now use batch internally)
app.get('/api/accounts/:id', requireAuth, async (req, res) => {
    try {
        const batchResponse = await fetch(`${req.protocol}://${req.get('host')}/api/accounts/${req.params.id}/batch`, {
            headers: { 'Authorization': req.headers.authorization }
        });
        
        if (batchResponse.ok) {
            const batchData = await batchResponse.json();
            res.json(batchData.account);
        } else {
            res.status(batchResponse.status).json({ error: 'Failed to fetch account' });
        }
    } catch (error) {
        console.error('Error fetching account:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to fetch account details' });
    }
});

app.get('/api/accounts/:id/history', requireAuth, async (req, res) => {
    try {
        const batchResponse = await fetch(`${req.protocol}://${req.get('host')}/api/accounts/${req.params.id}/batch`, {
            headers: { 'Authorization': req.headers.authorization }
        });
        
        if (batchResponse.ok) {
            const batchData = await batchResponse.json();
            res.json(batchData.history);
        } else {
            res.status(batchResponse.status).json({ error: 'Failed to fetch history' });
        }
    } catch (error) {
        console.error('Error fetching trading history:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to fetch trading history' });
    }
});

app.get('/api/accounts/:id/positions', requireAuth, async (req, res) => {
    try {
        const batchResponse = await fetch(`${req.protocol}://${req.get('host')}/api/accounts/${req.params.id}/batch`, {
            headers: { 'Authorization': req.headers.authorization }
        });
        
        if (batchResponse.ok) {
            const batchData = await batchResponse.json();
            res.json(batchData.positions);
        } else {
            res.status(batchResponse.status).json({ error: 'Failed to fetch positions' });
        }
    } catch (error) {
        console.error('Error fetching positions:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to fetch positions' });
    }
});

app.get('/api/accounts/:id/metrics', requireAuth, async (req, res) => {
    try {
        const batchResponse = await fetch(`${req.protocol}://${req.get('host')}/api/accounts/${req.params.id}/batch`, {
            headers: { 'Authorization': req.headers.authorization }
        });
        
        if (batchResponse.ok) {
            const batchData = await batchResponse.json();
            res.json(batchData.metrics);
        } else {
            res.status(batchResponse.status).json({ error: 'Failed to fetch metrics' });
        }
    } catch (error) {
        console.error('Error calculating metrics:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to calculate metrics' });
    }
});

// Cache control endpoints
app.post('/api/accounts/:id/refresh', requireAuth, async (req, res) => {
    try {
        const { id: accountId } = req.params;
        const accounts = tokenStore.getUserAccounts(req.user.id) || [];
        const account = accounts.find(acc => acc.id === accountId);
        
        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }
        
        if (account.metaApiAccountId && metaApiService) {
            const refreshedData = await metaApiService.forceRefresh(account.metaApiAccountId);
            res.json({ message: 'Data refreshed successfully', data: refreshedData });
        } else {
            res.json({ message: 'Manual account - no refresh available' });
        }
    } catch (error) {
        console.error('Error refreshing account data:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to refresh account data' });
    }
});

// Performance and cache statistics endpoint
app.get('/api/admin/performance', requireAuth, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const appMetrics = performanceMonitor.getMetrics();
        const metaApiMetrics = await metaApiService.getPerformanceMetrics();
        const cacheStats = await cache.getStatistics();
        
        res.json({
            application: appMetrics,
            metaApi: metaApiMetrics,
            cache: cacheStats,
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting performance metrics:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to get performance metrics' });
    }
});

// Cache warmup endpoint
app.post('/api/admin/cache/warmup', requireAuth, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const accounts = tokenStore.getUserAccounts(req.user.id) || [];
        const metaApiAccountIds = accounts
            .filter(acc => acc.metaApiAccountId)
            .map(acc => acc.metaApiAccountId);
        
        if (metaApiAccountIds.length > 0) {
            await metaApiService.warmupCache(metaApiAccountIds);
            res.json({ 
                message: `Cache warmup started for ${metaApiAccountIds.length} accounts`,
                accounts: metaApiAccountIds.length
            });
        } else {
            res.json({ message: 'No MetaApi accounts found to warm up' });
        }
    } catch (error) {
        console.error('Error warming up cache:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to warm up cache' });
    }
});

// Health check with detailed status
app.get('/health', async (req, res) => {
    try {
        const metrics = performanceMonitor.getMetrics();
        const metaApiMetrics = await metaApiService.getPerformanceMetrics();
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: metrics.uptime,
            process: {
                pid: process.pid,
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            },
            metaApi: {
                connected: metaApiService.connected,
                activeConnections: metaApiMetrics.activeConnections,
                cacheHitRate: metaApiMetrics.cacheHitRate
            },
            performance: {
                requests: metrics.requests,
                errors: metrics.errors,
                avgResponseTime: metrics.avgResponseTime
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Existing CRUD endpoints (unchanged)
app.post('/api/accounts', requireAuth, (req, res) => {
    try {
        const accountData = req.body;
        accountData.id = Date.now().toString();
        accountData.userId = req.user.id;
        accountData.createdAt = new Date().toISOString();
        
        const success = tokenStore.addAccount(req.user.id, accountData);
        
        if (success) {
            res.status(201).json({ 
                message: 'Account added successfully',
                account: accountData 
            });
        } else {
            res.status(500).json({ error: 'Failed to save account' });
        }
    } catch (error) {
        console.error('Error adding account:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to add account' });
    }
});

app.put('/api/accounts/:id', requireAuth, (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        const success = tokenStore.updateAccount(req.user.id, id, updateData);
        
        if (success) {
            res.json({ message: 'Account updated successfully' });
        } else {
            res.status(404).json({ error: 'Account not found' });
        }
    } catch (error) {
        console.error('Error updating account:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to update account' });
    }
});

app.delete('/api/accounts/:id', requireAuth, (req, res) => {
    try {
        const { id } = req.params;
        
        const success = tokenStore.deleteAccount(req.user.id, id);
        
        if (success) {
            res.json({ message: 'Account deleted successfully' });
        } else {
            res.status(404).json({ error: 'Account not found' });
        }
    } catch (error) {
        console.error('Error deleting account:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

// HTML page routes
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/accounts', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'accounts.html'));
});

app.get('/add-account', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'add-account.html'));
});

app.get('/analytics', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

app.get('/account-detail', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'account-detail.html'));
});

// Catch all handler
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    performanceMonitor.recordError();
    
    // Don't leak error details in production
    const message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error'
        : error.message;
    
    res.status(500).json({ error: message });
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    
    try {
        await metaApiService.shutdown();
        cache.close();
        
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    
    try {
        await metaApiService.shutdown();
        cache.close();
        
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Optimized FX True Up server running on port ${PORT}`);
    console.log(`📊 Performance monitoring enabled`);
    console.log(`📦 Advanced caching enabled`);
    console.log(`🔗 Connection pooling enabled`);
    console.log(`🔄 Background refresh enabled`);
    
    if (cluster.isWorker) {
        console.log(`🐛 Worker ${process.pid} started`);
    }
    
    console.log(`📊 MetaApi integration: ${metaApiService?.connected ? 'enabled' : 'disabled'}`);
    console.log(`🔑 MetaApi token: ${process.env.METAAPI_TOKEN ? 'configured' : 'missing'}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});