const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const stripe = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;

class BillingService {
    constructor(dbPath = './cache.db') {
        this.db = new sqlite3.Database(dbPath);
        this.gracePeriodDays = 3; // 3-day grace period for failed payments
    }

    // Initialize Stripe products and prices
    async initializeStripeProducts() {
        if (!stripe) {
            console.warn("⚠️  Stripe not configured - billing features disabled");
            return null;
        }
        try {
            // Create main product
            const product = await stripe.products.create({
                id: 'fxtrueup_plans',
                name: 'FXTrueUp Subscription Plans',
                description: 'Professional MetaTrader portfolio tracking and analytics'
            });

            // Create prices
            const prices = await Promise.all([
                stripe.prices.create({
                    id: 'price_basic_monthly',
                    product: product.id,
                    unit_amount: 999, // $9.99
                    currency: 'usd',
                    recurring: { interval: 'month' },
                    nickname: 'Basic Monthly'
                }),
                stripe.prices.create({
                    id: 'price_professional_monthly', 
                    product: product.id,
                    unit_amount: 2999, // $29.99
                    currency: 'usd',
                    recurring: { interval: 'month' },
                    nickname: 'Professional Monthly'
                }),
                stripe.prices.create({
                    id: 'price_enterprise_monthly',
                    product: product.id,
                    unit_amount: 14999, // $149.99
                    currency: 'usd',
                    recurring: { interval: 'month' },
                    nickname: 'Enterprise Monthly'
                })
            ]);

            console.log('✅ Stripe products and prices initialized');
            return { product, prices };
        } catch (error) {
            if (error.code === 'resource_already_exists') {
                console.log('ℹ️  Stripe products already exist');
                return null;
            }
            throw error;
        }
    }

    // Create or get Stripe customer
    async createOrGetCustomer(userId, email, name) {
        return new Promise((resolve, reject) => {
            // First check if user already has a Stripe customer ID
            this.db.get(
                'SELECT stripe_customer_id FROM users WHERE id = ?',
                [userId],
                async (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (row && row.stripe_customer_id) {
                        resolve(row.stripe_customer_id);
                        return;
                    }

                    try {
                        // Create new Stripe customer
                        const customer = await stripe.customers.create({
                            email: email,
                            name: name,
                            metadata: { userId: userId }
                        });

                        // Update user record with Stripe customer ID
                        this.db.run(
                            `INSERT OR REPLACE INTO users (id, email, name, stripe_customer_id, updated_at)
                             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                            [userId, email, name, customer.id],
                            (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(customer.id);
                                }
                            }
                        );
                    } catch (stripeError) {
                        reject(stripeError);
                    }
                }
            );
        });
    }

    // Create subscription
    async createSubscription(userId, email, name, priceId, paymentMethodId, trialDays = null) {
        try {
            const customerId = await this.createOrGetCustomer(userId, email, name);
            
            // Attach payment method to customer
            if (paymentMethodId) {
                await stripe.paymentMethods.attach(paymentMethodId, {
                    customer: customerId,
                });
                
                // Set as default payment method
                await stripe.customers.update(customerId, {
                    invoice_settings: {
                        default_payment_method: paymentMethodId,
                    },
                });
            }

            const subscriptionParams = {
                customer: customerId,
                items: [{ price: priceId }],
                payment_behavior: 'default_incomplete',
                payment_settings: {
                    save_default_payment_method: 'on_subscription'
                },
                expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
                metadata: { userId: userId }
            };

            // Add trial if specified
            if (trialDays) {
                subscriptionParams.trial_period_days = trialDays;
            }

            const subscription = await stripe.subscriptions.create(subscriptionParams);

            // Save subscription to database
            await this.saveSubscriptionToDb(subscription);

            return {
                subscription,
                clientSecret: subscription.latest_invoice?.payment_intent?.client_secret || 
                             subscription.pending_setup_intent?.client_secret
            };
        } catch (error) {
            console.error('Error creating subscription:', error);
            throw error;
        }
    }

    // Save subscription to database
    async saveSubscriptionToDb(subscription) {
        return new Promise((resolve, reject) => {
            const subscriptionId = uuidv4();
            const userId = subscription.metadata.userId;
            const planId = this.getPlanIdFromPrice(subscription.items.data[0].price.id);
            
            const gracePeriodEnd = new Date();
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + this.gracePeriodDays);

            this.db.run(
                `INSERT OR REPLACE INTO user_subscriptions 
                (id, user_id, stripe_subscription_id, stripe_customer_id, plan_id, status,
                 current_period_start, current_period_end, cancel_at_period_end, 
                 trial_start, trial_end, grace_period_end, metadata, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    subscriptionId,
                    userId,
                    subscription.id,
                    subscription.customer,
                    planId,
                    subscription.status,
                    new Date(subscription.current_period_start * 1000).toISOString(),
                    new Date(subscription.current_period_end * 1000).toISOString(),
                    subscription.cancel_at_period_end,
                    subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
                    subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
                    gracePeriodEnd.toISOString(),
                    JSON.stringify(subscription.metadata || {})
                ],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(subscriptionId);
                    }
                }
            );
        });
    }

    // Update subscription
    async updateSubscription(subscriptionId, priceId) {
        try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
                items: [{
                    id: subscription.items.data[0].id,
                    price: priceId,
                }],
                proration_behavior: 'create_prorations'
            });

            await this.saveSubscriptionToDb(updatedSubscription);
            return updatedSubscription;
        } catch (error) {
            console.error('Error updating subscription:', error);
            throw error;
        }
    }

    // Cancel subscription
    async cancelSubscription(subscriptionId, cancelImmediately = false) {
        try {
            const subscription = await stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: !cancelImmediately
            });

            if (cancelImmediately) {
                await stripe.subscriptions.cancel(subscriptionId);
            }

            await this.updateSubscriptionStatus(subscriptionId, subscription.status, {
                cancel_at_period_end: subscription.cancel_at_period_end,
                canceled_at: cancelImmediately ? new Date().toISOString() : null
            });

            return subscription;
        } catch (error) {
            console.error('Error canceling subscription:', error);
            throw error;
        }
    }

    // Get user subscription
    async getUserSubscription(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT us.*, sp.name as plan_name, sp.amount, sp.features, sp.max_accounts
                 FROM user_subscriptions us
                 LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
                 WHERE us.user_id = ? AND us.status IN ('active', 'trialing', 'past_due')
                 ORDER BY us.created_at DESC
                 LIMIT 1`,
                [userId],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    // Check if user has active subscription
    async hasActiveSubscription(userId) {
        const subscription = await this.getUserSubscription(userId);
        return subscription && ['active', 'trialing'].includes(subscription.status);
    }

    // Create billing portal session
    async createBillingPortalSession(customerId, returnUrl) {
        try {
            const session = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl,
            });
            return session;
        } catch (error) {
            console.error('Error creating billing portal session:', error);
            throw error;
        }
    }

    // Add payment method
    async addPaymentMethod(userId, paymentMethodId) {
        try {
            const user = await this.getUserByIdWithStripeCustomer(userId);
            if (!user || !user.stripe_customer_id) {
                throw new Error('User not found or no Stripe customer');
            }

            const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
                customer: user.stripe_customer_id,
            });

            await this.savePaymentMethodToDb(userId, paymentMethod);
            return paymentMethod;
        } catch (error) {
            console.error('Error adding payment method:', error);
            throw error;
        }
    }

    // Save payment method to database
    async savePaymentMethodToDb(userId, paymentMethod) {
        return new Promise((resolve, reject) => {
            const pmId = uuidv4();
            this.db.run(
                `INSERT OR REPLACE INTO payment_methods 
                (id, user_id, stripe_payment_method_id, stripe_customer_id, type, 
                 card_brand, card_last4, card_exp_month, card_exp_year)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    pmId,
                    userId,
                    paymentMethod.id,
                    paymentMethod.customer,
                    paymentMethod.type,
                    paymentMethod.card?.brand || null,
                    paymentMethod.card?.last4 || null,
                    paymentMethod.card?.exp_month || null,
                    paymentMethod.card?.exp_year || null
                ],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(pmId);
                    }
                }
            );
        });
    }

    // Handle webhook events
    async handleWebhook(event) {
        try {
            // Log webhook event
            await this.logWebhookEvent(event);

            switch (event.type) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    await this.handleSubscriptionChange(event.data.object);
                    break;
                
                case 'customer.subscription.deleted':
                    await this.handleSubscriptionDeleted(event.data.object);
                    break;
                
                case 'invoice.payment_succeeded':
                    await this.handlePaymentSucceeded(event.data.object);
                    break;
                
                case 'invoice.payment_failed':
                    await this.handlePaymentFailed(event.data.object);
                    break;
                
                case 'customer.subscription.trial_will_end':
                    await this.handleTrialWillEnd(event.data.object);
                    break;
                
                default:
                    console.log(`Unhandled event type: ${event.type}`);
            }

            await this.markWebhookProcessed(event.id);
        } catch (error) {
            console.error('Error handling webhook:', error);
            await this.logWebhookError(event.id, error.message);
        }
    }

    // Helper methods
    async handleSubscriptionChange(subscription) {
        await this.saveSubscriptionToDb(subscription);
    }

    async handleSubscriptionDeleted(subscription) {
        await this.updateSubscriptionStatus(subscription.id, 'canceled', {
            canceled_at: new Date().toISOString()
        });
    }

    async handlePaymentSucceeded(invoice) {
        // Update subscription status if it was past_due
        if (invoice.subscription) {
            await this.updateSubscriptionStatus(invoice.subscription, 'active');
        }
        await this.saveInvoiceToDb(invoice);
    }

    async handlePaymentFailed(invoice) {
        // Set grace period
        if (invoice.subscription) {
            const gracePeriodEnd = new Date();
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + this.gracePeriodDays);
            
            await this.updateSubscriptionStatus(invoice.subscription, 'past_due', {
                grace_period_ends_at: gracePeriodEnd.toISOString()
            });
        }
        
        await this.saveInvoiceToDb(invoice);
        await this.logPaymentAttempt(invoice, 'failed');
    }

    async handleTrialWillEnd(subscription) {
        // Notify user about trial ending
        console.log(`Trial will end for subscription: ${subscription.id}`);
        // Here you could send an email notification
    }

    // Database helper methods
    async updateSubscriptionStatus(stripeSubscriptionId, status, additionalFields = {}) {
        return new Promise((resolve, reject) => {
            // Whitelist allowed fields to prevent SQL injection
            const allowedFields = [
                'grace_period_ends_at',
                'cancel_at_period_end',
                'canceled_at',
                'trial_ends_at',
                'current_period_end',
                'plan_id'
            ];

            let setClause = 'status = ?, updated_at = CURRENT_TIMESTAMP';
            let params = [status];

            // Only process whitelisted fields
            Object.entries(additionalFields).forEach(([key, value]) => {
                if (allowedFields.includes(key)) {
                    setClause += `, ${key} = ?`;
                    params.push(value);
                } else {
                    console.warn(`Attempted to update non-whitelisted field: ${key}`);
                }
            });

            params.push(stripeSubscriptionId);

            this.db.run(
                `UPDATE user_subscriptions SET ${setClause} WHERE stripe_subscription_id = ?`,
                params,
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async saveInvoiceToDb(invoice) {
        return new Promise((resolve, reject) => {
            const invoiceId = uuidv4();
            this.db.run(
                `INSERT OR REPLACE INTO invoices 
                (id, stripe_invoice_id, amount_paid, amount_due, currency, status, 
                 invoice_pdf, hosted_invoice_url, period_start, period_end, 
                 due_date, paid_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    invoiceId,
                    invoice.id,
                    invoice.amount_paid,
                    invoice.amount_due,
                    invoice.currency,
                    invoice.status,
                    invoice.invoice_pdf,
                    invoice.hosted_invoice_url,
                    new Date(invoice.period_start * 1000).toISOString(),
                    new Date(invoice.period_end * 1000).toISOString(),
                    invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
                    invoice.status_transitions.paid_at ? 
                        new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null
                ],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(invoiceId);
                    }
                }
            );
        });
    }

    async logPaymentAttempt(invoice, status, failureCode = null, failureMessage = null) {
        return new Promise((resolve, reject) => {
            const attemptId = uuidv4();
            this.db.run(
                `INSERT INTO payment_attempts 
                (id, stripe_payment_intent_id, amount, currency, status, 
                 failure_code, failure_message)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    attemptId,
                    invoice.payment_intent,
                    invoice.amount_due,
                    invoice.currency,
                    status,
                    failureCode,
                    failureMessage
                ],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(attemptId);
                    }
                }
            );
        });
    }

    async logWebhookEvent(event) {
        return new Promise((resolve, reject) => {
            const eventId = uuidv4();
            this.db.run(
                `INSERT OR IGNORE INTO webhook_events 
                (id, stripe_event_id, event_type, data)
                VALUES (?, ?, ?, ?)`,
                [eventId, event.id, event.type, JSON.stringify(event)],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(eventId);
                    }
                }
            );
        });
    }

    async markWebhookProcessed(eventId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE webhook_events SET processed = true, processed_at = CURRENT_TIMESTAMP 
                 WHERE stripe_event_id = ?`,
                [eventId],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async logWebhookError(eventId, errorMessage) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE webhook_events SET error_message = ?, retry_count = retry_count + 1 
                 WHERE stripe_event_id = ?`,
                [errorMessage, eventId],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async getUserByIdWithStripeCustomer(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    getPlanIdFromPrice(priceId) {
        const priceToPlaneMap = {
            'price_basic_monthly': 'basic_monthly',
            'price_professional_monthly': 'professional_monthly',
            'price_enterprise_monthly': 'enterprise_monthly'
        };
        return priceToPlaneMap[priceId] || 'basic_monthly';
    }

    // Get subscription plans
    async getSubscriptionPlans() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY amount ASC',
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows.map(row => ({
                            ...row,
                            features: JSON.parse(row.features || '{}')
                        })));
                    }
                }
            );
        });
    }

    // Check if user is in grace period
    async isInGracePeriod(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT grace_period_end FROM user_subscriptions 
                 WHERE user_id = ? AND status = 'past_due' 
                 AND grace_period_end > datetime('now')`,
                [userId],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(!!row);
                    }
                }
            );
        });
    }

    // Close database connection
    async close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                }
                resolve();
            });
        });
    }
}

module.exports = BillingService;