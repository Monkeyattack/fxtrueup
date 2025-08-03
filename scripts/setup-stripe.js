import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createProducts() {
  console.log('Creating Stripe products and prices...\n');

  try {
    // Create main product
    const product = await stripe.products.create({
      name: 'FX True Up',
      description: 'Smart MT4/MT5 Portfolio Tracker for Forex Traders',
    });
    console.log('✅ Created product:', product.id);

    // Define pricing structure
    const plans = [
      { 
        name: 'BYO - Bring Your Own MyFxBook',
        nickname: 'byo',
        monthly: 500, // $5.00
        annual: 4800  // $48.00
      },
      { 
        name: 'Starter - 1 Account',
        nickname: 'starter',
        monthly: 1500,  // $15.00
        annual: 14400   // $144.00
      },
      { 
        name: 'Trader - 3 Accounts',
        nickname: 'trader',
        monthly: 3500,  // $35.00
        annual: 33600   // $336.00
      },
      { 
        name: 'Pro - 10 Accounts',
        nickname: 'pro',
        monthly: 7500,  // $75.00
        annual: 72000   // $720.00
      },
      { 
        name: 'Portfolio - 25 Accounts',
        nickname: 'portfolio',
        monthly: 14900,  // $149.00
        annual: 143040   // $1,430.40
      }
    ];

    const createdPrices = {};

    // Create prices for each plan
    for (const plan of plans) {
      // Monthly price
      const monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.monthly,
        currency: 'usd',
        recurring: { interval: 'month' },
        nickname: `${plan.nickname}_monthly`,
        metadata: {
          plan: plan.nickname,
          interval: 'monthly'
        }
      });
      createdPrices[`${plan.nickname}_monthly`] = monthlyPrice.id;
      console.log(`✅ Created monthly price for ${plan.name}: ${monthlyPrice.id}`);

      // Annual price
      const annualPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.annual,
        currency: 'usd',
        recurring: { interval: 'year' },
        nickname: `${plan.nickname}_annual`,
        metadata: {
          plan: plan.nickname,
          interval: 'annual'
        }
      });
      createdPrices[`${plan.nickname}_annual`] = annualPrice.id;
      console.log(`✅ Created annual price for ${plan.name}: ${annualPrice.id}`);
    }

    // Create webhook endpoint
    const webhookEndpoint = await stripe.webhookEndpoints.create({
      url: `${process.env.API_URL}/api/webhooks/stripe`,
      enabled_events: [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.payment_succeeded',
        'invoice.payment_failed'
      ]
    });
    console.log('\n✅ Created webhook endpoint:', webhookEndpoint.url);
    console.log('🔑 Webhook secret:', webhookEndpoint.secret);

    // Output environment variables to add
    console.log('\n📝 Add these to your .env file:\n');
    console.log('# Stripe Product');
    console.log(`STRIPE_PRODUCT_ID=${product.id}`);
    console.log('\n# Stripe Prices');
    for (const [key, value] of Object.entries(createdPrices)) {
      console.log(`STRIPE_PRICE_${key.toUpperCase()}=${value}`);
    }
    console.log('\n# Stripe Webhook');
    console.log(`STRIPE_WEBHOOK_SECRET=${webhookEndpoint.secret}`);

    // Configure customer portal
    const portalConfig = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: 'FX True Up - Manage Your Subscription'
      },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true },
        subscription_pause: { enabled: false },
        subscription_update: {
          enabled: true,
          proration_behavior: 'always_invoice',
          default_allowed_updates: ['price', 'quantity', 'promotion_code'],
          products: [{
            product: product.id,
            prices: Object.values(createdPrices)
          }]
        }
      }
    });
    console.log('\n✅ Configured customer portal');

    console.log('\n🎉 Stripe setup complete!');
    console.log('\nNext steps:');
    console.log('1. Copy the environment variables above to your .env file');
    console.log('2. Deploy your webhook endpoint');
    console.log('3. Test with Stripe CLI: stripe listen --forward-to localhost:8080/api/webhooks/stripe');

  } catch (error) {
    console.error('❌ Error setting up Stripe:', error);
    process.exit(1);
  }
}

// Run setup
createProducts();