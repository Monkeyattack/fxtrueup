import stripeService from '../services/stripe.js';
import { logger } from '../utils/logger.js';
import { db } from '../services/firebase.js';

export async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  try {
    const event = await stripeService.constructWebhookEvent(req.rawBody, sig);
    
    logger.info(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
        
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      default:
        logger.info(`Unhandled webhook type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
}

async function handleCheckoutCompleted(session) {
  const { customer, subscription, metadata } = session;
  const userId = metadata.userId;

  try {
    // Update user's subscription info in Firestore
    await db.collection('users').doc(userId).update({
      stripeCustomerId: customer,
      stripeSubscriptionId: subscription,
      subscriptionStatus: 'trialing',
      updatedAt: new Date()
    });

    logger.info(`Checkout completed for user ${userId}`);
  } catch (error) {
    logger.error('Error handling checkout completed:', error);
  }
}

async function handleSubscriptionCreated(subscription) {
  const { customer, metadata, status, current_period_end, items } = subscription;
  const userId = metadata.userId;
  const plan = metadata.plan;

  try {
    const planLimits = stripeService.getPlanLimits(plan);
    
    await db.collection('users').doc(userId).update({
      subscriptionId: subscription.id,
      subscriptionStatus: status,
      subscriptionPlan: plan,
      subscriptionEnd: new Date(current_period_end * 1000),
      planLimits: planLimits,
      updatedAt: new Date()
    });

    // Create subscription history record
    await db.collection('subscription_history').add({
      userId,
      subscriptionId: subscription.id,
      event: 'created',
      plan,
      status,
      timestamp: new Date()
    });

    logger.info(`Subscription created for user ${userId}, plan: ${plan}`);
  } catch (error) {
    logger.error('Error handling subscription created:', error);
  }
}

async function handleSubscriptionUpdated(subscription) {
  const { metadata, status, current_period_end, cancel_at_period_end } = subscription;
  const userId = metadata.userId;
  const plan = metadata.plan;

  try {
    const planLimits = stripeService.getPlanLimits(plan);
    
    await db.collection('users').doc(userId).update({
      subscriptionStatus: status,
      subscriptionPlan: plan,
      subscriptionEnd: new Date(current_period_end * 1000),
      cancelAtPeriodEnd: cancel_at_period_end,
      planLimits: planLimits,
      updatedAt: new Date()
    });

    // Log the update
    await db.collection('subscription_history').add({
      userId,
      subscriptionId: subscription.id,
      event: 'updated',
      plan,
      status,
      cancelAtPeriodEnd: cancel_at_period_end,
      timestamp: new Date()
    });

    logger.info(`Subscription updated for user ${userId}`);
  } catch (error) {
    logger.error('Error handling subscription updated:', error);
  }
}

async function handleSubscriptionDeleted(subscription) {
  const { metadata } = subscription;
  const userId = metadata.userId;

  try {
    await db.collection('users').doc(userId).update({
      subscriptionStatus: 'canceled',
      subscriptionEnd: new Date(),
      planLimits: stripeService.getPlanLimits('free'),
      updatedAt: new Date()
    });

    // Deactivate any MetaApi accounts if needed
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (userData.accounts && userData.accounts.length > 0) {
      // Mark accounts as inactive but don't delete data
      for (const account of userData.accounts) {
        await db.collection('accounts').doc(account.id).update({
          active: false,
          deactivatedAt: new Date()
        });
      }
    }

    // Log cancellation
    await db.collection('subscription_history').add({
      userId,
      subscriptionId: subscription.id,
      event: 'canceled',
      timestamp: new Date()
    });

    logger.info(`Subscription canceled for user ${userId}`);
  } catch (error) {
    logger.error('Error handling subscription deleted:', error);
  }
}

async function handlePaymentSucceeded(invoice) {
  const { customer, subscription, metadata } = invoice;
  
  try {
    // Find user by customer ID
    const usersSnapshot = await db.collection('users')
      .where('stripeCustomerId', '==', customer)
      .limit(1)
      .get();

    if (!usersSnapshot.empty) {
      const userId = usersSnapshot.docs[0].id;
      
      await db.collection('users').doc(userId).update({
        lastPaymentDate: new Date(),
        lastPaymentAmount: invoice.amount_paid / 100,
        paymentStatus: 'succeeded',
        updatedAt: new Date()
      });

      // Log payment
      await db.collection('payments').add({
        userId,
        invoiceId: invoice.id,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: 'succeeded',
        timestamp: new Date()
      });

      logger.info(`Payment succeeded for user ${userId}`);
    }
  } catch (error) {
    logger.error('Error handling payment succeeded:', error);
  }
}

async function handlePaymentFailed(invoice) {
  const { customer, subscription } = invoice;
  
  try {
    // Find user by customer ID
    const usersSnapshot = await db.collection('users')
      .where('stripeCustomerId', '==', customer)
      .limit(1)
      .get();

    if (!usersSnapshot.empty) {
      const userId = usersSnapshot.docs[0].id;
      
      await db.collection('users').doc(userId).update({
        paymentStatus: 'failed',
        paymentFailedAt: new Date(),
        updatedAt: new Date()
      });

      // Log failed payment
      await db.collection('payments').add({
        userId,
        invoiceId: invoice.id,
        amount: invoice.amount_due / 100,
        currency: invoice.currency,
        status: 'failed',
        failureReason: invoice.last_payment_error?.message,
        timestamp: new Date()
      });

      logger.info(`Payment failed for user ${userId}`);
      
      // TODO: Send payment failed email notification
    }
  } catch (error) {
    logger.error('Error handling payment failed:', error);
  }
}