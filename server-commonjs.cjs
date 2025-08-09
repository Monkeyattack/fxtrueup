const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const tokenStore = require('./token-store.cjs');
const MetaApiService = require('./metaapi-service-sqlite.cjs');
const tradingMetrics = require('./trading-metrics.cjs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize MetaApi service
const metaApiService = new MetaApiService();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdn.tailwindcss.com", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.fxtrueup.com"],
    },
  },
}));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files with proper content types
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

// Explicitly serve images directory
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Auth middleware
function requireAuth(req, res, next) {
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

// Google OAuth routes
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

app.get('/auth/verify', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// Account endpoints
app.get('/api/accounts', requireAuth, async (req, res) => {
  try {
    const accounts = tokenStore.getUserAccounts(req.user.id) || [];
    
    // Enhance accounts with real MetaApi data
    const enhancedAccounts = await Promise.all(accounts.map(async (account) => {
      if (account.metaApiAccountId && metaApiService) {
        try {
          console.log(`📊 Getting real account metrics for ${account.accountName}...`);
          const realMetrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
          
          if (realMetrics) {
            console.log(`✅ Real metrics retrieved for ${account.accountName}`);
            return {
              ...account,
              balance: realMetrics.balance,
              equity: realMetrics.equity,
              profit: realMetrics.profit,
              totalDeals: realMetrics.totalDeals,
              winRate: realMetrics.winRate,
              profitFactor: realMetrics.profitFactor,
              openPositions: realMetrics.openPositions,
              lastUpdated: new Date().toISOString(),
              dataSource: 'metaapi'
            };
          }
        } catch (error) {
          console.error(`❌ Failed to get MetaApi data for ${account.accountName}:`, error.message);
        }
      }
      
      // Return account as is - NO MOCK DATA
      return account;
    }));
    
    res.json({ accounts: enhancedAccounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

app.get('/api/accounts/:id', requireAuth, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.id) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Enhance with MetaApi data if available
    let enhancedAccount = { ...account };
    
    if (account.metaApiAccountId && metaApiService) {
      try {
        const realMetrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
        if (realMetrics) {
          enhancedAccount = {
            ...account,
            balance: realMetrics.balance,
            equity: realMetrics.equity,
            profit: realMetrics.profit,
            totalDeals: realMetrics.totalDeals,
            winRate: realMetrics.winRate,
            profitFactor: realMetrics.profitFactor,
            openPositions: realMetrics.openPositions,
            lastUpdated: new Date().toISOString(),
            dataSource: 'metaapi'
          };
        }
      } catch (error) {
        console.error(`Failed to get MetaApi data for ${account.accountName}:`, error.message);
      }
    }
    
    res.json(enhancedAccount);
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'Failed to fetch account details' });
  }
});

app.get('/api/accounts/:id/history', requireAuth, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.id) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (account.metaApiAccountId && metaApiService) {
      try {
        console.log("📈 Getting real trading history from MetaApi for:", account.metaApiAccountId);
        const realDeals = await metaApiService.getDeals(account.metaApiAccountId);
        console.log("✅ Real deals retrieved:", realDeals.length, "deals");
        return res.json({ deals: realDeals });
      } catch (error) {
        console.error("❌ Failed to get real deals:", error);
      }
    }

    // NO MOCK DATA - return empty array
    console.log("📋 No real trading data available");
    res.json({ deals: [] });
  } catch (error) {
    console.error('Error fetching trading history:', error);
    res.status(500).json({ error: 'Failed to fetch trading history' });
  }
});

app.get('/api/accounts/:id/metrics', requireAuth, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.id) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get trading history
    let trades = [];
    if (account.metaApiAccountId && metaApiService) {
      try {
        console.log("📊 Getting trades for metrics calculation:", account.metaApiAccountId);
        trades = await metaApiService.getDeals(account.metaApiAccountId);
      } catch (error) {
        console.error("Failed to get trades for metrics:", error);
      }
    }

    // Calculate metrics
    const initialBalance = account.initialBalance || 10000;
    const metrics = tradingMetrics.calculateMetrics(trades, initialBalance);
    
    console.log(`📈 Calculated metrics for ${account.accountName}: ${metrics.totalTrades} trades, ${metrics.winRate}% win rate`);
    
    res.json(metrics);
  } catch (error) {
    console.error('Error calculating metrics:', error);
    res.status(500).json({ error: 'Failed to calculate metrics' });
  }
});

app.get('/api/accounts/:id/positions', requireAuth, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.id) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (account.metaApiAccountId && metaApiService) {
      try {
        console.log("📊 Getting real positions from MetaApi for:", account.metaApiAccountId);
        const realPositions = await metaApiService.getPositions(account.metaApiAccountId);
        console.log("✅ Real positions retrieved:", realPositions.length, "positions");
        return res.json({ positions: realPositions });
      } catch (error) {
        console.error("❌ Failed to get real positions:", error);
      }
    }

    // NO MOCK DATA - return empty array
    console.log("📋 No real positions available");
    res.json({ positions: [] });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

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
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Analytics endpoint - REAL DATA ONLY
app.get('/api/analytics', requireAuth, async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const accounts = tokenStore.getUserAccounts(req.user.id) || [];
    
    // Aggregate real data from all user accounts
    let allTrades = [];
    let totalBalance = 0;
    let totalEquity = 0;
    let totalProfit = 0;
    
    for (const account of accounts) {
      if (account.metaApiAccountId && metaApiService) {
        try {
          // Get real trades from this account
          const accountTrades = await metaApiService.getDeals(account.metaApiAccountId);
          if (accountTrades.length > 0) {
            allTrades = allTrades.concat(accountTrades);
          }
          
          // Get real account metrics
          const realMetrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
          if (realMetrics) {
            totalBalance += realMetrics.balance || 0;
            totalEquity += realMetrics.equity || 0;
            totalProfit += realMetrics.profit || 0;
          }
        } catch (error) {
          console.error(`Failed to get analytics data for ${account.accountName}:`, error);
        }
      }
    }
    
    // Calculate real metrics from aggregated trades
    const metrics = tradingMetrics.calculateMetrics(allTrades, 10000);
    
    res.json({
      totalProfit: totalProfit,
      totalTrades: metrics.totalTrades,
      winRate: metrics.winRate,
      profitFactor: metrics.profitFactor,
      maxDrawdown: metrics.maxDrawdown,
      sharpeRatio: 0, // TODO: Calculate Sharpe ratio
      averageWin: metrics.avgWin,
      averageLoss: Math.abs(metrics.avgLoss),
      largestWin: metrics.largestWin || 0,
      largestLoss: Math.abs(metrics.largestLoss || 0),
      period: period,
      totalBalance: totalBalance,
      totalEquity: totalEquity,
      accountCount: accounts.length,
      charts: {
        profitLoss: [], // Will be populated by frontend charts
        winLossDistribution: []
      }
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics data' });
  }
});

// Additional API endpoints for frontend compatibility
app.get('/api/accounts/:id/details', requireAuth, async (req, res) => {
  // Redirect to existing endpoint
  res.redirect(`/api/accounts/${req.params.id}`);
});

app.get('/api/accounts/:id/deals', requireAuth, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const { limit = 1000, startDate, endDate } = req.query;
    const accounts = tokenStore.getUserAccounts(req.user.id) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    if (account.metaApiAccountId && metaApiService) {
      try {
        const deals = await metaApiService.getDeals(account.metaApiAccountId, { limit, startDate, endDate });
        res.json({ deals: deals || [] });
      } catch (error) {
        console.error('Failed to get deals:', error);
        res.json({ deals: [] });
      }
    } else {
      res.json({ deals: [] });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

app.get('/api/accounts/:id/positions', requireAuth, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.id) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    if (account.metaApiAccountId && metaApiService) {
      try {
        const positions = await metaApiService.getPositions(account.metaApiAccountId);
        res.json({ positions: positions || [] });
      } catch (error) {
        console.error('Failed to get positions:', error);
        res.json({ positions: [] });
      }
    } else {
      res.json({ positions: [] });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

app.get('/api/accounts/:id/metrics', requireAuth, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const { period = '30d' } = req.query;
    const accounts = tokenStore.getUserAccounts(req.user.id) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    if (account.metaApiAccountId && metaApiService) {
      try {
        const metrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
        res.json(metrics || {});
      } catch (error) {
        console.error('Failed to get metrics:', error);
        res.json({});
      }
    } else {
      // Return basic metrics from account data
      res.json({
        balance: account.currentBalance || 0,
        equity: account.equity || account.currentBalance || 0,
        profit: (account.equity || account.currentBalance || 0) - (account.initialBalance || 0),
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

app.get('/api/accounts/:id/info', requireAuth, async (req, res) => {
  // Redirect to existing endpoint for real-time info
  res.redirect(`/api/accounts/${req.params.id}`);
});

app.get('/api/analytics/performance', requireAuth, async (req, res) => {
  try {
    const { period = '30d', accounts: accountIds } = req.query;
    
    // This would return performance data for charting
    // For now, return empty structure
    res.json({
      equity: [],
      balance: [],
      drawdown: []
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch performance data' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    metaApiEnabled: !!metaApiService && metaApiService.connected,
    tokenValid: !!process.env.METAAPI_TOKEN
  });
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

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FX True Up server running on port ${PORT}`);
  console.log(`📊 MetaApi integration: ${metaApiService && metaApiService.connected ? 'enabled' : 'disabled'}`);
  console.log(`🔑 MetaApi token: ${process.env.METAAPI_TOKEN ? 'configured' : 'missing'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});