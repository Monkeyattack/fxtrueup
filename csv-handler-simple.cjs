const csv = require('csv-parser');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

class CSVTradeHandler {
    constructor() {
        // Create our own simple database connection
        this.db = new sqlite3.Database('./csv-trades.db', (err) => {
            if (err) {
                console.error('Error opening CSV trades database:', err);
            } else {
                console.log('✅ CSV trades database connected');
                this.initDatabase();
            }
        });
    }

    initDatabase() {
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
        
        this.db.run(createTableSQL, (err) => {
            if (err) {
                console.error('Error creating csv_trades table:', err);
            } else {
                console.log('✅ CSV trades table ready');
            }
        });
        
        // Create index for faster queries
        this.db.run(
            'CREATE INDEX IF NOT EXISTS idx_csv_trades_account_close_time ON csv_trades(account_id, close_time)',
            (err) => {
                if (err) {
                    console.error('Error creating CSV trades index:', err);
                }
            }
        );
    }

    parseCSVFile(filePath) {
        return new Promise((resolve, reject) => {
            const results = [];
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => {
                    // Map CSV fields to our format
                    const trade = {
                        orderId: data.order,
                        closeTime: data.close_time,
                        cmd: data.cmd,
                        symbol: data.symbol,
                        volume: parseFloat(data.true_volume),
                        openPrice: parseFloat(data.open_price),
                        closePrice: parseFloat(data.close_price),
                        storage: parseFloat(data.storage) || 0,
                        commission: parseFloat(data.commission) || 0,
                        profit: parseFloat(data.true_profit)
                    };
                    results.push(trade);
                })
                .on('end', () => {
                    console.log(`📊 Parsed ${results.length} trades from CSV`);
                    resolve(results);
                })
                .on('error', reject);
        });
    }

    async storeTrades(accountId, trades) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO csv_trades 
                (account_id, order_id, close_time, cmd, symbol, volume, open_price, close_price, storage, commission, profit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            let totalProfit = 0;
            let firstTradeDate = null;
            let lastTradeDate = null;

            for (const trade of trades) {
                stmt.run(
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

                totalProfit += trade.profit;
                const tradeDate = new Date(trade.closeTime);
                if (!firstTradeDate || tradeDate < firstTradeDate) {
                    firstTradeDate = tradeDate;
                }
                if (!lastTradeDate || tradeDate > lastTradeDate) {
                    lastTradeDate = tradeDate;
                }
            }

            stmt.finalize((err) => {
                if (err) {
                    reject(err);
                } else {
                    const stats = {
                        totalTrades: trades.length,
                        totalProfit: totalProfit,
                        firstTradeDate: firstTradeDate,
                        lastTradeDate: lastTradeDate
                    };
                    console.log(`📈 Stored ${stats.totalTrades} trades for account ${accountId}`);
                    resolve(stats);
                }
            });
        });
    }

    async getDealsForAccount(accountId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT * FROM csv_trades 
                WHERE account_id = ?
            `;
            const params = [accountId];

            if (startDate) {
                query += ' AND close_time >= ?';
                params.push(startDate.toISOString());
            }
            if (endDate) {
                query += ' AND close_time <= ?';
                params.push(endDate.toISOString());
            }

            query += ' ORDER BY close_time DESC';

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Convert to MetaAPI-compatible format
                    const deals = rows.map(row => ({
                        id: `csv_${row.id}`,
                        platform: 'manual',
                        type: row.cmd.toLowerCase() === 'buy' ? 'DEAL_TYPE_BUY' : 'DEAL_TYPE_SELL',
                        time: new Date(row.close_time).toISOString(),
                        brokerTime: new Date(row.close_time).toISOString(),
                        brokerComment: 'CSV Import',
                        commission: row.commission,
                        swap: row.storage,
                        profit: row.profit,
                        symbol: row.symbol,
                        magic: 0,
                        orderId: row.order_id,
                        positionId: row.order_id,
                        volume: row.volume,
                        price: row.close_price,
                        entryType: 'DEAL_ENTRY_OUT',
                        reason: 'DEAL_REASON_CLIENT',
                        accountCurrencyExchangeRate: 1
                    }));
                    resolve(deals);
                }
            });
        });
    }

    async getAccountMetrics(accountId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total_trades,
                    SUM(profit) as total_profit,
                    SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as winning_trades,
                    SUM(CASE WHEN profit < 0 THEN 1 ELSE 0 END) as losing_trades,
                    AVG(profit) as avg_profit,
                    MAX(profit) as best_trade,
                    MIN(profit) as worst_trade,
                    MIN(close_time) as first_trade,
                    MAX(close_time) as last_trade
                FROM csv_trades
                WHERE account_id = ?
            `;

            this.db.get(query, [accountId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    const winRate = row.total_trades > 0 
                        ? (row.winning_trades / row.total_trades) * 100 
                        : 0;

                    resolve({
                        balance: row.total_profit || 0,
                        equity: row.total_profit || 0,
                        profit: row.total_profit || 0,
                        trades: row.total_trades || 0,
                        winRate: winRate,
                        averageWin: row.avg_profit || 0,
                        bestTrade: row.best_trade || 0,
                        worstTrade: row.worst_trade || 0,
                        firstTrade: row.first_trade,
                        lastTrade: row.last_trade
                    });
                }
            });
        });
    }
}

module.exports = CSVTradeHandler;