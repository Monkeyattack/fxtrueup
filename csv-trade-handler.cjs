const csv = require('csv-parser');
const fs = require('fs');
const crypto = require('crypto');

class CSVTradeHandler {
    constructor(sqliteCache) {
        this.sqliteCache = sqliteCache;
        this.initDatabase();
    }

    async initDatabase() {
        // Create table for CSV trade data
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS csv_trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id TEXT NOT NULL,
                order_id TEXT NOT NULL,
                close_time DATETIME NOT NULL,
                cmd TEXT NOT NULL,
                symbol TEXT NOT NULL,
                volume REAL NOT NULL,
                open_price REAL NOT NULL,
                close_price REAL NOT NULL,
                storage REAL DEFAULT 0,
                commission REAL DEFAULT 0,
                profit REAL NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(account_id, order_id)
            )
        `;
        
        await this.sqliteCache.run(createTableSQL);
        
        // Create index for faster queries
        await this.sqliteCache.run(
            'CREATE INDEX IF NOT EXISTS idx_csv_trades_account_close_time ON csv_trades(account_id, close_time)'
        );
    }

    parseCSVFile(filePath) {
        return new Promise((resolve, reject) => {
            const results = [];
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => {
                    // Parse the CSV row
                    const trade = {
                        orderId: data.order,
                        closeTime: data.close_time,
                        cmd: data.cmd,
                        symbol: data.symbol,
                        volume: parseFloat(data.true_volume) || 0,
                        openPrice: parseFloat(data.open_price) || 0,
                        closePrice: parseFloat(data.close_price) || 0,
                        storage: parseFloat(data.storage) || 0,
                        commission: parseFloat(data.commission) || 0,
                        profit: parseFloat(data.true_profit) || 0
                    };
                    results.push(trade);
                })
                .on('end', () => {
                    resolve(results);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    async storeTrades(accountId, trades) {
        const stmt = await this.sqliteCache.prepare(`
            INSERT OR REPLACE INTO csv_trades 
            (account_id, order_id, close_time, cmd, symbol, volume, open_price, close_price, storage, commission, profit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const trade of trades) {
            await stmt.run(
                accountId,
                trade.orderId,
                trade.closeTime,
                trade.cmd,
                trade.symbol,
                trade.volume,
                trade.openPrice,
                trade.closePrice,
                trade.storage,
                trade.commission,
                trade.profit
            );
        }

        await stmt.finalize();
        
        // Calculate and return summary statistics
        return this.getAccountStats(accountId);
    }

    async getAccountStats(accountId) {
        const stats = await this.sqliteCache.get(`
            SELECT 
                COUNT(*) as totalTrades,
                SUM(profit) as totalProfit,
                SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END) as grossProfit,
                SUM(CASE WHEN profit < 0 THEN profit ELSE 0 END) as grossLoss,
                COUNT(CASE WHEN profit > 0 THEN 1 END) as winningTrades,
                COUNT(CASE WHEN profit < 0 THEN 1 END) as losingTrades,
                AVG(profit) as avgProfit,
                MAX(profit) as bestTrade,
                MIN(profit) as worstTrade,
                MIN(close_time) as firstTradeDate,
                MAX(close_time) as lastTradeDate
            FROM csv_trades
            WHERE account_id = ?
        `, [accountId]);

        // Calculate additional metrics
        stats.winRate = stats.totalTrades > 0 ? (stats.winningTrades / stats.totalTrades) * 100 : 0;
        stats.profitFactor = stats.grossLoss !== 0 ? Math.abs(stats.grossProfit / stats.grossLoss) : 0;
        
        return stats;
    }

    async getTrades(accountId, startDate = null, endDate = null, limit = 1000) {
        let query = 'SELECT * FROM csv_trades WHERE account_id = ?';
        const params = [accountId];
        
        if (startDate) {
            query += ' AND close_time >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += ' AND close_time <= ?';
            params.push(endDate);
        }
        
        query += ' ORDER BY close_time DESC LIMIT ?';
        params.push(limit);
        
        return await this.sqliteCache.all(query, params);
    }

    async getTradesBySymbol(accountId) {
        return await this.sqliteCache.all(`
            SELECT 
                symbol,
                COUNT(*) as count,
                SUM(profit) as totalProfit,
                AVG(profit) as avgProfit,
                COUNT(CASE WHEN profit > 0 THEN 1 END) as wins,
                COUNT(CASE WHEN profit < 0 THEN 1 END) as losses
            FROM csv_trades
            WHERE account_id = ?
            GROUP BY symbol
            ORDER BY totalProfit DESC
        `, [accountId]);
    }

    async getPerformanceByPeriod(accountId, period = 'day') {
        let dateFormat;
        switch (period) {
            case 'hour':
                dateFormat = '%Y-%m-%d %H:00:00';
                break;
            case 'day':
                dateFormat = '%Y-%m-%d';
                break;
            case 'week':
                dateFormat = '%Y-%W';
                break;
            case 'month':
                dateFormat = '%Y-%m';
                break;
            default:
                dateFormat = '%Y-%m-%d';
        }

        return await this.sqliteCache.all(`
            SELECT 
                strftime('${dateFormat}', close_time) as period,
                COUNT(*) as trades,
                SUM(profit) as profit,
                SUM(volume) as volume,
                COUNT(CASE WHEN profit > 0 THEN 1 END) as wins
            FROM csv_trades
            WHERE account_id = ?
            GROUP BY period
            ORDER BY period
        `, [accountId]);
    }

    // Convert CSV trades to MetaApi-compatible format
    async getDealsForAccount(accountId, startTime = null, endTime = null) {
        const trades = await this.getTrades(accountId, startTime, endTime);
        
        // Convert to MetaApi deal format
        return trades.map(trade => ({
            id: trade.order_id,
            time: new Date(trade.close_time).toISOString(),
            type: trade.cmd,
            symbol: trade.symbol,
            volume: trade.volume,
            price: trade.close_price,
            openPrice: trade.open_price,
            profit: trade.profit,
            commission: trade.commission,
            swap: trade.storage,
            realizedProfit: trade.profit - trade.commission - trade.storage
        }));
    }

    async getAccountMetrics(accountId) {
        const stats = await this.getAccountStats(accountId);
        
        // Convert to MetaApi-compatible metrics format
        return {
            balance: stats.totalProfit || 0,
            equity: stats.totalProfit || 0,
            profit: stats.totalProfit || 0,
            absoluteDrawdown: Math.abs(stats.worstTrade || 0),
            trades: stats.totalTrades || 0,
            wonTrades: stats.winningTrades || 0,
            lostTrades: stats.losingTrades || 0,
            averageWin: stats.grossProfit && stats.winningTrades ? stats.grossProfit / stats.winningTrades : 0,
            averageLoss: stats.grossLoss && stats.losingTrades ? Math.abs(stats.grossLoss) / stats.losingTrades : 0,
            bestTrade: stats.bestTrade || 0,
            worstTrade: stats.worstTrade || 0,
            winRate: stats.winRate || 0,
            profitFactor: stats.profitFactor || 0
        };
    }
}

module.exports = CSVTradeHandler;