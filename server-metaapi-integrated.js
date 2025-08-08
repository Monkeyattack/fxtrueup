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
    const MetaApiServiceModule = await import('./metaapi-wrapper.mjs');
    MetaApiService = new MetaApiServiceModule.default();
    console.log('✅ MetaApi service loaded');
  } catch (error) {
    console.error('❌ Failed to load MetaApi service:', error.message);
  }
};


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
      
      // No mock data - return account as is
      return account;
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

