import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import tokenStore from './token-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Import MetaApi service (using dynamic import for ES modules)
let MetaApiService = null;
const initMetaApi = async () => {
  try {
<<<<<<< Updated upstream
    const MetaApiServiceModule = await import('./metaapi-wrapper.mjs');
    MetaApiService = new MetaApiServiceModule.default();
=======
    const { default: MetaApiServiceClass } = await import('./metaapi-service.mjs');
    MetaApiService = new MetaApiServiceClass();
>>>>>>> Stashed changes
    console.log('✅ MetaApi service loaded');
  } catch (error) {
    console.error('❌ Failed to load MetaApi service:', error.message);
  }
};

<<<<<<< Updated upstream
=======
// Mock accounts for fallback
const mockAccounts = [
  {
    id: '1',
    userId: '123',
    accountName: 'Demo Scalping Account',
    accountType: 'mt4',
    login: '123456789',
    serverName: 'Demo-Server',
    brokerName: 'IC Markets',
    accountRegion: 'new-york',
    connectionMethod: 'metaapi',
    password: 'hidden_password',
    magic: 12345,
    riskManagementApiEnabled: false,
    baseCurrency: 'USD',
    copyFactoryRoles: '',
    tags: ['demo', 'scalping', 'ea', 'moderate'],
    notes: 'This is my demo account for testing scalping strategies with EAs',
    status: 'connected',
    createdAt: new Date().toISOString()
  },
  {
    id: '2', 
    userId: '123',
    accountName: 'Live Swing Trading',
    accountType: 'mt5',
    login: '987654321',
    serverName: 'Live-Server-01',
    brokerName: 'FTMO',
    accountRegion: 'london',
    connectionMethod: 'manual',
    initialBalance: 100000,
    currentBalance: 112500,
    equity: 115000,
    tags: ['live', 'swing', 'conservative', 'prop-firm', 'manual'],
    notes: 'Conservative swing trading with larger timeframes - FTMO challenge phase',
    status: 'manual',
    createdAt: new Date().toISOString()
  },
  {
    id: '3',
    userId: '123',
    accountName: 'Copy Trading Portfolio',
    accountType: 'mt5',
    login: '555666777',
    serverName: 'CopyTrade-Live',
    brokerName: 'Pepperstone',
    accountRegion: 'sydney',
    connectionMethod: 'metaapi',
    password: 'hidden_password_2',
    baseCurrency: 'USD',
    copyFactoryRoles: 'SUBSCRIBER',
    tags: ['live', 'copy-trading', 'signals', 'aggressive', 'day-trading'],
    notes: 'Following top performers with automated copy trading',
    status: 'connected',
    createdAt: new Date().toISOString()
  }
];
>>>>>>> Stashed changes

// DO NOT initialize mock data - preserve existing user accounts
console.log('Preserving existing user accounts...');

// Initialize MetaApi service
initMetaApi();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdn.tailwindcss.com"],
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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Simple middleware to check for auth token
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

// Auth endpoints
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (email === 'demo@fxtrueup.com' && password === 'demo123') {
    const token = crypto.randomBytes(32).toString('hex');
    const user = {
      id: crypto.randomUUID(),  // Generate a new GUID for demo users
      email: email,
      name: 'Demo User',
      subscription: 'premium'
    };
    
    tokenStore.setToken(token, user);
    
    return res.json({
      token,
      user
    });
  }
  
  res.status(401).json({ error: 'Invalid credentials' });
});

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
  
  console.log('OAuth callback received, code:', code ? 'present' : 'missing');
  
  if (code) {
    try {
      // Generate our auth token
      const token = crypto.randomBytes(32).toString('hex');
      
      // In production, you'd exchange the code for user info from Google
      // For now, we'll create the proper user object for meredith@monkeyattack.com
      const user = {
        id: '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb',  // Proper GUID for security
        email: 'meredith@monkeyattack.com',
        name: 'C. Meredith',
        picture: 'https://ui-avatars.com/api/?name=C+Meredith&background=1e40af&color=fff',
        isAdmin: true,
        subscription: 'enterprise',
        subscriptionTier: 'Contact Us'
      };
      
      // Store token
      tokenStore.setToken(token, user);
      
      // Redirect to dashboard with token
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

// Account endpoints with MetaApi integration
app.get('/api/accounts', requireAuth, async (req, res) => {
  try {
    console.log('Getting accounts for user:', req.user);
    const accounts = tokenStore.getUserAccounts(req.user.id) || [];
    console.log(`Found ${accounts.length} accounts for user ${req.user.id}`);
    
    // Enhance accounts with real MetaApi data if metaApiAccountId exists
    const enhancedAccounts = await Promise.all(accounts.map(async (account) => {
      if (account.metaApiAccountId && MetaApiService) {
        try {
          console.log(`📊 Getting real account metrics for ${account.accountName}...`);
          const realMetrics = await MetaApiService.getAccountMetrics(account.metaApiAccountId);
          
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
      
<<<<<<< Updated upstream
      // No mock data - return account as is
      return account;
=======
      // Return account with mock/default data
      return {
        ...account,
        balance: account.currentBalance || (Math.random() * 50000 + 10000),
        equity: account.equity || (Math.random() * 50000 + 10000),
        profit: account.profit || (Math.random() * 5000 - 1000),
        totalDeals: Math.floor(Math.random() * 200 + 50),
        winRate: Math.random() * 40 + 50,
        profitFactor: Math.random() * 2 + 1,
        openPositions: Math.floor(Math.random() * 10),
        lastUpdated: new Date().toISOString(),
        dataSource: 'mock'
      };
>>>>>>> Stashed changes
    }));
    
    res.json({ accounts: enhancedAccounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
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

    // Get real trading history if account has metaApiAccountId
    if (account.metaApiAccountId && MetaApiService) {
      try {
        console.log("📈 Getting real trading history from MetaApi for:", account.metaApiAccountId);
        const realDeals = await MetaApiService.getDeals(account.metaApiAccountId);
        if (realDeals && realDeals.length > 0) {
          console.log("✅ Real deals retrieved:", realDeals.length, "deals");
          return res.json({ deals: realDeals });
        }
      } catch (error) {
        console.error("❌ Failed to get real deals:", error);
      }
    }

<<<<<<< Updated upstream
=======
    // Fallback to mock data
    console.log("📋 Using mock trading data for account:", accountId);
    const mockDeals = [];
    const symbols = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD"];
    const now = new Date();
    
    for (let i = 0; i < 50; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      
      const profit = -100 + Math.random() * 300;
      mockDeals.push({
        id: `deal_${i}`,
        time: date.toISOString(),
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        type: Math.random() > 0.5 ? "DEAL_TYPE_BUY" : "DEAL_TYPE_SELL",
        volume: 0.01 + Math.random() * 0.5,
        price: 1.0 + Math.random() * 0.5,
        commission: -1 - Math.random() * 5,
        swap: -0.5 + Math.random() * 1,
        profit: profit
      });
    }

    res.json({
>>>>>>> Stashed changes
      deals: mockDeals.sort((a, b) => new Date(b.time) - new Date(a.time))
    });
  } catch (error) {
    console.error('Error fetching trading history:', error);
    res.status(500).json({ error: 'Failed to fetch trading history' });
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

    // Get real positions if account has metaApiAccountId
    if (account.metaApiAccountId && MetaApiService) {
      try {
        console.log("📊 Getting real positions from MetaApi for:", account.metaApiAccountId);
        const realPositions = await MetaApiService.getPositions(account.metaApiAccountId);
        if (realPositions) {
          console.log("✅ Real positions retrieved:", realPositions.length, "positions");
          return res.json({ positions: realPositions });
        }
      } catch (error) {
        console.error("❌ Failed to get real positions:", error);
      }
    }

<<<<<<< Updated upstream
=======
    // Fallback to mock data
    console.log("📋 Using mock positions data for account:", accountId);
    const mockPositions = [];
    const symbols = ["EURUSD", "GBPUSD", "USDJPY"];
    
    for (let i = 0; i < Math.floor(Math.random() * 5); i++) {
      mockPositions.push({
        id: `pos_${i}`,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        type: Math.random() > 0.5 ? "POSITION_TYPE_BUY" : "POSITION_TYPE_SELL",
        volume: 0.01 + Math.random() * 0.5,
        openPrice: 1.0 + Math.random() * 0.5,
        currentPrice: 1.0 + Math.random() * 0.5,
        profit: -50 + Math.random() * 200,
        time: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    res.json({ positions: mockPositions });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
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
    
    if (account.metaApiAccountId && MetaApiService) {
      try {
        const realMetrics = await MetaApiService.getAccountMetrics(account.metaApiAccountId);
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
    
    // Add mock data if no real data available
    if (!enhancedAccount.balance) {
      enhancedAccount = {
        ...enhancedAccount,
        balance: Math.random() * 50000 + 10000,
        equity: Math.random() * 50000 + 10000,
        profit: Math.random() * 5000 - 1000,
        totalDeals: Math.floor(Math.random() * 200 + 50),
        winRate: Math.random() * 40 + 50,
        profitFactor: Math.random() * 2 + 1,
        openPositions: Math.floor(Math.random() * 10),
        lastUpdated: new Date().toISOString(),
        dataSource: 'mock'
      };
    }
    
    res.json(enhancedAccount);
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'Failed to fetch account details' });
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

// Analytics endpoint
app.get('/api/analytics', requireAuth, (req, res) => {
  const period = req.query.period || '30d';
  
  // Mock analytics data - in production this would aggregate from real account data
  const mockAnalytics = {
    totalProfit: 12345.67,
    totalTrades: 156,
    winRate: 64.2,
    profitFactor: 1.85,
    maxDrawdown: 8.3,
    sharpeRatio: 1.42,
    averageWin: 245.30,
    averageLoss: -132.15,
    largestWin: 1250.00,
    largestLoss: -450.00,
    period: period,
    charts: {
      profitLoss: Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        profit: Math.random() * 1000 - 200
      })),
      winLossDistribution: [
        { category: 'Wins', count: 100, percentage: 64.1 },
        { category: 'Losses', count: 56, percentage: 35.9 }
      ]
    }
  };
  
  res.json(mockAnalytics);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    metaApiEnabled: !!MetaApiService,
    tokenValid: !!process.env.METAAPI_TOKEN
  });
});

// Specific route handlers for HTML pages
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

// Catch all handler for SPA routing (serves index.html for unknown routes)
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
  console.log(`📊 MetaApi integration: ${MetaApiService ? 'enabled' : 'disabled'}`);
  console.log(`🔑 MetaApi token: ${process.env.METAAPI_TOKEN ? 'configured' : 'missing'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
>>>>>>> Stashed changes
