import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Simple in-memory stores
const authTokens = new Map();
const userAccounts = new Map(); // Map of userId -> accounts array

// Mock accounts for demonstration
const mockAccounts = [
  {
    id: '1',
    userId: '123',
    accountName: 'Demo Scalping Account',
    accountType: 'mt4',
    accountNumber: '123456789',
    serverName: 'Demo-Server',
    connectionMethod: 'metaapi',
    tags: ['demo', 'scalping', 'testing'],
    notes: 'This is my demo account for testing scalping strategies',
    createdAt: new Date().toISOString()
  },
  {
    id: '2', 
    userId: '123',
    accountName: 'Live Swing Trading',
    accountType: 'mt5',
    accountNumber: '987654321',
    serverName: 'Live-Server-01',
    connectionMethod: 'manual',
    tags: ['live', 'swing', 'conservative'],
    notes: 'Conservative swing trading with larger timeframes',
    createdAt: new Date().toISOString()
  }
];

// Initialize with mock data
userAccounts.set('123', mockAccounts);

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
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
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
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || '75344539904-i1537el99trrm9dndv5kkt12p9as5bs8.apps.googleusercontent.com',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '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',
          code,
          grant_type: 'authorization_code',
          redirect_uri: 'https://fxtrueup.com/api/auth/google/callback'
        })
      });

      const tokens = await tokenResponse.json();
      console.log('Token exchange result:', tokens.access_token ? 'success' : 'failed');

      if (tokens.access_token) {
        // Get user info from Google
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        });

        const googleUser = await userResponse.json();
        console.log('Google user info:', googleUser.email);

        // Generate our auth token
        const token = crypto.randomBytes(32).toString('hex');
        
        // Create user object
        const user = {
          id: googleUser.id,
          email: googleUser.email,
          name: googleUser.name || googleUser.email.split('@')[0],
          picture: googleUser.picture,
          isAdmin: googleUser.email === 'meredith@monkeyattack.com'
        };
        
        // Store the token
        authTokens.set(token, user);
        console.log('User stored with token, admin:', user.isAdmin);
        
        // Redirect with token as query parameter
        res.redirect(`/dashboard?token=${token}`);
      } else {
        console.error('Token exchange failed:', tokens);
        res.redirect('/?auth=failed');
      }
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
  
  if (token && authTokens.has(token)) {
    res.json(authTokens.get(token));
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (token) {
    authTokens.delete(token);
  }
  
  res.json({ message: 'Logged out successfully' });
});

// Account management middleware
const getAccountsForUser = (userId) => {
  return userAccounts.get(userId) || [];
};

// Trading accounts routes
app.get('/api/accounts', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || !authTokens.has(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = authTokens.get(token);
  const accounts = getAccountsForUser(user.id);
  
  res.json({ 
    accounts: accounts,
    total: accounts.length
  });
});

// Add account
app.post('/api/accounts', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || !authTokens.has(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = authTokens.get(token);
  const accountData = req.body;
  
  // Validate required fields
  const requiredFields = ['accountName', 'accountType', 'accountNumber', 'serverName'];
  for (const field of requiredFields) {
    if (!accountData[field]) {
      return res.status(400).json({ error: `${field} is required` });
    }
  }

  // Generate ID
  const accountId = Date.now().toString();
  
  // Create account object
  const newAccount = {
    id: accountId,
    userId: user.id,
    ...accountData,
    createdAt: new Date().toISOString()
  };

  // Add to user's accounts
  const userAccountsList = getAccountsForUser(user.id);
  userAccountsList.push(newAccount);
  userAccounts.set(user.id, userAccountsList);

  res.status(201).json(newAccount);
});

// Update account
app.put('/api/accounts/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || !authTokens.has(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = authTokens.get(token);
  const accountId = req.params.id;
  const updateData = req.body;
  
  const userAccountsList = getAccountsForUser(user.id);
  const accountIndex = userAccountsList.findIndex(acc => acc.id === accountId);
  
  if (accountIndex === -1) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Update account
  userAccountsList[accountIndex] = {
    ...userAccountsList[accountIndex],
    ...updateData,
    updatedAt: new Date().toISOString()
  };
  
  userAccounts.set(user.id, userAccountsList);
  res.json(userAccountsList[accountIndex]);
});

// Delete account
app.delete('/api/accounts/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || !authTokens.has(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = authTokens.get(token);
  const accountId = req.params.id;
  
  const userAccountsList = getAccountsForUser(user.id);
  const accountIndex = userAccountsList.findIndex(acc => acc.id === accountId);
  
  if (accountIndex === -1) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Remove account
  userAccountsList.splice(accountIndex, 1);
  userAccounts.set(user.id, userAccountsList);
  
  res.json({ message: 'Account deleted successfully' });
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
  res.sendFile(path.join(publicPath, 'add-account.html'));
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
  console.log('🔄 Ready for MetaApi integration');
});

export default app;