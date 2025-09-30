import express from 'express';
import cors from 'cors';
import { getPool, cleanup } from './pool.js';
import { ACCOUNT_CONFIGS } from '../../config/accounts.js';

const app = express();
const port = process.env.POOL_PORT || 8087; // Different port from meta-trader-hub

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Get pool instance
const pool = getPool();

// Routes

// Health check
app.get('/health', (req, res) => {
  const stats = pool.getStats();
  res.json({
    status: 'healthy',
    service: 'FXTrueUp Connection Pool',
    stats
  });
});

// Get pool statistics
app.get('/stats', (req, res) => {
  res.json(pool.getStats());
});

// Execute trade
app.post('/trade/execute', async (req, res) => {
  try {
    const { account_id, region = 'new-york', symbol, volume, action, stop_loss, take_profit, comment } = req.body;
    
    console.log(`📊 Trade request: ${action} ${volume} ${symbol} on ${account_id}`);
    
    const result = await pool.executeTrade(account_id, region, {
      symbol,
      volume,
      action,
      stopLoss: stop_loss,
      takeProfit: take_profit,
      comment: comment || 'FXTrueUp'
    });
    
    res.json(result);
  } catch (err) {
    console.error('Trade execution error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Get positions
app.get('/positions/:account_id', async (req, res) => {
  try {
    const { account_id } = req.params;
    const { region = 'new-york' } = req.query;
    
    const positions = await pool.getPositions(account_id, region);
    res.json({
      account_id,
      positions,
      count: positions.length
    });
  } catch (err) {
    console.error('Get positions error:', err);
    res.status(500).json({ 
      error: err.message 
    });
  }
});

// Get positions - alternate endpoint for compatibility
app.get('/accounts/:account_id/positions', async (req, res) => {
  try {
    const { account_id } = req.params;
    const { region = 'new-york' } = req.query;
    
    const positions = await pool.getPositions(account_id, region);
    res.json({
      account_id,
      positions,
      count: positions.length
    });
  } catch (err) {
    console.error('Get positions error:', err);
    res.status(500).json({ 
      error: err.message 
    });
  }
});

// Get account info
app.get('/account/:account_id', async (req, res) => {
  try {
    const { account_id } = req.params;
    const { region = 'new-york' } = req.query;
    
    const info = await pool.getAccountInfo(account_id, region);
    res.json(info);
  } catch (err) {
    console.error('Get account info error:', err);
    res.status(404).json({ 
      error: 'Account not found or not connected'
    });
  }
});

// Get account info - alternate endpoint for compatibility
app.get('/accounts/:account_id/info', async (req, res) => {
  try {
    const { account_id } = req.params;
    const { region = 'new-york' } = req.query;
    
    const info = await pool.getAccountInfo(account_id, region);
    res.json(info);
  } catch (err) {
    console.error('Get account info error:', err);
    res.status(404).json({ 
      error: 'Account not found or not connected'
    });
  }
});

// Close position
app.post('/position/close', async (req, res) => {
  try {
    const { account_id, region = 'new-york', position_id } = req.body;

    const result = await pool.closePosition(account_id, region, position_id);
    res.json({
      success: result.success,
      profit: result.profit,
      order_id: result.orderId,
      message: result.success ? 'Position closed' : result.error || 'Failed to close position'
    });
  } catch (err) {
    console.error('Close position error:', err);
    res.status(500).json({ 
      error: err.message 
    });
  }
});

// Modify position
app.post('/position/modify', async (req, res) => {
  try {
    const { account_id, region = 'new-york', position_id, stop_loss, take_profit } = req.body;
    
    const success = await pool.modifyPosition(account_id, region, position_id, stop_loss, take_profit);
    res.json({ success, message: success ? 'Position modified' : 'Failed to modify position' });
  } catch (err) {
    console.error('Modify position error:', err);
    res.status(500).json({ 
      error: err.message 
    });
  }
});

// Get all configured accounts
app.get('/accounts', (req, res) => {
  res.json(ACCOUNT_CONFIGS);
});

// Get all positions for all accounts
app.get('/positions/all', async (req, res) => {
  const allPositions = {};
  
  for (const [key, config] of Object.entries(ACCOUNT_CONFIGS)) {
    try {
      const positions = await pool.getPositions(config.id, config.region);
      allPositions[key] = {
        count: positions.length,
        positions
      };
    } catch (err) {
      allPositions[key] = {
        error: err.message,
        count: 0,
        positions: []
      };
    }
  }
  
  res.json(allPositions);
});

// Get account summary for all accounts
app.get('/accounts/summary', async (req, res) => {
  const summary = {};
  
  for (const [key, config] of Object.entries(ACCOUNT_CONFIGS)) {
    try {
      const info = await pool.getAccountInfo(config.id, config.region);
      summary[key] = {
        balance: info.balance,
        equity: info.equity,
        margin: info.margin,
        connected: true,
        name: config.name
      };
    } catch (err) {
      summary[key] = {
        error: err.message,
        connected: false,
        name: config.name
      };
    }
  }
  
  res.json(summary);
});

// Close all connections
app.post('/connections/reset', async (req, res) => {
  try {
    await pool.closeAll();
    res.json({ success: true, message: 'All connections reset' });
  } catch (err) {
    console.error('Reset connections error:', err);
    res.status(500).json({ 
      error: err.message 
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down connection pool...');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down connection pool...');
  await cleanup();
  process.exit(0);
});

// Start server
app.listen(port, () => {
  console.log(`🚀 FXTrueUp Connection Pool API running on port ${port}`);
  console.log(`📊 Managing ${Object.keys(ACCOUNT_CONFIGS).length} accounts`);
});

export default app;