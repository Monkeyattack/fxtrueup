const sqlite3 = require('sqlite3').verbose();
const path = require('path');

/**
 * Optimized SQLite Cache with analytics, batch operations, and smart indexing
 */
class OptimizedSQLiteCache {
    constructor() {
        this.dbPath = path.join(__dirname, 'cache-optimized.db');
        this.db = new sqlite3.Database(this.dbPath);
        this.cacheDuration = 30 * 60 * 1000; // 30 minutes default
        this.batchSize = 1000;
        this.analyticsEnabled = true;
        this.initDatabase();
        this.startAnalytics();
    }

    initDatabase() {
        this.db.serialize(() => {
            // Enhanced cache table with compression support
            this.db.run(`
                CREATE TABLE IF NOT EXISTS api_cache_v2 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cache_key TEXT UNIQUE,
                    account_id TEXT,
                    data_type TEXT,
                    data TEXT,
                    compressed INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME,
                    hit_count INTEGER DEFAULT 0,
                    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
                    size_bytes INTEGER DEFAULT 0
                )
            `);

            // Batch cache for multiple data types per account
            this.db.run(`
                CREATE TABLE IF NOT EXISTS batch_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id TEXT UNIQUE,
                    metrics_data TEXT,
                    positions_data TEXT,
                    deals_data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME,
                    hit_count INTEGER DEFAULT 0
                )
            `);

            // Enhanced account snapshots with more metrics
            this.db.run(`
                CREATE TABLE IF NOT EXISTS account_snapshots_v2 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id TEXT,
                    balance REAL,
                    equity REAL,
                    profit REAL,
                    margin REAL,
                    free_margin REAL,
                    margin_level REAL,
                    drawdown_percent REAL,
                    snapshot_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                    data_source TEXT DEFAULT 'metaapi'
                )
            `);

            // Optimized deals table with better indexing
            this.db.run(`
                CREATE TABLE IF NOT EXISTS cached_deals_v2 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id TEXT,
                    deal_id TEXT,
                    symbol TEXT,
                    deal_type TEXT,
                    volume REAL,
                    price REAL,
                    profit REAL,
                    commission REAL,
                    swap REAL,
                    deal_time DATETIME,
                    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(account_id, deal_id)
                )
            `);

            // Cache analytics table
            this.db.run(`
                CREATE TABLE IF NOT EXISTS cache_analytics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT,
                    cache_hits INTEGER DEFAULT 0,
                    cache_misses INTEGER DEFAULT 0,
                    total_requests INTEGER DEFAULT 0,
                    avg_response_time REAL DEFAULT 0,
                    storage_used INTEGER DEFAULT 0,
                    accounts_active INTEGER DEFAULT 0,
                    api_cost_saved REAL DEFAULT 0
                )
            `);

            // Active accounts tracking
            this.db.run(`
                CREATE TABLE IF NOT EXISTS active_accounts (
                    account_id TEXT PRIMARY KEY,
                    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
                    access_count INTEGER DEFAULT 1
                )
            `);

            // Optimized indexes
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_cache_key_v2 ON api_cache_v2(cache_key, expires_at)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_batch_account ON batch_cache(account_id, expires_at)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_account_deals_v2 ON cached_deals_v2(account_id, deal_time DESC)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_snapshots_v2 ON account_snapshots_v2(account_id, snapshot_time DESC)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_date ON cache_analytics(date)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_active_accounts ON active_accounts(last_accessed DESC)`);

            // Create views for common queries
            this.db.run(`
                CREATE VIEW IF NOT EXISTS cache_performance AS
                SELECT 
                    account_id,
                    COUNT(*) as total_entries,
                    AVG(hit_count) as avg_hit_count,
                    SUM(size_bytes) as total_size_bytes,
                    MAX(last_accessed) as last_access
                FROM api_cache_v2 
                GROUP BY account_id
            `);
        });

        console.log('✅ Optimized SQLite cache database initialized');
    }

    /**
     * Batch get/set for all account data
     */
    async getBatch(accountId, ignoreExpiration = false) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            let query = `
                SELECT metrics_data, positions_data, deals_data, hit_count
                FROM batch_cache 
                WHERE account_id = ?
            `;
            const params = [accountId];

            if (!ignoreExpiration) {
                query += ` AND expires_at > ?`;
                params.push(now);
            }

            this.db.get(query, params, (err, row) => {
                if (err) {
                    console.error('Batch cache read error:', err);
                    resolve(null);
                } else if (row) {
                    try {
                        // Update hit count and last accessed
                        this.db.run(
                            `UPDATE batch_cache SET hit_count = hit_count + 1 WHERE account_id = ?`,
                            [accountId]
                        );
                        
                        this.trackAccess(accountId);
                        
                        const result = {
                            metrics: row.metrics_data ? JSON.parse(row.metrics_data) : null,
                            positions: row.positions_data ? JSON.parse(row.positions_data) : null,
                            deals: row.deals_data ? JSON.parse(row.deals_data) : null
                        };
                        
                        console.log(`📦 Batch cache hit for ${accountId} (hit count: ${row.hit_count + 1})`);
                        resolve(result);
                    } catch (parseErr) {
                        console.error('Batch cache parse error:', parseErr);
                        resolve(null);
                    }
                } else {
                    console.log(`💨 Batch cache miss for ${accountId}`);
                    resolve(null);
                }
            });
        });
    }

    async setBatch(accountId, data, customDuration = null) {
        return new Promise((resolve, reject) => {
            const duration = customDuration || this.cacheDuration;
            const expiresAt = new Date(Date.now() + duration).toISOString();

            const metricsData = data.metrics ? JSON.stringify(data.metrics) : null;
            const positionsData = data.positions ? JSON.stringify(data.positions) : null;
            const dealsData = data.deals ? JSON.stringify(data.deals) : null;

            this.db.run(
                `INSERT OR REPLACE INTO batch_cache 
                 (account_id, metrics_data, positions_data, deals_data, expires_at, hit_count) 
                 VALUES (?, ?, ?, ?, ?, COALESCE((SELECT hit_count FROM batch_cache WHERE account_id = ?), 0))`,
                [accountId, metricsData, positionsData, dealsData, expiresAt, accountId],
                (err) => {
                    if (err) {
                        console.error('Batch cache write error:', err);
                        resolve(false);
                    } else {
                        this.trackAccess(accountId);
                        console.log(`💾 Batch cached for ${accountId} (expires in ${Math.floor(duration/1000/60)}min)`);
                        resolve(true);
                    }
                }
            );
        });
    }

    /**
     * Track account access for analytics and background refresh
     */
    async trackAccess(accountId) {
        return new Promise((resolve) => {
            this.db.run(
                `INSERT OR REPLACE INTO active_accounts (account_id, last_accessed, access_count)
                 VALUES (?, ?, COALESCE((SELECT access_count FROM active_accounts WHERE account_id = ?), 0) + 1)`,
                [accountId, new Date().toISOString(), accountId],
                () => resolve()
            );
        });
    }

    /**
     * Get list of active accounts for background refresh
     */
    async getActiveAccounts(hoursBack = 24) {
        return new Promise((resolve, reject) => {
            const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000)).toISOString();
            
            this.db.all(
                `SELECT account_id FROM active_accounts 
                 WHERE last_accessed > ? 
                 ORDER BY access_count DESC, last_accessed DESC
                 LIMIT 20`,
                [cutoffTime],
                (err, rows) => {
                    if (err) {
                        console.error('Error getting active accounts:', err);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => row.account_id));
                    }
                }
            );
        });
    }

    /**
     * Clear cache for specific account
     */
    async clearAccount(accountId) {
        return new Promise((resolve) => {
            this.db.serialize(() => {
                this.db.run(`DELETE FROM batch_cache WHERE account_id = ?`, [accountId]);
                this.db.run(`DELETE FROM api_cache_v2 WHERE account_id = ?`, [accountId]);
                console.log(`🗑️ Cleared cache for account ${accountId}`);
                resolve(true);
            });
        });
    }

    /**
     * Legacy compatibility methods
     */
    async get(type, accountId) {
        const batch = await this.getBatch(accountId);
        if (!batch) return null;
        
        switch (type) {
            case 'metrics': return batch.metrics;
            case 'positions': return batch.positions;
            case 'deals': return batch.deals;
            default: return null;
        }
    }

    async set(type, accountId, value, customDuration = null) {
        // For legacy compatibility, create a batch entry
        const existingBatch = await this.getBatch(accountId, true) || {};
        existingBatch[type] = value;
        
        return this.setBatch(accountId, existingBatch, customDuration);
    }

    /**
     * Enhanced deals storage with deduplication
     */
    async storeDeals(accountId, deals) {
        if (!deals || deals.length === 0) return true;

        return new Promise((resolve) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO cached_deals_v2 
                (account_id, deal_id, symbol, deal_type, volume, price, profit, commission, swap, deal_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                
                deals.forEach(deal => {
                    stmt.run([
                        accountId,
                        deal.id,
                        deal.symbol,
                        deal.type,
                        deal.volume,
                        deal.price,
                        deal.profit || 0,
                        deal.commission || 0,
                        deal.swap || 0,
                        new Date(deal.time).toISOString()
                    ]);
                });

                this.db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('Error storing deals:', err);
                        resolve(false);
                    } else {
                        console.log(`💾 Stored ${deals.length} deals for account ${accountId}`);
                        resolve(true);
                    }
                });
            });

            stmt.finalize();
        });
    }

    async getStoredDeals(accountId, sinceDate = null) {
        return new Promise((resolve) => {
            let query = `
                SELECT deal_id as id, symbol, deal_type as type, volume, price, 
                       profit, commission, swap, deal_time as time
                FROM cached_deals_v2 
                WHERE account_id = ?
            `;
            const params = [accountId];

            if (sinceDate) {
                query += ` AND deal_time > ?`;
                params.push(new Date(sinceDate).toISOString());
            }

            query += ` ORDER BY deal_time DESC`;

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    console.error('Error fetching stored deals:', err);
                    resolve([]);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Enhanced snapshot storage
     */
    async storeSnapshot(accountId, balance, equity, profit, additionalMetrics = {}) {
        return new Promise((resolve) => {
            this.db.run(
                `INSERT INTO account_snapshots_v2 
                 (account_id, balance, equity, profit, margin, free_margin, margin_level, drawdown_percent) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    accountId, 
                    balance, 
                    equity, 
                    profit,
                    additionalMetrics.margin || 0,
                    additionalMetrics.freeMargin || 0,
                    additionalMetrics.marginLevel || 0,
                    additionalMetrics.drawdownPercent || 0
                ],
                (err) => {
                    resolve(!err);
                }
            );
        });
    }

    async getLatestDealTime(accountId) {
        return new Promise((resolve) => {
            this.db.get(
                `SELECT MAX(deal_time) as latest_time 
                 FROM cached_deals_v2 
                 WHERE account_id = ?`,
                [accountId],
                (err, row) => {
                    if (err) {
                        console.error('Error getting latest deal time:', err);
                        resolve(null);
                    } else {
                        resolve(row?.latest_time || null);
                    }
                }
            );
        });
    }

    /**
     * Get comprehensive cache statistics
     */
    async getStatistics() {
        return new Promise((resolve) => {
            const stats = {};
            
            this.db.serialize(() => {
                // Cache hit rates
                this.db.get(
                    `SELECT 
                        COUNT(*) as total_entries,
                        SUM(hit_count) as total_hits,
                        AVG(hit_count) as avg_hits,
                        SUM(size_bytes) as total_size
                     FROM api_cache_v2`,
                    (err, row) => {
                        if (!err && row) {
                            stats.apiCache = row;
                        }
                    }
                );
                
                // Batch cache stats
                this.db.get(
                    `SELECT 
                        COUNT(*) as batch_entries,
                        SUM(hit_count) as batch_hits,
                        AVG(hit_count) as avg_batch_hits
                     FROM batch_cache`,
                    (err, row) => {
                        if (!err && row) {
                            stats.batchCache = row;
                        }
                    }
                );
                
                // Active accounts
                this.db.get(
                    `SELECT COUNT(*) as active_accounts FROM active_accounts 
                     WHERE last_accessed > datetime('now', '-24 hours')`,
                    (err, row) => {
                        if (!err && row) {
                            stats.activeAccounts = row.active_accounts;
                        }
                    }
                );
                
                // Storage usage
                this.db.get(
                    `SELECT 
                        (SELECT COUNT(*) FROM api_cache_v2) as api_cache_rows,
                        (SELECT COUNT(*) FROM batch_cache) as batch_cache_rows,
                        (SELECT COUNT(*) FROM cached_deals_v2) as deals_rows,
                        (SELECT COUNT(*) FROM account_snapshots_v2) as snapshots_rows`,
                    (err, row) => {
                        if (!err && row) {
                            stats.storage = row;
                        }
                        
                        // Calculate efficiency metrics
                        stats.efficiency = {
                            hitRate: stats.batchCache?.batch_hits > 0 
                                ? ((stats.batchCache.batch_hits / (stats.batchCache.batch_entries || 1)) * 100).toFixed(2) + '%'
                                : '0%',
                            avgHitsPerEntry: stats.batchCache?.avg_batch_hits?.toFixed(2) || 0,
                            totalStorageKB: ((stats.apiCache?.total_size || 0) / 1024).toFixed(2) + ' KB'
                        };
                        
                        resolve(stats);
                    }
                );
            });
        });
    }

    /**
     * Clear expired entries with detailed logging
     */
    async clearExpired() {
        return new Promise((resolve) => {
            const now = new Date().toISOString();
            
            this.db.serialize(() => {
                this.db.run(
                    `DELETE FROM api_cache_v2 WHERE expires_at < ?`,
                    [now],
                    function(err) {
                        if (!err && this.changes > 0) {
                            console.log(`🗑️ Cleared ${this.changes} expired API cache entries`);
                        }
                    }
                );
                
                this.db.run(
                    `DELETE FROM batch_cache WHERE expires_at < ?`,
                    [now],
                    function(err) {
                        if (!err && this.changes > 0) {
                            console.log(`🗑️ Cleared ${this.changes} expired batch cache entries`);
                        }
                        resolve(true);
                    }
                );
            });
        });
    }

    /**
     * Start analytics collection
     */
    startAnalytics() {
        if (!this.analyticsEnabled) return;
        
        // Collect daily analytics
        setInterval(async () => {
            const stats = await this.getStatistics();
            const today = new Date().toISOString().split('T')[0];
            
            this.db.run(
                `INSERT OR REPLACE INTO cache_analytics 
                 (date, cache_hits, total_requests, storage_used, accounts_active) 
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    today,
                    stats.batchCache?.batch_hits || 0,
                    stats.batchCache?.batch_entries || 0,
                    stats.apiCache?.total_size || 0,
                    stats.activeAccounts || 0
                ]
            );
        }, 24 * 60 * 60 * 1000); // Daily
    }

    /**
     * Close database connection
     */
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('Error closing optimized cache database:', err);
            } else {
                console.log('Optimized SQLite cache database closed');
            }
        });
    }
}

module.exports = new OptimizedSQLiteCache();