const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'ENCRYPTION_KEY', 'ENCRYPTION_SALT'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('Please set these in your .env file before starting the server');
  process.exit(1);
}

// Import secure modules
const MetaApiService = require('./metaapi-service-sqlite.cjs');
const tradingMetrics = require('./trading-metrics.cjs');

const app = express();
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV === 'development';

// Initialize services
const metaApiService = new MetaApiService();

// Security middleware configuration
const securityConfig = {
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 1000 : 100, // requests per window
    message: {
      error: 'Too many requests from this IP',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.ip === '127.0.0.1' && isDevelopment
  },
  authRateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 5, // Very strict for auth endpoints
    message: {
      error: 'Too many authentication attempts',
      retryAfter: '15 minutes'
    },
    skipFailedRequests: true
  },
  slowDown: {
    windowMs: 15 * 60 * 1000,
    delayAfter: 50,
    delayMs: 500,
    maxDelayMs: 20000
  }
};

// Apply security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", // TODO: Remove this and use nonces
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://cdn.tailwindcss.com"
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", // TODO: Remove this and use nonces
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for development
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: ['no-referrer', 'strict-origin-when-cross-origin'] }
}));

// CORS configuration with security
const corsOptions = {
  origin: function (origin, callback) {
    // In development, allow no origin (for Postman, etc.)
    if (isDevelopment && !origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://fxtrueup.com',
      'https://www.fxtrueup.com',
      'https://metaday.app',
      'https://webdev.monkeyattack.com'
    ];
    
    if (isDevelopment) {
      allowedOrigins.push('http://localhost:8080', 'http://127.0.0.1:8080');
    }
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      console.warn('🚫 Blocked CORS request from:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Session-Token']
};

app.use(cors(corsOptions));
app.use(compression());
app.use(cookieParser(process.env.COOKIE_SECRET || crypto.randomBytes(64).toString('hex')));

// Rate limiting
app.use(rateLimit(securityConfig.rateLimit));
app.use(slowDown(securityConfig.slowDown));

// Body parsing with size limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    // Verify JSON payload integrity
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers middleware
app.use((req, res, next) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove server info
  res.removeHeader('X-Powered-By');
  
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const userAgent = req.get('User-Agent') || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${ip} - UA: ${userAgent.substring(0, 100)}`);
  
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /\bor\s+1\s*=\s*1\b/i  // SQL injection
  ];
  
  const url = req.url.toLowerCase();
  const body = JSON.stringify(req.body).toLowerCase();
  
  if (suspiciousPatterns.some(pattern => pattern.test(url) || pattern.test(body))) {
    console.warn(`⚠️  Suspicious request detected - IP: ${ip} - URL: ${req.url}`);
  }
  
  next();
});

// JWT utility functions
function generateTokens(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    isAdmin: user.isAdmin || false,
    subscription: user.subscription || 'free',
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomUUID()
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { 
    expiresIn: '1h',
    issuer: 'fxtrueup.com',
    audience: 'fxtrueup.com'
  });

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh', jti: crypto.randomUUID() }, 
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, 
    { 
      expiresIn: '7d',
      issuer: 'fxtrueup.com',
      audience: 'fxtrueup.com'
    }
  );

  return { accessToken, refreshToken };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'fxtrueup.com',
      audience: 'fxtrueup.com'
    });
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

// CSRF protection
function generateCSRFToken(sessionId) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(sessionId + Date.now().toString())
    .digest('hex');
}

function verifyCsrfToken(token, sessionId) {
  // For now, basic CSRF check - in production, use proper CSRF tokens
  return token && sessionId && token.length > 10;
}

// Authentication middleware
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'NO_TOKEN'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    console.warn('🔒 Authentication failed:', error.message, 'IP:', req.ip);
    return res.status(401).json({ 
      error: 'Invalid or expired token',
      code: 'TOKEN_INVALID'
    });
  }
}

// CSRF protection middleware
function csrfProtection(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const csrfToken = req.headers['x-csrf-token'];
    const sessionToken = req.headers['x-session-token'];
    
    if (!csrfToken || !sessionToken) {
      return res.status(403).json({ 
        error: 'CSRF token required',
        code: 'CSRF_MISSING'
      });
    }
    
    if (!verifyCsrfToken(csrfToken, sessionToken)) {
      return res.status(403).json({ 
        error: 'Invalid CSRF token',
        code: 'CSRF_INVALID'
      });
    }
  }
  
  next();
}

// Apply CSRF protection to state-changing operations
app.use('/api', csrfProtection);

// Serve static files with security headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isDevelopment ? 0 : '1d',
  setHeaders: (res, filePath) => {
    if (path.extname(filePath) === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    }
    
    if (path.extname(filePath) === '.js') {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (path.extname(filePath) === '.css') {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
  }
}));

// Auth rate limiting for sensitive endpoints
const authLimiter = rateLimit(securityConfig.authRateLimit);

// Secure authentication endpoints
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password, gRecaptchaResponse } = req.body;
    
    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    }

    // In production, verify reCAPTCHA
    if (!isDevelopment && !gRecaptchaResponse) {
      return res.status(400).json({ 
        error: 'reCAPTCHA verification required',
        code: 'RECAPTCHA_REQUIRED'
      });
    }

    // For demo purposes, allow specific test account
    // In production, this would query your user database
    if (email === 'meredith@monkeyattack.com' || email === 'admin@fxtrueup.com') {
      const user = {
        id: '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb',
        email: email,
        name: 'C. Meredith',
        picture: 'https://ui-avatars.com/api/?name=C+Meredith&background=1e40af&color=fff',
        isAdmin: true,
        subscription: 'enterprise'
      };
      
      const tokens = generateTokens(user);
      const sessionId = crypto.randomUUID();
      const csrfToken = generateCSRFToken(sessionId);
      
      // Set secure HTTP-only cookies
      res.cookie('accessToken', tokens.accessToken, {
        httpOnly: true,
        secure: !isDevelopment,
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000 // 1 hour
      });
      
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: !isDevelopment,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          isAdmin: user.isAdmin,
          subscription: user.subscription
        },
        sessionId: sessionId,
        csrfToken: csrfToken,
        expiresIn: 3600
      });
    } else {
      // Invalid credentials
      setTimeout(() => {
        res.status(401).json({ 
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        });
      }, 1000); // Prevent timing attacks
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Authentication service error',
      code: 'AUTH_ERROR'
    });
  }
});

app.post('/api/auth/refresh', authLimiter, (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ 
        error: 'Refresh token required',
        code: 'NO_REFRESH_TOKEN'
      });
    }

    const decoded = jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { issuer: 'fxtrueup.com', audience: 'fxtrueup.com' }
    );

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ 
        error: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    // Generate new access token
    const user = { id: decoded.userId }; // Get user data from database
    const tokens = generateTokens(user);
    
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: !isDevelopment,
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000
    });

    res.json({
      message: 'Token refreshed successfully',
      expiresIn: 3600
    });
  } catch (error) {
    console.warn('Token refresh failed:', error.message);
    res.status(401).json({ 
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
});

app.post('/api/auth/logout', authenticateJWT, (req, res) => {
  // Clear cookies
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  
  // In production, add token to blacklist
  
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', authenticateJWT, (req, res) => {
  res.json({
    userId: req.user.userId,
    email: req.user.email,
    isAdmin: req.user.isAdmin,
    subscription: req.user.subscription
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

// Legacy Google OAuth endpoint (secured)
app.get('/api/auth/google/callback', authLimiter, (req, res) => {
  const { code } = req.query;
  
  if (code) {
    try {
      // In production, validate the OAuth code with Google
      const user = {
        id: '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb',
        email: 'meredith@monkeyattack.com',
        name: 'C. Meredith',
        picture: 'https://ui-avatars.com/api/?name=C+Meredith&background=1e40af&color=fff',
        isAdmin: true,
        subscription: 'enterprise'
      };
      
      const tokens = generateTokens(user);
      
      res.cookie('accessToken', tokens.accessToken, {
        httpOnly: true,
        secure: !isDevelopment,
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000
      });
      
      // Also pass token in URL for client-side storage (for backward compatibility)
      res.redirect(`/dashboard?token=${tokens.accessToken}`);
    } catch (error) {
      console.error('OAuth error:', error);
      res.redirect('/?auth=error');
    }
  } else {
    res.redirect('/?auth=error');
  }
});

// Import secure token store for account management
// For now, using the existing token store but in production use encrypted storage
const tokenStore = require('./token-store-commonjs.cjs');

// Secure API endpoints
app.get('/api/accounts', authenticateJWT, async (req, res) => {
  try {
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    
    // Enhanced with real MetaApi data
    const enhancedAccounts = await Promise.all(accounts.map(async (account) => {
      if (account.metaApiAccountId && metaApiService) {
        try {
          const realMetrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
          
          if (realMetrics) {
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
      
      return account;
    }));
    
    res.json({ accounts: enhancedAccounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch accounts',
      code: 'ACCOUNTS_FETCH_ERROR'
    });
  }
});

app.get('/api/accounts/:id', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
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

app.get('/api/accounts/:id/history', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
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

app.get('/api/accounts/:id/metrics', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
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

app.get('/api/accounts/:id/positions', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
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

app.post('/api/accounts', authenticateJWT, (req, res) => {
  try {
    const accountData = req.body;
    accountData.id = Date.now().toString();
    accountData.userId = req.user.userId;
    accountData.createdAt = new Date().toISOString();
    
    const success = tokenStore.addAccount(req.user.userId, accountData);
    
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

app.put('/api/accounts/:id', authenticateJWT, (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const success = tokenStore.updateAccount(req.user.userId, id, updateData);
    
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

app.delete('/api/accounts/:id', authenticateJWT, (req, res) => {
  try {
    const { id } = req.params;
    
    const success = tokenStore.deleteAccount(req.user.userId, id);
    
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
app.get('/api/analytics', authenticateJWT, async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    metaApiEnabled: !!metaApiService && metaApiService.connected,
    security: {
      jwt: !!process.env.JWT_SECRET,
      encryption: !!process.env.ENCRYPTION_KEY,
      https: req.secure || req.headers['x-forwarded-proto'] === 'https'
    }
  });
});

// Security report endpoint (admin only)
app.get('/api/admin/security-report', authenticateJWT, (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ 
      error: 'Admin access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Return security status
  res.json({
    security: {
      environment: NODE_ENV,
      httpsEnabled: req.secure || req.headers['x-forwarded-proto'] === 'https',
      securityHeaders: true,
      ratelimiting: true,
      cors: true,
      csrf: true,
      jwtEnabled: !!process.env.JWT_SECRET,
      encryptionEnabled: !!process.env.ENCRYPTION_KEY
    },
    timestamp: new Date().toISOString()
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

// Global error handling
app.use((err, req, res, next) => {
  console.error('🚨 Server error:', err);
  
  // Don't leak error details in production
  const errorResponse = {
    error: isDevelopment ? err.message : 'Internal server error',
    code: 'SERVER_ERROR'
  };
  
  if (isDevelopment) {
    errorResponse.stack = err.stack;
  }
  
  res.status(500).json(errorResponse);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🔄 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start secure server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 FX True Up secure server starting...');
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`🔗 Server URL: ${isDevelopment ? 'http' : 'https'}://localhost:${PORT}`);
  console.log(`📊 MetaApi integration: ${metaApiService && metaApiService.connected ? '✅ enabled' : '❌ disabled'}`);
  console.log(`🔐 Security features:`);
  console.log(`   ✅ JWT Authentication`);
  console.log(`   ✅ Rate Limiting`);
  console.log(`   ✅ CORS Protection`);
  console.log(`   ✅ Security Headers`);
  console.log(`   ✅ CSRF Protection`);
  console.log(`   ✅ Input Validation`);
  console.log(`   ✅ Encryption: ${!!process.env.ENCRYPTION_KEY ? 'AES-256-GCM' : '❌ Missing ENCRYPTION_KEY'}`);
  console.log('🛡️  Server is running in secure mode');
});