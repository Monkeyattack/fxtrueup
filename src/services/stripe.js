import Stripe from 'stripe';
import { logger } from '../utils/logger.js';

class StripeService {
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    this.prices = {
      byo_monthly: process.env.STRIPE_PRICE_BYO_MONTHLY,
      byo_annual: process.env.STRIPE_PRICE_BYO_ANNUAL,
      starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
      starter_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
      trader_monthly: process.env.STRIPE_PRICE_TRADER_MONTHLY,
      trader_annual: process.env.STRIPE_PRICE_TRADER_ANNUAL,
      pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
      portfolio_monthly: process.env.STRIPE_PRICE_PORTFOLIO_MONTHLY,
      portfolio_annual: process.env.STRIPE_PRICE_PORTFOLIO_ANNUAL
    };
  }

  async createCustomer(email, userId, metadata = {}) {
    try {
      const customer = await this.stripe.customers.create({
        email,
        metadata: {
          userId,
          ...metadata
        }
      });
      return customer;
    } catch (error) {
      logger.error('Failed to create Stripe customer:', error);
      throw error;
    }
  }

  async createSubscription(customerId, priceId, trialDays = 7) {
    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: trialDays,
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent']
      });
      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription:', error);
      throw error;
    }
  }

  async createCheckoutSession(userId, email, priceId, successUrl, cancelUrl) {
    try {
      // Check if customer exists
      let customer;
      const existingCustomers = await this.stripe.customers.list({ email, limit: 1 });
      
      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
      } else {
        customer = await this.createCustomer(email, userId);
      }

      const session = await this.stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1
        }],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: {
          trial_period_days: this.getTrialDays(priceId),
          metadata: {
            userId,
            plan: this.getPlanFromPriceId(priceId)
          }
        },
        metadata: {
          userId
        }
      });

      return session;
    } catch (error) {
      logger.error('Failed to create checkout session:', error);
      throw error;
    }
  }

  async createPortalSession(customerId, returnUrl) {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl
      });
      return session;
    } catch (error) {
      logger.error('Failed to create portal session:', error);
      throw error;
    }
  }

  async getSubscription(subscriptionId) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      logger.error('Failed to get subscription:', error);
      throw error;
    }
  }

  async cancelSubscription(subscriptionId, immediately = false) {
    try {
      if (immediately) {
        return await this.stripe.subscriptions.cancel(subscriptionId);
      } else {
        return await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
      }
    } catch (error) {
      logger.error('Failed to cancel subscription:', error);
      throw error;
    }
  }

  async updateSubscription(subscriptionId, newPriceId) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      
      return await this.stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: subscription.items.data[0].id,
          price: newPriceId
        }],
        proration_behavior: 'always_invoice'
      });
    } catch (error) {
      logger.error('Failed to update subscription:', error);
      throw error;
    }
  }

  getPlanFromPriceId(priceId) {
    for (const [key, value] of Object.entries(this.prices)) {
      if (value === priceId) {
        const [plan, interval] = key.split('_');
        return { plan, interval };
      }
    }
    return null;
  }

  getTrialDays(priceId) {
    const plan = this.getPlanFromPriceId(priceId);
    if (!plan) return 0;
    
    // BYO plan has no trial
    if (plan.plan === 'byo') return 0;
    
    // All other plans get 7-day trial
    return 7;
  }

  getPlanLimits(plan) {
    const limits = {
      byo: {
        accounts: 999, // Limited by MyFxBook API
        features: ['myfxbook', 'reports', 'public_sharing', 'csv_export']
      },
      starter: {
        accounts: 1,
        features: ['metaapi', 'myfxbook', 'reports', 'public_sharing', 'csv_export', 'pdf_export']
      },
      trader: {
        accounts: 3,
        features: ['metaapi', 'myfxbook', 'reports', 'public_sharing', 'csv_export', 'pdf_export', 'tax_reports', 'comparisons']
      },
      pro: {
        accounts: 10,
        features: ['metaapi', 'myfxbook', 'reports', 'public_sharing', 'csv_export', 'pdf_export', 'tax_reports', 'comparisons', 'api_access', 'webhooks']
      },
      portfolio: {
        accounts: 25,
        features: ['metaapi', 'myfxbook', 'reports', 'public_sharing', 'csv_export', 'pdf_export', 'tax_reports', 'comparisons', 'api_access', 'webhooks', 'white_label', 'priority_support']
      }
    };
    
    return limits[plan] || limits.byo;
  }

  async constructWebhookEvent(payload, signature) {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      logger.error('Webhook signature verification failed:', error);
      throw error;
    }
  }
}

export default new StripeService();