// Subscription Middleware for FXTrueUp
// Checks subscription status for protected routes

const BillingService = require('./billing-service.cjs');

class SubscriptionMiddleware {
    constructor() {
        this.billingService = new BillingService();
        
        // Routes that require active subscription
        this.protectedRoutes = [
            '/api/accounts/:id/details',
            '/api/accounts/:id/history',
            '/api/accounts/:id/metrics',
            '/api/accounts/:id/positions'
        ];
        
        // Routes that allow grace period access
        this.gracePeriodRoutes = [
            '/api/accounts',
            '/api/accounts/:id'
        ];
    }

    // Middleware to check subscription status
    checkSubscription(options = {}) {
        const { allowGracePeriod = false, requirePlan = null } = options;
        
        return async (req, res, next) => {
            try {
                // Skip check for non-authenticated requests
                if (!req.user || !req.user.id) {
                    return next();
                }

                const userId = req.user.id;
                
                // Check if user has active subscription
                const hasActive = await this.billingService.hasActiveSubscription(userId);
                
                if (hasActive) {
                    // Check if specific plan is required
                    if (requirePlan) {
                        const subscription = await this.billingService.getUserSubscription(userId);
                        if (subscription && subscription.plan_id !== requirePlan) {
                            return res.status(403).json({
                                success: false,
                                error: 'Subscription plan upgrade required',
                                requiredPlan: requirePlan,
                                currentPlan: subscription.plan_id,
                                upgradeUrl: '/api/billing/plans'
                            });
                        }
                    }
                    return next();
                }

                // Check if in grace period (for failed payments)
                if (allowGracePeriod) {
                    const inGracePeriod = await this.billingService.isInGracePeriod(userId);
                    if (inGracePeriod) {
                        // Add warning header but allow access
                        res.set('X-Grace-Period-Warning', 'true');
                        return next();
                    }
                }

                // No active subscription and not in grace period
                const subscription = await this.billingService.getUserSubscription(userId);
                
                return res.status(402).json({
                    success: false,
                    error: 'Active subscription required',
                    subscriptionStatus: subscription ? subscription.status : 'none',
                    plansUrl: '/api/billing/plans',
                    billingPortalUrl: '/api/billing/portal'
                });
                
            } catch (error) {
                console.error('Subscription check error:', error);
                // In case of error, allow access but log the issue
                next();
            }
        };
    }

    // Check account limits based on subscription plan
    checkAccountLimit() {
        return async (req, res, next) => {
            try {
                if (!req.user || !req.user.id) {
                    return next();
                }

                const userId = req.user.id;
                const subscription = await this.billingService.getUserSubscription(userId);
                
                if (!subscription) {
                    // No subscription - allow 1 account (basic/trial)
                    req.accountLimit = 1;
                    return next();
                }

                // Set account limit based on plan
                req.accountLimit = subscription.max_accounts || 1;
                
                next();
            } catch (error) {
                console.error('Account limit check error:', error);
                req.accountLimit = 1; // Default to 1 account on error
                next();
            }
        };
    }

    // Middleware to add subscription info to response
    addSubscriptionInfo() {
        return async (req, res, next) => {
            try {
                if (!req.user || !req.user.id) {
                    return next();
                }

                const userId = req.user.id;
                const subscription = await this.billingService.getUserSubscription(userId);
                const hasActive = await this.billingService.hasActiveSubscription(userId);
                const inGracePeriod = await this.billingService.isInGracePeriod(userId);

                // Add subscription info to response headers
                res.set({
                    'X-Subscription-Status': subscription ? subscription.status : 'none',
                    'X-Subscription-Plan': subscription ? subscription.plan_id : 'none',
                    'X-Has-Active-Subscription': hasActive.toString(),
                    'X-In-Grace-Period': inGracePeriod.toString(),
                    'X-Account-Limit': subscription ? subscription.max_accounts.toString() : '1'
                });

                next();
            } catch (error) {
                console.error('Add subscription info error:', error);
                next();
            }
        };
    }

    // Get subscription features for plan
    async getPlanFeatures(planId) {
        const plans = await this.billingService.getSubscriptionPlans();
        const plan = plans.find(p => p.id === planId);
        return plan ? plan.features : {};
    }

    // Check if feature is available for user's plan
    checkFeature(featureName) {
        return async (req, res, next) => {
            try {
                if (!req.user || !req.user.id) {
                    return next();
                }

                const userId = req.user.id;
                const subscription = await this.billingService.getUserSubscription(userId);
                
                if (!subscription) {
                    return res.status(403).json({
                        success: false,
                        error: `Feature '${featureName}' requires an active subscription`,
                        feature: featureName,
                        plansUrl: '/api/billing/plans'
                    });
                }

                const features = await this.getPlanFeatures(subscription.plan_id);
                
                if (!features[featureName]) {
                    return res.status(403).json({
                        success: false,
                        error: `Feature '${featureName}' not available in your current plan`,
                        feature: featureName,
                        currentPlan: subscription.plan_id,
                        upgradeUrl: '/api/billing/plans'
                    });
                }

                next();
            } catch (error) {
                console.error('Feature check error:', error);
                next();
            }
        };
    }

    // Close database connection
    async close() {
        if (this.billingService) {
            await this.billingService.close();
        }
    }
}

module.exports = SubscriptionMiddleware;