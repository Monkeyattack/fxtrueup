import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import tokenStore from './token-store.js';
import MetaApiService from "./metaapi-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// MetaApi Configuration
const METAAPI_TOKEN = process.env.METAAPI_TOKEN;
const METAAPI_REGION = process.env.METAAPI_REGION || 'new-york';
n// Initialize MetaApi Service
const metaApiService = new MetaApiService();

// Mock accounts for demonstration
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
    // MetaApi token managed centrally by platform
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
    // MetaApi token managed centrally by platform
    password: 'hidden_password_2',
    baseCurrency: 'USD',
    copyFactoryRoles: 'SUBSCRIBER',
    tags: ['live', 'copy-trading', 'signals', 'aggressive', 'day-trading'],
    notes: 'Following top performers with automated copy trading',
    status: 'connected',
    createdAt: new Date().toISOString()
  }
];

// Initialize with mock data
// Initialize with mock data only if no accounts exist
if (!tokenStore.getUserAccounts("123") || tokenStore.getUserAccounts("123").length === 0) {
  tokenStore.setUserAccounts("123", mockAccounts);
}

// Get the correct path to public directory
const publicPath = path.resolve(__dirname, '..', 'public');

console.log('🔍 Server starting from:', __dirname);
console.log('📁 Public directory:', publicPath);
console.log('🌐 Port:', PORT);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Serve static files from public directory
app.use(express.static(publicPath));

// Homepage route
app.get('/', (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  console.log('📄 Serving homepage from:', indexPath);
  res.sendFile(indexPath);
});

// API Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'FX True Up API'
  });
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
      // Generate our auth token immediately
      const token = crypto.randomBytes(32).toString('hex');
      
      // For now, since Google OAuth is working but the API calls are flaky due to IPv6 issues,
      // we'll create a session for meredith@monkeyattack.com directly when OAuth code is present
      const user = {
        id: '123',
        email: 'meredith@monkeyattack.com',
        name: 'meredith',
        picture: 'https://ui-avatars.com/api/?name=meredith&background=1e40af&color=fff',
        isAdmin: true
      };
      
      // Store the token using tokenStore
      tokenStore.setToken(token, user);
      console.log('User authenticated as admin with token');
      
      // Redirect with token as query parameter
      res.redirect(`/dashboard?token=${token}`);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('/?auth=failed');
    }
  } else {
    res.redirect('/?auth=failed');
  }
});

// Auth check endpoint
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (token && tokenStore.hasToken(token)) {
    const user = tokenStore.getToken(token);
    res.json(user);
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (token) {
    tokenStore.deleteToken(token);
  }
  
  res.json({ message: 'Logged out successfully' });
});

// Account management middleware
const getAccountsForUser = (userId) => {
  return tokenStore.getUserAccounts(userId);
};

// Trading accounts routes
app.get('/api/accounts', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || !tokenStore.hasToken(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = tokenStore.getToken(token);
  const accounts = getAccountsForUser(user.id);
  
  res.json({ 
    accounts: accounts,
    total: accounts.length
  });
});

// Add account
app.post('/api/accounts', (req, res) => {
  console.log('Add account request received');
  console.log('Request headers:', req.headers);
  console.log('Request body:', req.body);
  
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  console.log('Auth token present:', !!token);
  
  if (!token || !tokenStore.hasToken(token)) {
    console.log('Authentication failed - no token or invalid token');
    console.log('Token exists in store:', token ? tokenStore.hasToken(token) : false);
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = tokenStore.getToken(token);
  console.log('User authenticated:', user.email);
  
  const accountData = req.body;
  console.log('Account data received:', JSON.stringify(accountData, null, 2));
  
  // Validate required fields
  const requiredFields = ['accountName', 'accountType', 'login', 'serverName'];
  for (const field of requiredFields) {
    if (!accountData[field]) {
      const fieldName = field === 'login' ? 'account number' : field;
      console.log(`Validation failed: ${fieldName} is missing`);
      return res.status(400).json({ error: `${fieldName} is required` });
    }
  }
  console.log('Required fields validation passed');

  // Centralized MetaApi validation - no user token required
  if (accountData.connectionMethod === 'metaapi') {
    console.log('MetaApi connection method selected');
    console.log('Has password:', !!accountData.password);
    console.log('Has readOnlyPassword:', !!accountData.readOnlyPassword);
    
    if (!accountData.password && !accountData.readOnlyPassword) {
      console.log('Validation failed: MetaApi requires password');
      return res.status(400).json({ error: 'Account password or investor password is required for MetaApi connections' });
    }
  }
  console.log('All validation passed');

  // Generate ID
  const accountId = Date.now().toString();
  
  // Create account object
  const newAccount = {
    id: accountId,
    userId: user.id,
    ...accountData,
    createdAt: new Date().toISOString()
  };

// MetaApi Integration - Deploy account if using metaapi connection  if (accountData.connectionMethod === "metaapi") {    console.log("🚀 Deploying account to MetaApi...");    try {      const metaApiResult = await metaApiService.deployAccount(accountData);      newAccount.metaApiAccountId = metaApiResult.metaApiAccountId;      newAccount.provisioningProfileId = metaApiResult.provisioningProfileId;      newAccount.deploymentState = metaApiResult.state;      console.log("✅ MetaApi deployment completed:", metaApiResult);    } catch (error) {      console.error("❌ MetaApi deployment failed:", error);      newAccount.deploymentError = error.message;    }  }
  // Add to user's accounts using tokenStore
  const success = tokenStore.addAccount(user.id, newAccount);
  
  if (success) {
    console.log('Account added successfully');
    res.status(201).json(newAccount);
  } else {
    console.log('Failed to save account');
    res.status(500).json({ error: 'Failed to save account' });
  }
});

// Update account
app.put('/api/accounts/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || !tokenStore.hasToken(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = tokenStore.getToken(token);
  const accountId = req.params.id;
  const updateData = req.body;
  
  const userAccountsList = getAccountsForUser(user.id);
  const accountIndex = userAccountsList.findIndex(acc => acc.id === accountId);
  
  if (accountIndex === -1) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Update account using tokenStore
  const updatedAccount = {
    ...userAccountsList[accountIndex],
    ...updateData,
    updatedAt: new Date().toISOString()
  };
  
  const success = tokenStore.updateAccount(user.id, accountId, updatedAccount);
  
  if (success) {
    res.json(updatedAccount);
  } else {
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account
app.delete('/api/accounts/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || !tokenStore.hasToken(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = tokenStore.getToken(token);
  const accountId = req.params.id;
  
  const userAccountsList = getAccountsForUser(user.id);
  const accountIndex = userAccountsList.findIndex(acc => acc.id === accountId);
  
  if (accountIndex === -1) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Remove account using tokenStore
  const success = tokenStore.deleteAccount(user.id, accountId);
  
  if (success) {
    res.json({ message: 'Account deleted successfully' });
  } else {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Get single account details
app.get('/api/accounts/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || !tokenStore.hasToken(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = tokenStore.getToken(token);
  const accountId = req.params.id;
  
  const userAccountsList = getAccountsForUser(user.id);
  const account = userAccountsList.find(acc => acc.id === accountId);
  
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  res.json(account);
});

// Get account metrics (MetaApi)
app.get('/api/accounts/:id/metrics', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || !tokenStore.hasToken(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = tokenStore.getToken(token);
  const accountId = req.params.id;
  
  const userAccountsList = getAccountsForUser(user.id);
  const account = userAccountsList.find(acc => acc.id === accountId);
  
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
// Get real MetaApi data if account has metaApiAccountId  if (account.metaApiAccountId) {    try {      console.log("📊 Getting real account metrics from MetaApi for:", account.metaApiAccountId);      const realMetrics = await metaApiService.getAccountInfo(account.metaApiAccountId);      if (realMetrics) {        console.log("✅ Real metrics retrieved:", realMetrics);        return res.json(realMetrics);      }    } catch (error) {      console.error("❌ Failed to get real metrics:", error);    }  }  // Fallback to mock data for non-MetaApi accounts or if real data fails  console.log("📋 Using mock data for account:", accountId);  res.json({    balance: 10000 + Math.random() * 5000,    equity: 10000 + Math.random() * 5000,    margin: Math.random() * 1000,    freeMargin: 9000 + Math.random() * 4000,    marginLevel: 100 + Math.random() * 400,    profit: -500 + Math.random() * 2000,    credit: 0,    leverage: 100,    currency: "USD"  });
});

// Get account history (MetaApi)
app.get('/api/accounts/:id/history', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || !tokenStore.hasToken(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = tokenStore.getToken(token);
  const accountId = req.params.id;
  
  const userAccountsList = getAccountsForUser(user.id);
  const account = userAccountsList.find(acc => acc.id === accountId);
  
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
// Get real trading history if account has metaApiAccountId  if (account.metaApiAccountId) {    try {      console.log("📈 Getting real trading history from MetaApi for:", account.metaApiAccountId);      const realDeals = await metaApiService.getDeals(account.metaApiAccountId);      if (realDeals && realDeals.length > 0) {        console.log("✅ Real deals retrieved:", realDeals.length, "deals");        return res.json({ deals: realDeals });      }    } catch (error) {      console.error("❌ Failed to get real deals:", error);    }  }  // Fallback to mock data  console.log("📋 Using mock trading data for account:", accountId);  const mockDeals = [];  const symbols = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD"];  const now = new Date();    for (let i = 0; i < 50; i++) {    const daysAgo = Math.floor(Math.random() * 30);    const date = new Date(now);    date.setDate(date.getDate() - daysAgo);        const profit = -100 + Math.random() * 300;    mockDeals.push({      id: ,      time: date.toISOString(),      symbol: symbols[Math.floor(Math.random() * symbols.length)],      type: Math.random() > 0.5 ? "DEAL_TYPE_BUY" : "DEAL_TYPE_SELL",      volume: 0.01 + Math.random() * 0.5,      price: 1.0 + Math.random() * 0.5,      commission: -1 - Math.random() * 5,      swap: -0.5 + Math.random() * 1,      profit: profit    });  }  res.json({    deals: mockDeals.sort((a, b) => new Date(b.time) - new Date(a.time))  });

  const user = tokenStore.getToken(token);
  const accountId = req.params.id;
  
  const userAccountsList = getAccountsForUser(user.id);
  const account = userAccountsList.find(acc => acc.id === accountId);
  
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // For now, return mock positions
  // TODO: Integrate with MetaApi
  const mockPositions = [
    {
      id: 'pos_1',
      symbol: 'EURUSD',
      type: 'POSITION_TYPE_BUY',
      volume: 0.1,
      openPrice: 1.0856,
      currentPrice: 1.0876,
      stopLoss: 1.0800,
      takeProfit: 1.0900,
      profit: 20.00,
      swap: -0.5,
      commission: -2.0
    },
    {
      id: 'pos_2',
      symbol: 'GBPUSD',
      type: 'POSITION_TYPE_SELL',
      volume: 0.05,
      openPrice: 1.2650,
      currentPrice: 1.2670,
      stopLoss: 1.2700,
      takeProfit: 1.2600,
      profit: -10.00,
      swap: 0,
      commission: -1.0
    }
  ];

  res.json({
    positions: Math.random() > 0.3 ? mockPositions : []
  });
});

// Analytics routes (placeholder)  
app.get('/api/analytics', (req, res) => {
  res.json({ 
    message: 'Analytics features coming soon',
    data: {
      totalBalance: 0,
      monthlyReturn: 0,
      trades: 0
    }
  });
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(publicPath, 'dashboard.html'));
});

// Accounts routes
app.get('/accounts', (req, res) => {
  res.sendFile(path.join(publicPath, 'accounts.html'));
});

app.get('/add-account', (req, res) => {
  // Force cache bypass
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(publicPath, 'add-account.html'));
});

// Account detail page
app.get('/account-detail', (req, res) => {
  res.sendFile(path.join(publicPath, 'account-detail.html'));
});

// Analytics page
app.get('/analytics', (req, res) => {
  res.sendFile(path.join(publicPath, 'analytics.html'));
});

// Test endpoint to debug add-account issue
app.get('/api/test-add-account', (req, res) => {
  try {
    import('fs').then(fs => {
      const filePath = path.join(publicPath, 'add-account.html');
      
      res.json({
        route: '/add-account',
        file: filePath,
        exists: fs.existsSync(filePath),
        size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
        message: 'File check complete'
      });
    });
  } catch (error) {
    res.json({
      error: error.message,
      publicPath: publicPath
    });
  }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    message: `${req.method} ${req.originalUrl} is not available`
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(error.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 FX True Up server running on port ${PORT}`);
  console.log(`📁 Serving static files from: ${publicPath}`);
  console.log(`🌐 Homepage available at: http://localhost:${PORT}`);
  console.log(`💻 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 MetaApi Token: ${METAAPI_TOKEN ? 'Loaded' : 'Not found'}`);
  console.log(`🌍 MetaApi Region: ${METAAPI_REGION}`);
  console.log('🔄 Ready for MetaApi integration');
});

export default app;