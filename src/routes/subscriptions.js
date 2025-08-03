import express from 'express';
import stripeService from '../services/stripe.js';
import { authenticateUser } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Create checkout session
router.post('/checkout', authenticateUser, async (req, res) => {
  try {
    const { priceId, successUrl, cancelUrl } = req.body;
    const { userId, email } = req.user;

    if (!priceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }

    const session = await stripeService.createCheckoutSession(
      userId,
      email,
      priceId,
      successUrl || `${process.env.API_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl || `${process.env.API_URL}/pricing`
    );

    res.json({ 
      sessionId: session.id,
      url: session.url 
    });
  } catch (error) {
    logger.error('Checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get subscription details
router.get('/current', authenticateUser, async (req, res) => {
  try {
    const { subscriptionId } = req.user;

    if (!subscriptionId) {
      return res.json({
        active: false,
        plan: 'free',
        limits: stripeService.getPlanLimits('free')
      });
    }

    const subscription = await stripeService.getSubscription(subscriptionId);
    const plan = stripeService.getPlanFromPriceId(subscription.items.data[0].price.id);

    res.json({
      active: subscription.status === 'active' || subscription.status === 'trialing',
      status: subscription.status,
      plan: plan.plan,
      interval: plan.interval,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      limits: stripeService.getPlanLimits(plan.plan)
    });
  } catch (error) {
    logger.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription details' });
  }
});

// Update subscription (upgrade/downgrade)
router.post('/update', authenticateUser, async (req, res) => {
  try {
    const { newPriceId } = req.body;
    const { subscriptionId } = req.user;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    if (!newPriceId) {
      return res.status(400).json({ error: 'New price ID is required' });
    }

    const updatedSubscription = await stripeService.updateSubscription(
      subscriptionId,
      newPriceId
    );

    const plan = stripeService.getPlanFromPriceId(newPriceId);

    res.json({
      success: true,
      subscription: {
        status: updatedSubscription.status,
        plan: plan.plan,
        interval: plan.interval,
        limits: stripeService.getPlanLimits(plan.plan)
      }
    });
  } catch (error) {
    logger.error('Update subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Cancel subscription
router.post('/cancel', authenticateUser, async (req, res) => {
  try {
    const { immediately = false } = req.body;
    const { subscriptionId } = req.user;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const canceledSubscription = await stripeService.cancelSubscription(
      subscriptionId,
      immediately
    );

    res.json({
      success: true,
      canceledAt: immediately ? new Date() : new Date(canceledSubscription.current_period_end * 1000),
      immediately
    });
  } catch (error) {
    logger.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Create billing portal session
router.post('/portal', authenticateUser, async (req, res) => {
  try {
    const { stripeCustomerId } = req.user;
    const { returnUrl } = req.body;

    if (!stripeCustomerId) {
      return res.status(400).json({ error: 'No customer found' });
    }

    const session = await stripeService.createPortalSession(
      stripeCustomerId,
      returnUrl || `${process.env.API_URL}/dashboard`
    );

    res.json({ url: session.url });
  } catch (error) {
    logger.error('Portal session error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// Get available plans
router.get('/plans', async (req, res) => {
  const plans = [
    {
      id: 'byo',
      name: 'BYO',
      description: 'Bring Your Own MyFxBook',
      monthlyPrice: 5,
      annualPrice: 48,
      accounts: 'Unlimited*',
      features: [
        'MyFxBook API Integration',
        'Monthly & Quarterly Reports',
        'CSV Export',
        'Public Profile Sharing',
        '*Limited by MyFxBook API'
      ]
    },
    {
      id: 'starter',
      name: 'Starter',
      description: 'Perfect for individual traders',
      monthlyPrice: 15,
      annualPrice: 144,
      accounts: 1,
      features: [
        'Direct MT4/MT5 Connection',
        'MyFxBook Integration',
        'All Report Types',
        'CSV & PDF Export',
        'Public Profile Sharing'
      ]
    },
    {
      id: 'trader',
      name: 'Trader',
      description: 'For serious traders with multiple accounts',
      monthlyPrice: 35,
      annualPrice: 336,
      accounts: 3,
      features: [
        'Everything in Starter',
        'Account Comparisons',
        'Tax Reports',
        'Advanced Analytics'
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      description: 'Professional traders and signal providers',
      monthlyPrice: 75,
      annualPrice: 720,
      accounts: 10,
      features: [
        'Everything in Trader',
        'API Access',
        'Webhooks',
        'Priority Support'
      ]
    },
    {
      id: 'portfolio',
      name: 'Portfolio',
      description: 'For fund managers and agencies',
      monthlyPrice: 149,
      annualPrice: 1430,
      accounts: 25,
      features: [
        'Everything in Pro',
        'White Label Options',
        'Custom Branding',
        'Dedicated Support'
      ]
    }
  ];

  res.json(plans);
});

export default router;