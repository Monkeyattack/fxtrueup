import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { auth } from '../services/firebase.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

// Secure JWT secret from environment with validation
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
}

// Rate limiting for auth endpoints
export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: 15 * 60 // seconds
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Custom key generator to include user identifier if available
    keyGenerator: (req) => {
        return req.ip + (req.body?.email || '');
    }
});

// Brute force protection
const failedAttempts = new Map();
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

function checkBruteForce(identifier) {
    const attempts = failedAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
    
    if (attempts.count >= LOCKOUT_THRESHOLD) {
        const timeLeft = LOCKOUT_DURATION - (Date.now() - attempts.lastAttempt);
        if (timeLeft > 0) {
            throw new Error(`Account temporarily locked. Try again in ${Math.ceil(timeLeft / 60000)} minutes.`);
        } else {
            // Reset counter after lockout period
            failedAttempts.delete(identifier);
        }
    }
}

function recordFailedAttempt(identifier) {
    const attempts = failedAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
    attempts.count += 1;
    attempts.lastAttempt = Date.now();
    failedAttempts.set(identifier, attempts);
}

// Secure token generation
export function generateSecureToken(payload, expiresIn = '1h') {
    const tokenPayload = {
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID(), // Unique token ID
        sub: payload.userId,
        iss: 'fxtrueup.com'
    };
    
    return jwt.sign(tokenPayload, JWT_SECRET, { 
        expiresIn,
        algorithm: 'HS256',
        issuer: 'fxtrueup.com'
    });
}

export function generateRefreshToken(userId) {
    return jwt.sign(
        { 
            userId, 
            type: 'refresh',
            iat: Math.floor(Date.now() / 1000),
            jti: crypto.randomUUID()
        }, 
        JWT_REFRESH_SECRET, 
        { 
            expiresIn: '7d',
            algorithm: 'HS256',
            issuer: 'fxtrueup.com'
        }
    );
}

// Secure authentication middleware
export async function authenticateUser(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Authentication required',
                code: 'NO_TOKEN'
            });
        }

        const token = authHeader.split('Bearer ')[1];
        
        // Validate token format
        if (!token || token.length < 10) {
            return res.status(401).json({ 
                error: 'Invalid token format',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }

        let decodedToken;
        try {
            // First try JWT validation
            decodedToken = jwt.verify(token, JWT_SECRET, {
                algorithms: ['HS256'],
                issuer: 'fxtrueup.com'
            });
        } catch (jwtError) {
            // Fallback to Firebase token validation for backwards compatibility
            try {
                decodedToken = await auth.verifyIdToken(token);
                decodedToken.isFirebaseToken = true;
            } catch (firebaseError) {
                logger.warn('Token validation failed', { 
                    jwtError: jwtError.message, 
                    firebaseError: firebaseError.message,
                    ip: req.ip
                });
                return res.status(401).json({ 
                    error: 'Invalid or expired token',
                    code: 'TOKEN_VERIFICATION_FAILED'
                });
            }
        }

        // Additional security checks
        if (!decodedToken.userId && !decodedToken.uid) {
            return res.status(401).json({ 
                error: 'Invalid token payload',
                code: 'INVALID_PAYLOAD'
            });
        }

        // Set user context
        req.user = {
            userId: decodedToken.userId || decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified || decodedToken.emailVerified,
            isFirebaseToken: decodedToken.isFirebaseToken || false,
            tokenId: decodedToken.jti
        };

        // Get additional user data from secure storage if needed
        if (req.user.isFirebaseToken) {
            // Legacy Firebase token handling
            try {
                const userDoc = await db.collection('users').doc(req.user.userId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    req.user = {
                        ...req.user,
                        ...userData
                    };
                }
            } catch (error) {
                logger.warn('Failed to fetch user data from Firestore', { userId: req.user.userId });
            }
        }

        // Log successful authentication
        logger.info('User authenticated', { 
            userId: req.user.userId, 
            email: req.user.email,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        next();
    } catch (error) {
        logger.error('Authentication middleware error:', error);
        res.status(500).json({ 
            error: 'Authentication service error',
            code: 'AUTH_SERVICE_ERROR'
        });
    }
}

// Optional authentication middleware
export async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    try {
        await authenticateUser(req, res, next);
    } catch (error) {
        // Don't fail the request, just proceed without auth
        logger.warn('Optional auth failed, proceeding without authentication', { error: error.message });
        next();
    }
}

// Role-based access control
export function requireRole(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Authentication required',
                code: 'NO_AUTH'
            });
        }

        const userRoles = req.user.roles || [];
        const hasPermission = allowedRoles.some(role => userRoles.includes(role)) || 
                             req.user.isAdmin || 
                             req.user.email === process.env.ADMIN_EMAIL;

        if (!hasPermission) {
            logger.warn('Access denied - insufficient permissions', { 
                userId: req.user.userId,
                requiredRoles: allowedRoles,
                userRoles,
                ip: req.ip
            });
            
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: allowedRoles
            });
        }

        next();
    };
}

// Subscription validation with enhanced security
export function requireSubscription(allowedPlans = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Authentication required',
                code: 'NO_AUTH'
            });
        }

        const userPlan = req.user.subscriptionPlan || 'free';
        const isActive = req.user.subscriptionStatus === 'active' || 
                        req.user.subscriptionStatus === 'trialing';
        
        // Check subscription expiry
        if (req.user.subscriptionExpiresAt) {
            const expiryDate = new Date(req.user.subscriptionExpiresAt);
            if (expiryDate < new Date()) {
                return res.status(403).json({ 
                    error: 'Subscription expired',
                    code: 'SUBSCRIPTION_EXPIRED',
                    expiresAt: expiryDate.toISOString()
                });
            }
        }

        // Admin bypass
        if (req.user.isAdmin || req.user.email === process.env.ADMIN_EMAIL) {
            return next();
        }

        // Check if no specific plans required, just active subscription
        if (allowedPlans.length === 0 && !isActive) {
            return res.status(403).json({ 
                error: 'Active subscription required',
                code: 'SUBSCRIPTION_REQUIRED',
                currentPlan: userPlan,
                currentStatus: req.user.subscriptionStatus
            });
        }

        // Check if user's plan is in allowed plans
        if (allowedPlans.length > 0 && (!isActive || !allowedPlans.includes(userPlan))) {
            return res.status(403).json({ 
                error: 'Insufficient subscription plan',
                code: 'INSUFFICIENT_SUBSCRIPTION',
                currentPlan: userPlan,
                currentStatus: req.user.subscriptionStatus,
                requiredPlans: allowedPlans
            });
        }

        next();
    };
}

// Account ownership validation
export function requireAccountOwnership() {
    return async (req, res, next) => {
        const accountId = req.params.accountId || req.params.id;
        
        if (!accountId) {
            return res.status(400).json({ 
                error: 'Account ID required',
                code: 'MISSING_ACCOUNT_ID'
            });
        }

        // Admin bypass
        if (req.user.isAdmin || req.user.email === process.env.ADMIN_EMAIL) {
            return next();
        }

        // Verify user owns the account
        try {
            // This would typically query your database
            // For now, implementing with the existing token store
            const tokenStore = require('../../token-store-commonjs.cjs');
            const userAccounts = tokenStore.getUserAccounts(req.user.userId);
            const account = userAccounts.find(acc => acc.id === accountId);
            
            if (!account) {
                logger.warn('Unauthorized account access attempt', { 
                    userId: req.user.userId,
                    accountId,
                    ip: req.ip
                });
                
                return res.status(403).json({ 
                    error: 'Account access denied',
                    code: 'ACCOUNT_ACCESS_DENIED'
                });
            }

            req.account = account;
            next();
        } catch (error) {
            logger.error('Account ownership check failed', { error: error.message, userId: req.user.userId });
            res.status(500).json({ 
                error: 'Account verification failed',
                code: 'ACCOUNT_VERIFICATION_ERROR'
            });
        }
    };
}

// Token blacklist for logout
const tokenBlacklist = new Set();

export function blacklistToken(tokenId) {
    if (tokenId) {
        tokenBlacklist.add(tokenId);
        // Clean up old tokens periodically
        if (tokenBlacklist.size > 10000) {
            const tokensToRemove = Array.from(tokenBlacklist).slice(0, 5000);
            tokensToRemove.forEach(token => tokenBlacklist.delete(token));
        }
    }
}

export function isTokenBlacklisted(tokenId) {
    return tokenBlacklist.has(tokenId);
}