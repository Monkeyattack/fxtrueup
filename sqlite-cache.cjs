const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class SQLiteCache {
    constructor() {
        this.dbPath = path.join(__dirname, 'cache.db');
        this.db = new sqlite3.Database(this.dbPath);
        this.cacheDuration = 30 * 60 * 1000; // 30 minutes default (longer for cost savings)
        this.initDatabase();
    }

    initDatabase() {
        // Create cache tables
        this.db.serialize(() => {
            // Cache for API responses (metrics, positions, deals)
            this.db.run(`
                CREATE TABLE IF NOT EXISTS api_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cache_key TEXT UNIQUE,
                    account_id TEXT,
                    data_type TEXT,
                    data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME
                )
            `);

            // Store account snapshots for historical tracking
            this.db.run(`
                CREATE TABLE IF NOT EXISTS account_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id TEXT,
                    balance REAL,
                    equity REAL,
                    profit REAL,
                    snapshot_time DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Store deals/trades locally
            this.db.run(`
                CREATE TABLE IF NOT EXISTS cached_deals (
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

            // Index for performance
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_cache_key ON api_cache(cache_key)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_account_deals ON cached_deals(account_id, deal_time)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_snapshots ON account_snapshots(account_id, snapshot_time)`);
        });

        console.log('✅ SQLite cache database initialized');
    }

    /**
     * Get cached data
     */
    get(type, accountId) {
        return new Promise((resolve, reject) => {
            const cacheKey = `${type}_${accountId}`;
            const now = new Date().toISOString();

            this.db.get(
                `SELECT data FROM api_cache 
                 WHERE cache_key = ? AND expires_at > ? 
                 ORDER BY created_at DESC LIMIT 1`,
                [cacheKey, now],
                (err, row) => {
                    if (err) {
                        console.error('Cache read error:', err);
                        resolve(null);
                    } else if (row) {
                        try {
                            console.log(`📦 SQLite cache hit for ${type}:${accountId}`);
                            resolve(JSON.parse(row.data));
                        } catch (parseErr) {
                            console.error('Cache parse error:', parseErr);
                            resolve(null);
                        }
                    } else {
                        console.log(`💨 SQLite cache miss for ${type}:${accountId}`);
                        resolve(null);
                    }
                }
            );
        });
    }

    /**
     * Set cached data
     */
    set(type, accountId, value, customDuration = null) {
        return new Promise((resolve, reject) => {
            const cacheKey = `${type}_${accountId}`;
            const duration = customDuration || this.cacheDuration;
            const expiresAt = new Date(Date.now() + duration).toISOString();

            // Replace existing cache entry
            this.db.run(
                `INSERT OR REPLACE INTO api_cache 
                 (cache_key, account_id, data_type, data, expires_at) 
                 VALUES (?, ?, ?, ?, ?)`,
                [cacheKey, accountId, type, JSON.stringify(value), expiresAt],
                (err) => {
                    if (err) {
                        console.error('Cache write error:', err);
                        resolve(false);
                    } else {
                        console.log(`💾 SQLite cached ${type}:${accountId} (expires in ${Math.floor(duration/1000/60)}min)`);
                        resolve(true);
                    }
                }
            );
        });
    }

    /**
     * Store deals locally to avoid re-fetching
     */
    async storeDeals(accountId, deals) {
        if (!deals || deals.length === 0) return;

        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO cached_deals 
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

    /**
     * Get locally stored deals
     */
    async getStoredDeals(accountId, sinceDate = null) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT deal_id as id, symbol, deal_type as type, volume, price, 
                       profit, commission, swap, deal_time as time
                FROM cached_deals 
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
                    console.log(`📋 Retrieved ${rows.length} cached deals for ${accountId}`);
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Store account snapshot for historical tracking
     */
    async storeSnapshot(accountId, balance, equity, profit) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO account_snapshots (account_id, balance, equity, profit) 
                 VALUES (?, ?, ?, ?)`,
                [accountId, balance, equity, profit],
                (err) => {
                    if (err) {
                        console.error('Error storing snapshot:', err);
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                }
            );
        });
    }

    /**
     * Get the latest cached deal time for incremental fetching
     */
    async getLatestDealTime(accountId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT MAX(deal_time) as latest_time 
                 FROM cached_deals 
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
     * Clear expired cache entries
     */
    async clearExpired() {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            
            this.db.run(
                `DELETE FROM api_cache WHERE expires_at < ?`,
                [now],
                function(err) {
                    if (err) {
                        console.error('Error clearing expired cache:', err);
                        resolve(false);
                    } else {
                        if (this.changes > 0) {
                            console.log(`🗑️ Cleared ${this.changes} expired cache entries`);
                        }
                        resolve(true);
                    }
                }
            );
        });
    }

    /**
     * Set cache duration in minutes
     */
    setCacheDuration(minutes) {
        this.cacheDuration = minutes * 60 * 1000;
        console.log(`⏱️ SQLite cache duration set to ${minutes} minutes`);
    }

    /**
     * Close database connection
     */
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('SQLite cache database closed');
            }
        });
    }
}

module.exports = new SQLiteCache();