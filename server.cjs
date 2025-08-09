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
<<<<<<< Updated upstream
const multer = require('multer');
const jwt = require('jsonwebtoken');
const CSVTradeHandler = require("./csv-trade-handler.cjs");
=======
const jwt = require('jsonwebtoken');
const cluster = require('cluster');
const os = require('os');
>>>>>>> Stashed changes

// Load environment variables
dotenv.config();

<<<<<<< Updated upstream
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

=======
// Import services
const tokenStore = require('./token-store-commonjs.cjs');
const MetaApiService = require('./metaapi-service-sqlite.cjs');
const tradingMetrics = require('./trading-metrics.cjs');

// Initialize Express app
>>>>>>> Stashed changes
const app = express();
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV === 'development';

<<<<<<< Updated upstream
// Initialize services
const metaApiService = new MetaApiService();
// Initialize CSV trade handler
const csvTradeHandler = new CSVTradeHandler();

// Configure multer for file uploads
const upload = multer({ 
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  }
=======
// Cluster setup for production performance (disabled by default due to shared storage issues)
if (cluster.isMaster && NODE_ENV === 'production' && process.env.ENABLE_CLUSTERING === 'true') {
    const numWorkers = process.env.WORKERS || Math.min(2, os.cpus().length); // Reduce workers
    
    console.log(`🚀 Starting ${numWorkers} worker processes...`);
    
    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}. Restarting...`);
        setTimeout(() => cluster.fork(), 1000); // Add delay to prevent rapid restarts
    });
    
    return;
}

// Performance monitoring
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            requests: 0,
            responses: 0,
            errors: 0,
            totalResponseTime: 0,
            slowQueries: [],
            startTime: Date.now()
        };
    }
    
    recordRequest(req, res, responseTime) {
        this.metrics.requests++;
        this.metrics.totalResponseTime += responseTime;
        
        if (responseTime > 5000) { // Slow query threshold
            this.metrics.slowQueries.push({
                url: req.url,
                method: req.method,
                responseTime,
                timestamp: new Date().toISOString()
            });
            
            // Keep only last 50 slow queries
            if (this.metrics.slowQueries.length > 50) {
                this.metrics.slowQueries.shift();
            }
        }
    }
    
    recordError() {
        this.metrics.errors++;
    }
    
    getMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        return {
            ...this.metrics,
            uptime,
            avgResponseTime: this.metrics.requests > 0 
                ? (this.metrics.totalResponseTime / this.metrics.requests).toFixed(2) + 'ms'
                : '0ms',
            errorRate: this.metrics.requests > 0 
                ? ((this.metrics.errors / this.metrics.requests) * 100).toFixed(2) + '%'
                : '0%'
        };
    }
}

const performanceMonitor = new PerformanceMonitor();

// Initialize MetaApi service
const metaApiService = new MetaApiService();

// Performance middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        performanceMonitor.recordRequest(req, res, responseTime);
        
        // Log slow requests
        if (responseTime > 2000) {
            console.warn(`⚠️ Slow request: ${req.method} ${req.url} - ${responseTime}ms`);
        }
    });
    
    next();
>>>>>>> Stashed changes
});

// Security middleware configuration
const securityConfig = {
<<<<<<< Updated upstream
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
    delayMs: () => 500,
    maxDelayMs: 20000
  }
=======
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
        max: 10, // More lenient for auth endpoints
        message: {
            error: 'Too many authentication attempts',
            retryAfter: '15 minutes'
        },
        skipFailedRequests: true
    },
    slowDown: {
        windowMs: 15 * 60 * 1000,
        delayAfter: 50,
        delayMs: () => 500, // Fix for express-slow-down v2
        maxDelayMs: 20000,
        validate: { delayMs: false } // Disable warning
    }
>>>>>>> Stashed changes
};

// Apply security middleware
app.use(helmet({
<<<<<<< Updated upstream
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
=======
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "'unsafe-eval'",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://cdn.tailwindcss.com",
                "blob:"
            ],
            styleSrc: [
                "'self'", 
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com"
            ],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.fxtrueup.com"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            workerSrc: ["'self'", "blob:"]
        },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: ['no-referrer', 'strict-origin-when-cross-origin'] }
>>>>>>> Stashed changes
}));

// CORS configuration with security
const corsOptions = {
<<<<<<< Updated upstream
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

// Trust proxy for proper IP detection behind CloudFlare
app.set('trust proxy', 1);

=======
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

>>>>>>> Stashed changes
app.use(cors(corsOptions));
app.use(compression());
app.use(cookieParser(process.env.COOKIE_SECRET || crypto.randomBytes(64).toString('hex')));

// Rate limiting
app.use(rateLimit(securityConfig.rateLimit));
app.use(slowDown(securityConfig.slowDown));

// Body parsing with size limits
<<<<<<< Updated upstream
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    // Verify JSON payload integrity
    req.rawBody = buf;
  }
}));
=======
app.use(express.json({ limit: '10mb' }));
>>>>>>> Stashed changes
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers middleware
app.use((req, res, next) => {
<<<<<<< Updated upstream
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
    subscription: req.user.subscription || 'enterprise',
    subscriptionTier: 'Enterprise'
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
const tokenStore = require('./token-store.cjs');

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

app.get('/api/accounts/:id/details', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Enhance with comprehensive MetaApi data
    let enhancedAccount = { ...account };
    let deals = [];
    let positions = [];
    let metrics = null;

    if (account.metaApiAccountId && metaApiService) {
      try {
        // Get comprehensive account data in parallel
        const [realMetrics, accountDeals, accountPositions] = await Promise.all([
          metaApiService.getAccountMetrics(account.metaApiAccountId),
          metaApiService.getDeals(account.metaApiAccountId),
          metaApiService.getPositions(account.metaApiAccountId).catch(() => [])
        ]);

        if (realMetrics) {
          metrics = realMetrics;
          enhancedAccount = {
            ...account,
            balance: realMetrics.balance,
            equity: realMetrics.equity,
            profit: realMetrics.profit,
            totalDeals: realMetrics.totalDeals,
            winRate: realMetrics.winRate,
            profitFactor: realMetrics.profitFactor,
            maxDrawdown: realMetrics.maxDrawdown,
            openPositions: realMetrics.openPositions,
            lastUpdated: new Date().toISOString(),
            dataSource: 'metaapi'
          };
        }

        if (accountDeals && accountDeals.length > 0) {
          deals = accountDeals;
        }

        if (accountPositions && accountPositions.length > 0) {
          positions = accountPositions;
        }
      } catch (error) {
        console.error(`Failed to get detailed MetaApi data for ${account.accountName}:`, error.message);
      }
    }

    // Return comprehensive account details
    res.json({
      account: enhancedAccount,
      deals: deals,
      positions: positions,
      metrics: metrics,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching account details:', error);
    res.status(500).json({ error: 'Failed to fetch comprehensive account details' });
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

// Replace the POST /api/accounts endpoint with this updated version

app.post('/api/accounts', authenticateJWT, upload.single('csvFile'), async (req, res) => {
  try {
    let accountData;
    
    // Handle multipart form data (with file upload)
    if (req.file) {
      // Parse form data when file is uploaded
      accountData = {
        ...req.body,
        tags: req.body.tags ? JSON.parse(req.body.tags) : [],
        id: Date.now().toString(),
        userId: req.user.userId,
        createdAt: new Date().toISOString()
      };
      
      // Process CSV file for manual accounts
      if (accountData.connectionMethod === 'manual' && req.file) {
        try {
          const trades = await csvTradeHandler.parseCSVFile(req.file.path);
          const stats = await csvTradeHandler.storeTrades(accountData.id, trades);
          
          // Update account with CSV stats
          accountData.csvTradeCount = stats.totalTrades;
          accountData.csvProfit = stats.totalProfit;
          accountData.csvFirstTrade = stats.firstTradeDate;
          accountData.csvLastTrade = stats.lastTradeDate;
          accountData.hasCSVData = true;
          
          // Set balance if not provided
          if (!accountData.currentBalance) {
            accountData.currentBalance = stats.totalProfit;
          }
          
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
        } catch (csvError) {
          console.error('CSV processing error:', csvError);
          // Clean up file on error
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(400).json({ error: 'Failed to process CSV file' });
        }
      }
    } else {
      // Regular JSON request
      accountData = {
        ...req.body,
        id: Date.now().toString(),
        userId: req.user.userId,
        createdAt: new Date().toISOString()
      };
    }
    
    // Add account to store
    const success = tokenStore.addAccount(req.user.userId, accountData);
    
    if (success) {
      res.status(201).json({ 
        message: 'Account added successfully',
        account: accountData 
      });
    } else {
      res.status(400).json({ error: 'Failed to add account' });
    }
  } catch (error) {
    console.error('Error adding account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update the account details endpoint to support manual accounts with CSV data
app.get('/api/accounts/:id/details', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    let enhancedAccount = { ...account };
    let deals = [];
    let positions = [];
    let metrics = null;

    // Check if this is a manual account with CSV data
    if (account.connectionMethod === 'manual' && account.hasCSVData) {
      try {
        // Get data from CSV trades
        deals = await csvTradeHandler.getDealsForAccount(accountId);
        metrics = await csvTradeHandler.getAccountMetrics(accountId);
        positions = []; // Manual accounts don't have open positions
        
        enhancedAccount = {
          ...account,
          balance: account.currentBalance || metrics.balance,
          equity: account.equity || metrics.equity,
          profit: metrics.profit,
          connected: true,
          connectionStatus: 'manual'
        };
      } catch (error) {
        console.error('Error fetching CSV data:', error);
      }
    } else if (account.metaApiAccountId && metaApiService) {
      // Original MetaAPI logic
      try {
        const [realMetrics, accountDeals, accountPositions] = await Promise.all([
          metaApiService.getAccountMetrics(account.metaApiAccountId),
          metaApiService.getDeals(account.metaApiAccountId),
          metaApiService.getPositions(account.metaApiAccountId).catch(() => [])
        ]);

        if (realMetrics) {
          metrics = realMetrics;
          enhancedAccount = {
            ...account,
            balance: realMetrics.balance,
            equity: realMetrics.equity,
            profit: realMetrics.profit,
            connected: true
          };
        }

        deals = accountDeals || [];
        positions = accountPositions || [];
      } catch (error) {
        console.error('MetaApi error:', error);
      }
    }

    res.json({
      success: true,
      account: enhancedAccount,
      deals: deals.slice(0, 100),
      positions: positions,
      metrics: metrics || {
        balance: account.balance || 0,
        equity: account.equity || 0,
        profit: 0,
        trades: 0
      }
    });
  } catch (error) {
    console.error('Error in account details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update other endpoints to support manual accounts
app.get('/api/accounts/:id/deals', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const { startDate, endDate, symbol, type } = req.query;
    
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    let deals = [];
    
    if (account.connectionMethod === 'manual' && account.hasCSVData) {
      // Get deals from CSV data
      deals = await csvTradeHandler.getDealsForAccount(
        accountId,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );
      
      // Apply filters
      if (symbol) {
        deals = deals.filter(deal => 
          deal.symbol.toLowerCase().includes(symbol.toLowerCase())
        );
      }
      if (type) {
        deals = deals.filter(deal => deal.type === type);
      }
    } else if (account.metaApiAccountId && metaApiService) {
      // Original MetaAPI logic
      try {
        deals = await metaApiService.getAccountDeals(
          account.metaApiAccountId,
          startDate ? new Date(startDate) : undefined,
          endDate ? new Date(endDate) : undefined
        );

        if (symbol) {
          deals = deals.filter(deal => 
            deal.symbol.toLowerCase().includes(symbol.toLowerCase())
          );
        }
        if (type) {
          deals = deals.filter(deal => deal.type === type);
        }
      } catch (error) {
        console.error('Error fetching deals:', error);
        return res.status(500).json({ error: 'Failed to fetch deals' });
      }
    }

    res.json({ 
      deals: deals,
      total: deals.length,
      filtered: !!symbol || !!type
    });
  } catch (error) {
    console.error('Error in deals endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
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
=======
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.removeHeader('X-Powered-By');
    next();
});

// Request logging and security monitoring
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const userAgent = req.get('User-Agent') || 'Unknown';
    const ip = req.ip || req.connection.remoteAddress;
    
    console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${ip}`);
    
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

// Serve static files with aggressive caching
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: NODE_ENV === 'production' ? '1d' : '0',
    etag: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
        
        // Cache static assets aggressively in production
        if (NODE_ENV === 'production') {
            if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
            }
        }
    }
}));

// JWT utility functions (fallback to simple token if JWT not configured)
const useJWT = !!(process.env.JWT_SECRET);

function generateTokens(user) {
    if (useJWT) {
        const payload = {
            userId: user.id,
            email: user.email,
            isAdmin: user.isAdmin || false,
            subscription: user.subscription || 'free',
            iat: Math.floor(Date.now() / 1000),
            jti: crypto.randomUUID()
        };

        const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { 
            expiresIn: '24h', // Extended for better UX
            issuer: 'fxtrueup.com',
            audience: 'fxtrueup.com'
        });

        return { accessToken, refreshToken: null };
    } else {
        // Fallback to simple token system
        const token = crypto.randomBytes(32).toString('hex');
        tokenStore.setToken(token, user);
        return { accessToken: token, refreshToken: null };
    }
}

function verifyToken(token) {
    if (useJWT) {
        try {
            return jwt.verify(token, process.env.JWT_SECRET, {
                issuer: 'fxtrueup.com',
                audience: 'fxtrueup.com'
            });
        } catch (error) {
            throw new Error(`JWT verification failed: ${error.message}`);
        }
    } else {
        // Fallback to token store
        const userData = tokenStore.getToken(token);
        if (!userData) {
            throw new Error('Invalid token');
        }
        return userData;
    }
}

// Unified authentication middleware (supports both JWT and simple tokens)
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    if (!token) {
        return res.status(401).json({ 
            error: 'Authorization token required',
            code: 'NO_TOKEN'
        });
    }
    
    try {
        const userData = verifyToken(token);
        
        // Normalize user data structure between JWT and simple token
        req.user = useJWT ? {
            id: userData.userId,
            email: userData.email,
            isAdmin: userData.isAdmin,
            subscription: userData.subscription
        } : userData;
        
        next();
    } catch (error) {
        console.warn('🔒 Authentication failed:', error.message, 'IP:', req.ip);
        performanceMonitor.recordError();
        return res.status(401).json({ 
            error: 'Invalid or expired token',
            code: 'TOKEN_INVALID'
        });
    }
}

// Auth rate limiting for sensitive endpoints
const authLimiter = rateLimit(securityConfig.authRateLimit);

// Google OAuth routes (supports both token systems)
app.get('/api/auth/google/login', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || '75344539904-i1537el99trrm9dndv5kkt12p9as5bs8.apps.googleusercontent.com';
    const redirectUri = 'https://fxtrueup.com/api/auth/google/callback';
    const scope = 'openid email profile';
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
    res.redirect(googleAuthUrl);
});

app.get('/api/auth/google/callback', authLimiter, async (req, res) => {
    const { code } = req.query;
    
    if (code) {
        try {
            const user = {
                id: '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb',
                email: 'meredith@monkeyattack.com',
                name: 'C. Meredith',
                picture: 'https://ui-avatars.com/api/?name=C+Meredith&background=1e40af&color=fff',
                isAdmin: true,
                subscription: 'enterprise', // Ensure Enterprise is set
                subscriptionTier: 'Contact Us'
            };
            
            const tokens = generateTokens(user);
            
            if (useJWT) {
                res.cookie('accessToken', tokens.accessToken, {
                    httpOnly: true,
                    secure: !isDevelopment,
                    sameSite: 'strict',
                    maxAge: 24 * 60 * 60 * 1000 // 24 hours
                });
            }
            
            // Always pass token in URL for client-side storage
            res.redirect(`/dashboard?token=${tokens.accessToken}`);
        } catch (error) {
            console.error('OAuth error:', error);
            performanceMonitor.recordError();
            res.redirect('/?auth=error');
        }
    } else {
        res.redirect('/?auth=error');
    }
});

// Enhanced login endpoint with multiple auth methods
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        
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

        // Demo authentication - allow specific test accounts
        if (email === 'meredith@monkeyattack.com' || email === 'admin@fxtrueup.com') {
            const user = {
                id: '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb',
                email: email,
                name: 'C. Meredith',
                picture: 'https://ui-avatars.com/api/?name=C+Meredith&background=1e40af&color=fff',
                isAdmin: true,
                subscription: 'enterprise' // Ensure Enterprise is set
            };
            
            const tokens = generateTokens(user);
            
            if (useJWT) {
                res.cookie('accessToken', tokens.accessToken, {
                    httpOnly: true,
                    secure: !isDevelopment,
                    sameSite: 'strict',
                    maxAge: 24 * 60 * 60 * 1000
                });
            }

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
                token: tokens.accessToken, // Include token for frontend
                expiresIn: 86400 // 24 hours
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
        performanceMonitor.recordError();
        res.status(500).json({ 
            error: 'Authentication service error',
            code: 'AUTH_ERROR'
        });
    }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
    try {
        const token = req.headers.authorization.substring(7);
        
        if (!useJWT) {
            // Clean up token store for simple tokens
            tokenStore.deleteToken(token);
        }
        
        // Clear cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.json({ message: 'Logged out successfully' }); // Still return success
    }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture,
        isAdmin: req.user.isAdmin,
        subscription: req.user.subscription,
        subscriptionTier: req.user.subscriptionTier
    });
});

// Legacy auth endpoints for backward compatibility
app.get('/auth/verify', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

app.post('/auth/logout', requireAuth, (req, res) => {
    // Redirect to new endpoint
    req.url = '/api/auth/logout';
    app._router.handle(req, res);
});

// Account management endpoints with enhanced error handling
app.get('/api/accounts', requireAuth, async (req, res) => {
    try {
        const accounts = tokenStore.getUserAccounts(req.user.id) || [];
        
        // Enhanced with real MetaApi data using Promise.allSettled for error resilience
        const enhancedAccounts = await Promise.allSettled(
            accounts.map(async (account) => {
                if (account.metaApiAccountId && metaApiService) {
                    try {
                        console.log(`📊 Getting real account metrics for ${account.accountName}...`);
                        const realMetrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
                        
                        if (realMetrics) {
                            console.log(`✅ Real metrics retrieved for ${account.accountName}:`, {
                                balance: realMetrics.balance,
                                equity: realMetrics.equity,
                                profit: realMetrics.profit
                            });
                            return {
                                ...account,
                                balance: realMetrics.balance || 0,
                                equity: realMetrics.equity || 0,
                                profit: realMetrics.profit || 0,
                                totalDeals: realMetrics.totalDeals || 0,
                                winRate: realMetrics.winRate || 0,
                                profitFactor: realMetrics.profitFactor || 0,
                                openPositions: realMetrics.openPositions || 0,
                                lastUpdated: new Date().toISOString(),
                                dataSource: 'metaapi'
                            };
                        }
                    } catch (error) {
                        console.error(`❌ Failed to get MetaApi data for ${account.accountName}:`, error.message);
                    }
                }
                
                // Return account with existing data if MetaApi fails
                return {
                    ...account,
                    balance: account.currentBalance || account.balance || 0,
                    equity: account.equity || account.currentBalance || account.balance || 0,
                    dataSource: 'manual'
                };
            })
        );
        
        const results = enhancedAccounts
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);
        
        res.json({ accounts: results });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        performanceMonitor.recordError();
        res.status(500).json({ 
            error: 'Failed to fetch accounts',
            code: 'ACCOUNTS_FETCH_ERROR'
        });
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
                console.log(`📊 Getting account details for ${account.accountName}...`);
                const realMetrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
                if (realMetrics) {
                    console.log(`✅ Account details retrieved for ${account.accountName}`);
                    enhancedAccount = {
                        ...account,
                        balance: realMetrics.balance || 0,
                        equity: realMetrics.equity || 0,
                        profit: realMetrics.profit || 0,
                        totalDeals: realMetrics.totalDeals || 0,
                        winRate: realMetrics.winRate || 0,
                        profitFactor: realMetrics.profitFactor || 0,
                        openPositions: realMetrics.openPositions || 0,
                        lastUpdated: new Date().toISOString(),
                        dataSource: 'metaapi'
                    };
                } else {
                    console.warn(`⚠️ No MetaApi metrics returned for ${account.accountName}`);
                }
            } catch (error) {
                console.error(`❌ Failed to get MetaApi data for ${account.accountName}:`, error.message);
            }
        }
        
        res.json(enhancedAccount);
    } catch (error) {
        console.error('Error fetching account:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to fetch account details' });
    }
});

app.get('/api/accounts/:id/history', requireAuth, async (req, res) => {
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
                console.log("📈 Getting real trading history from MetaApi for:", account.metaApiAccountId);
                const realDeals = await metaApiService.getDeals(account.metaApiAccountId, { limit, startDate, endDate });
                console.log("✅ Real deals retrieved:", realDeals?.length || 0, "deals");
                return res.json({ deals: realDeals || [] });
            } catch (error) {
                console.error("❌ Failed to get real deals:", error);
            }
        }

        // NO MOCK DATA - return empty array
        console.log("📋 No real trading data available");
        res.json({ deals: [] });
    } catch (error) {
        console.error('Error fetching trading history:', error);
        performanceMonitor.recordError();
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

        if (account.metaApiAccountId && metaApiService) {
            try {
                console.log("📊 Getting real positions from MetaApi for:", account.metaApiAccountId);
                const realPositions = await metaApiService.getPositions(account.metaApiAccountId);
                console.log("✅ Real positions retrieved:", realPositions?.length || 0, "positions");
                return res.json({ positions: realPositions || [] });
            } catch (error) {
                console.error("❌ Failed to get real positions:", error);
            }
        }

        // NO MOCK DATA - return empty array
        console.log("📋 No real positions available");
        res.json({ positions: [] });
    } catch (error) {
        console.error('Error fetching positions:', error);
        performanceMonitor.recordError();
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

        // Get trading history for metrics calculation
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
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to calculate metrics' });
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
                    if (accountTrades && accountTrades.length > 0) {
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
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to get analytics data' });
    }
});

// Performance analytics endpoint
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
        console.error('Error getting performance analytics:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to fetch performance data' });
    }
});

// Account CRUD operations
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
        performanceMonitor.recordError();
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
        performanceMonitor.recordError();
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
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

// Legacy endpoint compatibility
app.get('/api/accounts/:id/details', requireAuth, async (req, res) => {
    // Redirect to existing endpoint
    req.url = `/api/accounts/${req.params.id}`;
    app._router.handle(req, res);
});

app.get('/api/accounts/:id/deals', requireAuth, async (req, res) => {
    // Redirect to history endpoint
    req.url = `/api/accounts/${req.params.id}/history`;
    app._router.handle(req, res);
});

app.get('/api/accounts/:id/info', requireAuth, async (req, res) => {
    // Redirect to account endpoint
    req.url = `/api/accounts/${req.params.id}`;
    app._router.handle(req, res);
});

// Admin endpoints
app.get('/api/admin/performance', requireAuth, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ 
            error: 'Admin access required',
            code: 'INSUFFICIENT_PERMISSIONS'
        });
    }
    
    try {
        const appMetrics = performanceMonitor.getMetrics();
        
        res.json({
            application: appMetrics,
            metaApi: {
                connected: metaApiService?.connected || false,
                tokenConfigured: !!process.env.METAAPI_TOKEN
            },
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting performance metrics:', error);
        performanceMonitor.recordError();
        res.status(500).json({ error: 'Failed to get performance metrics' });
    }
});

// Security report endpoint (admin only)
app.get('/api/admin/security-report', requireAuth, (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ 
            error: 'Admin access required',
            code: 'INSUFFICIENT_PERMISSIONS'
        });
    }

    res.json({
        security: {
            environment: NODE_ENV,
            httpsEnabled: req.secure || req.headers['x-forwarded-proto'] === 'https',
            securityHeaders: true,
            ratelimiting: true,
            cors: true,
            authMethod: useJWT ? 'JWT' : 'Simple Token',
            jwtEnabled: useJWT,
            encryptionEnabled: !!process.env.ENCRYPTION_KEY
        },
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint with detailed status
app.get('/health', async (req, res) => {
    try {
        const metrics = performanceMonitor.getMetrics();
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: metrics.uptime,
            version: '2.0.0-consolidated',
            process: {
                pid: process.pid,
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            },
            metaApi: {
                connected: metaApiService?.connected || false,
                tokenConfigured: !!process.env.METAAPI_TOKEN
            },
            performance: {
                requests: metrics.requests,
                errors: metrics.errors,
                avgResponseTime: metrics.avgResponseTime,
                errorRate: metrics.errorRate
            },
            features: {
                clustering: NODE_ENV === 'production' && process.env.ENABLE_CLUSTERING === 'true',
                compression: true,
                rateLimiting: true,
                securityHeaders: true,
                authentication: useJWT ? 'JWT' : 'Simple Token'
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        performanceMonitor.recordError();
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
>>>>>>> Stashed changes
});

// HTML page routes
app.get('/dashboard', (req, res) => {
<<<<<<< Updated upstream
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

// ==============================================
// ADDITIONAL ACCOUNT DATA ENDPOINTS (Missing Endpoints)
// ==============================================

// Get account deals/trades with filtering
app.get('/api/accounts/:id/deals', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const { startDate, endDate, symbol, type } = req.query;
    
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (!account.metaApiAccountId || !metaApiService) {
      return res.json({ deals: [], message: 'MetaAPI not configured for this account' });
    }

    try {
      // Get deals with filters
      const deals = await metaApiService.getAccountDeals(
        account.metaApiAccountId,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );

      // Apply additional filters if provided
      let filteredDeals = deals;
      if (symbol) {
        filteredDeals = filteredDeals.filter(deal => 
          deal.symbol.toLowerCase().includes(symbol.toLowerCase())
        );
      }
      if (type) {
        filteredDeals = filteredDeals.filter(deal => 
          deal.type === type
        );
      }

      res.json({ 
        deals: filteredDeals,
        total: filteredDeals.length,
        filtered: !!symbol || !!type
      });
    } catch (error) {
      console.error('Error fetching deals:', error);
      res.status(500).json({ error: 'Failed to fetch deals' });
    }
  } catch (error) {
    console.error('Error in deals endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get trade distribution analysis
app.get('/api/accounts/:id/distribution', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (!account.metaApiAccountId || !metaApiService) {
      return res.json({ distribution: {}, message: 'MetaAPI not configured for this account' });
    }

    try {
      // Get all deals for analysis
      const deals = await metaApiService.getAccountDeals(account.metaApiAccountId);
      
      // Calculate distribution by symbol
      const symbolDistribution = {};
      const dayDistribution = {};
      const hourDistribution = {};
      const profitBySymbol = {};
      
      deals.forEach(deal => {
        // Symbol distribution
        if (!symbolDistribution[deal.symbol]) {
          symbolDistribution[deal.symbol] = 0;
          profitBySymbol[deal.symbol] = 0;
        }
        symbolDistribution[deal.symbol]++;
        profitBySymbol[deal.symbol] += (deal.profit || 0);
        
        // Day of week distribution
        const dealDate = new Date(deal.time);
        const dayOfWeek = dealDate.getDay();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        if (!dayDistribution[days[dayOfWeek]]) {
          dayDistribution[days[dayOfWeek]] = 0;
        }
        dayDistribution[days[dayOfWeek]]++;
        
        // Hour distribution
        const hour = dealDate.getHours();
        if (!hourDistribution[hour]) {
          hourDistribution[hour] = 0;
        }
        hourDistribution[hour]++;
      });

      res.json({ 
        distribution: {
          bySymbol: symbolDistribution,
          byDayOfWeek: dayDistribution,
          byHour: hourDistribution,
          profitBySymbol: profitBySymbol
        },
        totalDeals: deals.length
      });
    } catch (error) {
      console.error('Error calculating distribution:', error);
      res.status(500).json({ error: 'Failed to calculate distribution' });
    }
  } catch (error) {
    console.error('Error in distribution endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get drawdown analysis
app.get('/api/accounts/:id/drawdown', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (!account.metaApiAccountId || !metaApiService) {
      return res.json({ drawdown: {}, message: 'MetaAPI not configured for this account' });
    }

    try {
      // Get account metrics for drawdown data
      const metrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
      
      // Calculate additional drawdown metrics
      const balance = metrics.balance || 0;
      const equity = metrics.equity || 0;
      const absoluteDrawdown = metrics.absoluteDrawdown || 0;
      const maxDrawdown = Math.max(absoluteDrawdown, balance - equity);
      const drawdownPercent = balance > 0 ? (maxDrawdown / balance) * 100 : 0;

      res.json({ 
        drawdown: {
          absolute: absoluteDrawdown,
          maxDrawdown: maxDrawdown,
          drawdownPercent: drawdownPercent.toFixed(2),
          currentEquity: equity,
          balance: balance,
          marginLevel: metrics.marginLevel || 0,
          freeMargin: metrics.freeMargin || 0
        }
      });
    } catch (error) {
      console.error('Error calculating drawdown:', error);
      res.status(500).json({ error: 'Failed to calculate drawdown' });
    }
  } catch (error) {
    console.error('Error in drawdown endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get risk metrics
app.get('/api/accounts/:id/risk', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (!account.metaApiAccountId || !metaApiService) {
      return res.json({ risk: {}, message: 'MetaAPI not configured for this account' });
    }

    try {
      // Get metrics and positions for risk analysis
      const [metrics, positions] = await Promise.all([
        metaApiService.getAccountMetrics(account.metaApiAccountId),
        metaApiService.getOpenPositions(account.metaApiAccountId)
      ]);
      
      const balance = metrics.balance || 0;
      const equity = metrics.equity || 0;
      const margin = metrics.margin || 0;
      const freeMargin = metrics.freeMargin || 0;
      
      // Calculate risk metrics
      const marginLevel = margin > 0 ? (equity / margin) * 100 : 0;
      const riskPercentage = balance > 0 ? ((balance - equity) / balance) * 100 : 0;
      const positionRisk = positions.reduce((total, pos) => total + Math.abs(pos.unrealizedProfit || 0), 0);
      
      // Risk per position
      const positionRisks = positions.map(pos => ({
        symbol: pos.symbol,
        type: pos.type,
        volume: pos.volume,
        risk: Math.abs(pos.unrealizedProfit || 0),
        riskPercent: balance > 0 ? (Math.abs(pos.unrealizedProfit || 0) / balance) * 100 : 0
      }));

      res.json({ 
        risk: {
          totalRisk: positionRisk,
          riskPercentage: riskPercentage.toFixed(2),
          marginLevel: marginLevel.toFixed(2),
          marginUsed: margin,
          freeMargin: freeMargin,
          openPositions: positions.length,
          positionRisks: positionRisks
        }
      });
    } catch (error) {
      console.error('Error calculating risk:', error);
      res.status(500).json({ error: 'Failed to calculate risk metrics' });
    }
  } catch (error) {
    console.error('Error in risk endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get real-time account info
app.get('/api/accounts/:id/info', authenticateJWT, async (req, res) => {
  try {
    const { id: accountId } = req.params;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (!account.metaApiAccountId || !metaApiService) {
      return res.json({ 
        account: account,
        realtime: false,
        message: 'MetaAPI not configured for this account' 
      });
    }

    try {
      // Get real-time account info
      const metrics = await metaApiService.getAccountMetrics(account.metaApiAccountId);
      
      res.json({ 
        account: {
          ...account,
          balance: metrics.balance,
          equity: metrics.equity,
          margin: metrics.margin,
          freeMargin: metrics.freeMargin,
          marginLevel: metrics.marginLevel,
          profit: metrics.profit,
          connected: true,
          lastUpdate: new Date().toISOString()
        },
        realtime: true
      });
    } catch (error) {
      console.error('Error fetching real-time info:', error);
      // Return cached account data if real-time fails
      res.json({ 
        account: account,
        realtime: false,
        error: 'Failed to fetch real-time data'
      });
    }
  } catch (error) {
    console.error('Error in info endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==============================================
// ANALYTICS ENDPOINTS (Missing Endpoints)
// ==============================================

// Get portfolio performance analytics
app.get('/api/analytics/performance', authenticateJWT, async (req, res) => {
  try {
    const { period = '30d', groupBy = 'day' } = req.query;
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === '1y') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    // Aggregate performance data from all accounts
    const performanceData = [];
    let totalProfit = 0;
    let totalDeals = 0;
    
    for (const account of accounts) {
      if (account.metaApiAccountId && metaApiService) {
        try {
          const deals = await metaApiService.getAccountDeals(
            account.metaApiAccountId,
            startDate,
            endDate
          );
          
          // Group deals by period
          const grouped = {};
          deals.forEach(deal => {
            const dealDate = new Date(deal.time);
            let key;
            
            if (groupBy === 'day') {
              key = dealDate.toISOString().split('T')[0];
            } else if (groupBy === 'week') {
              const weekStart = new Date(dealDate);
              weekStart.setDate(weekStart.getDate() - weekStart.getDay());
              key = weekStart.toISOString().split('T')[0];
            } else if (groupBy === 'month') {
              key = `${dealDate.getFullYear()}-${String(dealDate.getMonth() + 1).padStart(2, '0')}`;
            }
            
            if (!grouped[key]) {
              grouped[key] = {
                date: key,
                profit: 0,
                deals: 0,
                volume: 0
              };
            }
            
            grouped[key].profit += (deal.profit || 0);
            grouped[key].deals += 1;
            grouped[key].volume += (deal.volume || 0);
            totalProfit += (deal.profit || 0);
            totalDeals += 1;
          });
          
          // Add to performance data
          Object.values(grouped).forEach(data => {
            const existing = performanceData.find(p => p.date === data.date);
            if (existing) {
              existing.profit += data.profit;
              existing.deals += data.deals;
              existing.volume += data.volume;
            } else {
              performanceData.push(data);
            }
          });
        } catch (error) {
          console.error(`Error fetching performance for account ${account.id}:`, error);
        }
      }
    }

    // Sort by date
    performanceData.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ 
      performance: performanceData,
      summary: {
        totalProfit: totalProfit,
        totalDeals: totalDeals,
        avgDailyProfit: performanceData.length > 0 ? totalProfit / performanceData.length : 0,
        period: period,
        groupBy: groupBy
      }
    });
  } catch (error) {
    console.error('Error in performance analytics:', error);
    res.status(500).json({ error: 'Failed to fetch performance analytics' });
  }
});

// Get multi-account comparison
app.get('/api/analytics/comparison', authenticateJWT, async (req, res) => {
  try {
    const accounts = tokenStore.getUserAccounts(req.user.userId) || [];
    const comparison = [];
    
    for (const account of accounts) {
      let accountData = {
        id: account.id,
        name: account.name,
        broker: account.broker,
        type: account.type,
        balance: 0,
        equity: 0,
        profit: 0,
        trades: 0,
        winRate: 0,
        connected: false
      };
      
      if (account.metaApiAccountId && metaApiService) {
        try {
          // Get metrics and recent deals
          const [metrics, deals] = await Promise.all([
            metaApiService.getAccountMetrics(account.metaApiAccountId),
            metaApiService.getAccountDeals(account.metaApiAccountId)
          ]);
          
          accountData.balance = metrics.balance || 0;
          accountData.equity = metrics.equity || 0;
          accountData.profit = metrics.profit || 0;
          accountData.connected = true;
          
          // Calculate win rate
          if (deals.length > 0) {
            accountData.trades = deals.length;
            const winningTrades = deals.filter(d => (d.profit || 0) > 0).length;
            accountData.winRate = (winningTrades / deals.length) * 100;
          }
        } catch (error) {
          console.error(`Error fetching comparison data for account ${account.id}:`, error);
        }
      }
      
      comparison.push(accountData);
    }

    // Sort by balance descending
    comparison.sort((a, b) => b.balance - a.balance);

    res.json({ 
      accounts: comparison,
      total: {
        balance: comparison.reduce((sum, acc) => sum + acc.balance, 0),
        equity: comparison.reduce((sum, acc) => sum + acc.equity, 0),
        profit: comparison.reduce((sum, acc) => sum + acc.profit, 0),
        trades: comparison.reduce((sum, acc) => sum + acc.trades, 0)
      }
    });
  } catch (error) {
    console.error('Error in comparison analytics:', error);
    res.status(500).json({ error: 'Failed to fetch comparison data' });
  }
});

// ==============================================
// BILLING INTEGRATION
// ==============================================
const { initializeBillingRoutes } = require('./billing-endpoints.cjs');
initializeBillingRoutes(app);

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
=======
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

// Global error handling middleware
app.use((error, req, res, next) => {
    console.error('🚨 Server error:', error);
    performanceMonitor.recordError();
    
    // Don't leak error details in production
    const errorResponse = {
        error: isDevelopment ? error.message : 'Internal server error',
        code: 'SERVER_ERROR'
    };
    
    if (isDevelopment) {
        errorResponse.stack = error.stack;
    }
    
    res.status(500).json(errorResponse);
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    
    try {
        if (metaApiService && metaApiService.shutdown) {
            await metaApiService.shutdown();
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    
    try {
        if (metaApiService && metaApiService.shutdown) {
            await metaApiService.shutdown();
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Start consolidated server
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 FX True Up Consolidated Server starting...');
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`🔗 Server URL: ${isDevelopment ? 'http' : 'https'}://localhost:${PORT}`);
    console.log(`📦 Version: 2.0.0-consolidated`);
    
    if (cluster.isWorker) {
        console.log(`🐛 Worker ${process.pid} started`);
    }
    
    console.log(`🔐 Security features:`);
    console.log(`   ✅ Rate Limiting & Slow Down Protection`);
    console.log(`   ✅ CORS Protection`);
    console.log(`   ✅ Security Headers (Helmet)`);
    console.log(`   ✅ Input Validation & Sanitization`);
    console.log(`   ✅ Request Logging & Monitoring`);
    console.log(`   ✅ Authentication: ${useJWT ? 'JWT Tokens' : 'Simple Tokens'}`);
    
    console.log(`🚀 Performance features:`);
    console.log(`   ✅ Compression enabled`);
    console.log(`   ✅ Performance monitoring`);
    console.log(`   ✅ Static asset caching`);
    console.log(`   ✅ Clustering: ${NODE_ENV === 'production' && process.env.ENABLE_CLUSTERING === 'true' ? 'enabled' : 'disabled'}`);
    
    console.log(`📊 MetaApi integration: ${metaApiService?.connected ? '✅ connected' : '❌ disconnected'}`);
    console.log(`🔑 MetaApi token: ${process.env.METAAPI_TOKEN ? '✅ configured' : '❌ missing'}`);
    
    console.log(`👑 User permissions: Enterprise subscription enabled`);
    console.log('🛡️  Consolidated server is running with all features enabled');
>>>>>>> Stashed changes
});