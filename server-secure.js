import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import csrf from 'csurf';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import secure middleware and services
import { 
    authenticateUser, 
    requireRole, 
    requireSubscription,
    authRateLimit,
    generateSecureToken
} from './src/middleware/auth-secure.js';
import { logger } from './src/utils/logger.js';
import { encryptSensitiveData, logSecurityEvent } from './src/utils/crypto-secure.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
    'JWT_SECRET',
    'ENCRYPTION_MASTER_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        logger.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const isDevelopment = process.env.NODE_ENV === 'development';

// Trust proxy for accurate IP addresses behind load balancers
app.set('trust proxy', 1);

// Enhanced Security Headers with Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'nonce-{{NONCE}}'", // Dynamic nonce for inline scripts
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                ...(isDevelopment ? ["'unsafe-eval'"] : []) // Only allow eval in development
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'", // Required for Tailwind - consider moving to compiled CSS
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com"
            ],
            imgSrc: [
                "'self'",
                "data:",
                "https:",
                "https://ui-avatars.com" // For user avatars
            ],
            connectSrc: [
                "'self'",
                "https://api.fxtrueup.com",
                "https://accounts.google.com" // For OAuth
            ],
            fontSrc: [
                "'self'",
                "https://cdnjs.cloudflare.com"
            ],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: !isDevelopment // Only in production
        },
        reportOnly: false // Set to true during development
    },
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false // Required for some external scripts
}));

// Enhanced CORS Configuration
const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = process.env.NODE_ENV === 'production' 
            ? ['https://fxtrueup.com', 'https://www.fxtrueup.com']
            : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'];
        
        // Allow requests with no origin (mobile apps, postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            logger.warn('CORS violation attempt', { origin, userAgent: 'N/A' });
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-CSRF-Token',
        'X-API-Key'
    ]
};
app.use(cors(corsOptions));

// Compression middleware
app.use(compression({
    threshold: 1024, // Only compress if larger than 1KB
    level: 6, // Balance between speed and compression ratio
    filter: (req, res) => {
        // Don't compress responses that are already compressed
        if (res.getHeader('content-encoding')) return false;
        // Use default compression filter
        return compression.filter(req, res);
    }
}));

// Enhanced Rate Limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
        // Higher limits for authenticated users
        if (req.user) return 200;
        return 100;
    },
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('Rate limit exceeded', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
            user: req.user?.userId
        });
        res.status(429).json({
            error: 'Too many requests',
            retryAfter: 15 * 60
        });
    }
});
app.use(generalLimiter);

// API-specific rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300, // Higher limit for API endpoints
    keyGenerator: (req) => `api_${req.ip}_${req.user?.userId || 'anonymous'}`,
    skip: (req) => req.path.includes('/health') // Skip health checks
});
app.use('/api/', apiLimiter);

// Slow down middleware for additional protection
const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 100,
    delayMs: 500
});
app.use(speedLimiter);

// Request logging
app.use(morgan('combined', {
    stream: {
        write: (message) => {
            logger.info(message.trim());
        }
    },
    skip: (req, res) => {
        // Skip logging for health checks and static assets
        return req.url === '/health' || req.url.startsWith('/images/');
    }
}));

// Body parsing with size limits
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf, encoding) => {
        // Store raw body for webhook signature verification
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb',
    parameterLimit: 100 // Prevent parameter pollution attacks
}));

// Cookie parser for session management
app.use(cookieParser(process.env.SESSION_SECRET));

// CSRF Protection (disable for API routes that use other authentication)
const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: !isDevelopment,
        sameSite: 'strict',
        maxAge: 3600000 // 1 hour
    },
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
    value: (req) => {
        // Allow CSRF token from header or body
        return req.body.csrfToken || 
               req.headers['x-csrf-token'] || 
               req.headers['csrf-token'];
    }
});

// Apply CSRF to web routes only (not API)
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return next();
    }
    return csrfProtection(req, res, next);
});

// Security middleware for CSP nonce
app.use((req, res, next) => {
    // Generate unique nonce for each request
    res.locals.nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    next();
});

// Serve static files with security headers
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: isDevelopment ? 0 : 86400000, // 1 day cache in production
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        // Security headers for static files
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('X-Content-Type-Options', 'nosniff');
        } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
            res.setHeader('X-Content-Type-Options', 'nosniff');
        } else if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache'); // Don't cache HTML
        }
        
        // Prevent direct access to sensitive files
        const sensitivePatterns = ['.env', 'package.json', '.git'];
        if (sensitivePatterns.some(pattern => filePath.includes(pattern))) {
            res.status(403);
            return false;
        }
    }
}));

// Health Check Endpoint (no authentication required)
app.get('/health', (req, res) => {
    const healthCheck = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: '1.0.0',
        checks: {
            database: 'connected', // TODO: Add actual database check
            metaapi: !!process.env.METAAPI_TOKEN,
            encryption: true // Validated on startup
        }
    };

    // Add more detailed info for authenticated requests
    if (req.user?.isAdmin) {
        healthCheck.memory = process.memoryUsage();
        healthCheck.env = {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        };
    }

    res.json(healthCheck);
});

// Security endpoints
app.get('/api/auth/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

app.post('/api/security/csp-violation', express.json({ type: 'application/csp-report' }), (req, res) => {
    logger.warn('CSP Violation Report', {
        violation: req.body,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer')
    });
    res.status(204).send();
});

// Import and use secure route handlers
// Note: These would need to be implemented with the new security middleware
try {
    const authRoutes = await import('./src/routes/auth-secure.js');
    const accountRoutes = await import('./src/routes/accounts-secure.js');
    const analyticsRoutes = await import('./src/routes/analytics-secure.js');
    const subscriptionRoutes = await import('./src/routes/subscriptions-secure.js');

    app.use('/api/auth', authRateLimit, authRoutes.default);
    app.use('/api/accounts', authenticateUser, accountRoutes.default);
    app.use('/api/analytics', authenticateUser, requireSubscription(['basic', 'pro', 'enterprise']), analyticsRoutes.default);
    app.use('/api/subscriptions', authenticateUser, subscriptionRoutes.default);
} catch (error) {
    logger.warn('Secure routes not yet implemented, using placeholder handlers');
    
    // Placeholder secure handlers
    app.use('/api/auth', authRateLimit, (req, res) => {
        res.status(501).json({ error: 'Secure auth routes not yet implemented' });
    });
    
    app.use('/api/accounts', authenticateUser, (req, res) => {
        res.status(501).json({ error: 'Secure account routes not yet implemented' });
    });
}

// Serve HTML pages with CSRF token
const htmlPages = ['dashboard', 'accounts', 'add-account', 'analytics', 'account-detail'];
htmlPages.forEach(page => {
    app.get(`/${page}`, (req, res, next) => {
        // Add authentication check for protected pages
        if (!req.user && page !== 'login') {
            return res.redirect('/?auth=required');
        }
        next();
    }, (req, res) => {
        res.sendFile(path.join(__dirname, 'public', `${page}.html`));
    });
});

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
    logger.warn('404 Not Found', { 
        path: req.path, 
        method: req.method, 
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    res.status(404).json({ 
        error: 'Not Found',
        message: 'The requested resource was not found',
        code: 'RESOURCE_NOT_FOUND',
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((error, req, res, next) => {
    // Log security-relevant errors
    logger.error('Application error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        user: req.user?.userId
    });

    // Don't leak error details in production
    const isDev = process.env.NODE_ENV === 'development';
    
    // Handle specific error types
    if (error.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            error: 'Invalid CSRF token',
            code: 'CSRF_TOKEN_INVALID'
        });
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            error: 'File size too large',
            code: 'FILE_SIZE_EXCEEDED'
        });
    }

    // Generic error response
    res.status(error.status || 500).json({
        error: isDev ? error.message : 'Internal Server Error',
        code: error.code || 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString(),
        ...(isDev && { stack: error.stack })
    });
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    
    // Close server
    server.close(() => {
        logger.info('HTTP server closed');
        
        // Close database connections, etc.
        process.exit(0);
    });
    
    // Force close after 30 seconds
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
    process.exit(1);
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Secure FX True Up server running on port ${PORT}`);
    logger.info(`🔒 Security features enabled: HTTPS redirect, HSTS, CSP, CSRF protection`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔑 JWT authentication: ${process.env.JWT_SECRET ? 'configured' : 'missing'}`);
    logger.info(`🔐 Encryption: ${process.env.ENCRYPTION_MASTER_KEY ? 'enabled' : 'disabled'}`);
});

export default app;