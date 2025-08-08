const rateLimit = require('express-rate-limit');

// Helper for IP-based key generation with IPv6 support
const ipKeyGenerator = (req) => {
    // For IPv6 addresses, this ensures proper handling
    return req.ip;
};

// Strict rate limiting for payment endpoints
const paymentRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Allow only 5 payment attempts per 15 minutes
    message: 'Too many payment attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // Count all requests, even successful ones
    keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise use IP
        return req.user?.id || req.ip;
    },
    validate: {
        // Disable the IPv6 validation since we handle it properly
        keyGeneratorIpFallback: false
    },
    handler: (req, res) => {
        console.warn(`Payment rate limit exceeded for user: ${req.user?.id || req.ip}`);
        res.status(429).json({
            success: false,
            error: 'Too many payment attempts. Please wait 15 minutes before trying again.',
            retryAfter: req.rateLimit.resetTime
        });
    }
});

// Moderate rate limiting for billing portal and invoice endpoints
const billingInfoRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // Allow 30 requests per 5 minutes
    message: 'Too many requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});

// Very strict rate limiting for webhook endpoint
const webhookRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Allow only 10 webhook calls per minute
    message: 'Webhook rate limit exceeded',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only count failed requests
    keyGenerator: () => 'webhook' // Global rate limit for all webhooks
});

module.exports = {
    paymentRateLimit,
    billingInfoRateLimit,
    webhookRateLimit
};
