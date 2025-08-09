// Billing API Endpoints for FXTrueUp
// This file contains all the billing-related routes and middleware

const BillingService = require('./billing-service.cjs');
const jwt = require('jsonwebtoken');
const stripe = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;
const { paymentRateLimit, billingInfoRateLimit, webhookRateLimit } = require('./payment-rate-limit.cjs');

// Initialize billing service
const billingService = new BillingService();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Middleware to verify Stripe webhook signature
const verifyStripeWebhook = (req, res, next) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // Check if webhook secret is configured
    if (!endpointSecret) {
        console.error('STRIPE_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'Webhook configuration error' });
    }

    // Verify signature exists
    if (!sig) {
        console.error('Missing stripe-signature header');
        return res.status(400).json({ error: 'Missing required signature' });
    }

    try {
        req.stripeEvent = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        next();
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        // Don't expose internal error details
        return res.status(400).json({ error: 'Invalid signature' });
    }
};

// Initialize billing routes
function initializeBillingRoutes(app) {
    
    // Check if Stripe is configured
    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
        console.warn("⚠️  Stripe not configured - billing endpoints disabled");
        return;
    }
    
    // ==============================================
    // SUBSCRIPTION MANAGEMENT ENDPOINTS
    // ==============================================
    
    // Get subscription plans
    app.get('/api/billing/plans', async (req, res) => {
        try {
            const plans = await billingService.getSubscriptionPlans();
            res.json({
                success: true,
                plans: plans
            });
        } catch (error) {
            console.error('Error getting subscription plans:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get subscription plans'
            });
        }
    });

    // Get user's current subscription
    app.get('/api/billing/subscription', authenticateToken, async (req, res) => {
        try {
            const subscription = await billingService.getUserSubscription(req.user.id);
            const hasActive = await billingService.hasActiveSubscription(req.user.id);
            const inGracePeriod = await billingService.isInGracePeriod(req.user.id);

            res.json({
                success: true,
                subscription: subscription,
                hasActive: hasActive,
                inGracePeriod: inGracePeriod
            });
        } catch (error) {
            console.error('Error getting user subscription:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get subscription'
            });
        }
    });

    // Create new subscription
    app.post('/api/billing/subscription', authenticateToken, paymentRateLimit, async (req, res) => {
        try {
            const { priceId, paymentMethodId, trialDays } = req.body;
            const { email, name } = req.user;

            if (!priceId) {
                return res.status(400).json({
                    success: false,
                    error: 'Price ID is required'
                });
            }

            const result = await billingService.createSubscription(
                req.user.id,
                email,
                name,
                priceId,
                paymentMethodId,
                trialDays
            );

            res.json({
                success: true,
                subscription: result.subscription,
                clientSecret: result.clientSecret
            });
        } catch (error) {
            console.error('Error creating subscription:', error);
            
            // Sanitize Stripe errors for client
            let clientError = 'Failed to create subscription';
            if (error.type === 'StripeCardError') {
                // Safe to expose card errors to user
                clientError = error.message;
            } else if (error.code === 'resource_missing') {
                clientError = 'Invalid price or plan selected';
            }
            
            res.status(500).json({
                success: false,
                error: clientError
            });
        }
    });

    // Update subscription (change plan)
    app.put('/api/billing/subscription', authenticateToken, paymentRateLimit, async (req, res) => {
        try {
            const { priceId } = req.body;
            
            if (!priceId) {
                return res.status(400).json({
                    success: false,
                    error: 'Price ID is required'
                });
            }

            const currentSubscription = await billingService.getUserSubscription(req.user.id);
            if (!currentSubscription) {
                return res.status(404).json({
                    success: false,
                    error: 'No active subscription found'
                });
            }

            const updatedSubscription = await billingService.updateSubscription(
                currentSubscription.stripe_subscription_id,
                priceId
            );

            res.json({
                success: true,
                subscription: updatedSubscription
            });
        } catch (error) {
            console.error('Error updating subscription:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update subscription'
            });
        }
    });

    // Cancel subscription
    app.delete('/api/billing/subscription', authenticateToken, async (req, res) => {
        try {
            const { cancelImmediately = false } = req.body;
            
            const currentSubscription = await billingService.getUserSubscription(req.user.id);
            if (!currentSubscription) {
                return res.status(404).json({
                    success: false,
                    error: 'No active subscription found'
                });
            }

            const canceledSubscription = await billingService.cancelSubscription(
                currentSubscription.stripe_subscription_id,
                cancelImmediately
            );

            res.json({
                success: true,
                subscription: canceledSubscription,
                message: cancelImmediately ? 
                    'Subscription canceled immediately' : 
                    'Subscription will cancel at the end of the current period'
            });
        } catch (error) {
            console.error('Error canceling subscription:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to cancel subscription'
            });
        }
    });

    // ==============================================
    // PAYMENT METHOD MANAGEMENT
    // ==============================================

    // Create payment method setup intent
    app.post('/api/billing/setup-intent', authenticateToken, paymentRateLimit, async (req, res) => {
        try {
            const customerId = await billingService.createOrGetCustomer(
                req.user.id,
                req.user.email,
                req.user.name
            );

            const setupIntent = await stripe.setupIntents.create({
                customer: customerId,
                payment_method_types: ['card'],
                usage: 'off_session'
            });

            res.json({
                success: true,
                clientSecret: setupIntent.client_secret
            });
        } catch (error) {
            console.error('Error creating setup intent:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create setup intent'
            });
        }
    });

    // Add payment method
    app.post('/api/billing/payment-method', authenticateToken, paymentRateLimit, async (req, res) => {
        try {
            const { paymentMethodId } = req.body;
            
            if (!paymentMethodId) {
                return res.status(400).json({
                    success: false,
                    error: 'Payment method ID is required'
                });
            }

            const paymentMethod = await billingService.addPaymentMethod(
                req.user.id,
                paymentMethodId
            );

            res.json({
                success: true,
                paymentMethod: paymentMethod
            });
        } catch (error) {
            console.error('Error adding payment method:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add payment method'
            });
        }
    });

    // ==============================================
    // BILLING PORTAL INTEGRATION
    // ==============================================

    // Create billing portal session
    app.post('/api/billing/portal', authenticateToken, billingInfoRateLimit, async (req, res) => {
        try {
            const { returnUrl = `${process.env.API_URL}/dashboard` } = req.body;
            
            const customerId = await billingService.createOrGetCustomer(
                req.user.id,
                req.user.email,
                req.user.name
            );

            const session = await billingService.createBillingPortalSession(
                customerId,
                returnUrl
            );

            res.json({
                success: true,
                url: session.url
            });
        } catch (error) {
            console.error('Error creating billing portal session:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create billing portal session'
            });
        }
    });

    // ==============================================
    // STRIPE WEBHOOK ENDPOINT
    // ==============================================

    // Stripe webhook handler
    app.post('/api/billing/webhook', 
        webhookRateLimit,
        // Parse raw body for webhook signature verification
        (req, res, next) => {
            if (req.is('application/json')) {
                let data = '';
                req.setEncoding('utf8');
                req.on('data', chunk => data += chunk);
                req.on('end', () => {
                    req.body = data;
                    next();
                });
            } else {
                next();
            }
        },
        verifyStripeWebhook,
        async (req, res) => {
            try {
                await billingService.handleWebhook(req.stripeEvent);
                res.json({ received: true });
            } catch (error) {
                console.error('Error handling webhook:', error);
                res.status(500).json({ error: 'Webhook handler failed' });
            }
        }
    );

    // ==============================================
    // INVOICE AND RECEIPT ENDPOINTS
    // ==============================================

    // Get user invoices
    app.get('/api/billing/invoices', authenticateToken, billingInfoRateLimit, async (req, res) => {
        try {
            const customerId = await billingService.createOrGetCustomer(
                req.user.id,
                req.user.email,
                req.user.name
            );

            const invoices = await stripe.invoices.list({
                customer: customerId,
                limit: 10
            });

            res.json({
                success: true,
                invoices: invoices.data
            });
        } catch (error) {
            console.error('Error getting invoices:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get invoices'
            });
        }
    });

    // Download invoice PDF
    app.get('/api/billing/invoice/:invoiceId/pdf', authenticateToken, async (req, res) => {
        try {
            const { invoiceId } = req.params;
            
            const invoice = await stripe.invoices.retrieve(invoiceId);
            
            // Verify invoice belongs to user
            const customerId = await billingService.createOrGetCustomer(
                req.user.id,
                req.user.email,
                req.user.name
            );
            
            if (invoice.customer !== customerId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            if (!invoice.invoice_pdf) {
                return res.status(404).json({
                    success: false,
                    error: 'PDF not available'
                });
            }

            // Redirect to Stripe-hosted PDF
            res.redirect(invoice.invoice_pdf);
        } catch (error) {
            console.error('Error getting invoice PDF:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get invoice PDF'
            });
        }
    });

    // ==============================================
    // SUBSCRIPTION STATUS AND ANALYTICS
    // ==============================================

    // Get billing analytics for admin
    app.get('/api/billing/analytics', authenticateToken, async (req, res) => {
        try {
            // Basic analytics - you can expand this
            const analytics = {
                message: 'Billing analytics endpoint - implement based on needs'
            };

            res.json({
                success: true,
                analytics: analytics
            });
        } catch (error) {
            console.error('Error getting billing analytics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get billing analytics'
            });
        }
    });

    console.log('✅ Billing endpoints initialized');
}

module.exports = {
    initializeBillingRoutes,
    authenticateToken,
    verifyStripeWebhook,
    billingService
};