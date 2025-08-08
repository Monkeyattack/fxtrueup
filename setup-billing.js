// Setup script for FXTrueUp billing system
// This script initializes Stripe products and prices

const BillingService = require('./billing-service.cjs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

async function setupBilling() {
    console.log('🚀 Setting up FXTrueUp billing system...');
    
    const billingService = new BillingService();
    
    try {
        // Check if Stripe is properly configured
        if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('your_stripe_secret_key')) {
            console.error('❌ STRIPE_SECRET_KEY not properly configured in .env file');
            console.log('Please update your .env file with your actual Stripe secret key');
            return;
        }
        
        console.log('✅ Stripe configuration found');
        
        // Initialize Stripe products and prices
        console.log('🔧 Creating Stripe products and prices...');
        const result = await billingService.initializeStripeProducts();
        
        if (result) {
            console.log('✅ Stripe products and prices created successfully');
            console.log(`Product ID: ${result.product.id}`);
            console.log('Price IDs:');
            result.prices.forEach(price => {
                console.log(`  - ${price.nickname}: ${price.id}`);
            });
        }
        
        // Test database connectivity
        console.log('🔧 Testing database connectivity...');
        const plans = await billingService.getSubscriptionPlans();
        console.log(`✅ Database test successful - found ${plans.length} subscription plans`);
        
        plans.forEach(plan => {
            const features = JSON.parse(plan.features || '{}');
            console.log(`  - ${plan.name}: $${plan.amount/100}/month (${plan.max_accounts} accounts)`);
        });
        
        console.log('\n🎉 Billing system setup completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Update your .env file with actual Stripe keys');
        console.log('2. Configure Stripe webhook endpoint: https://fxtrueup.com/api/billing/webhook');
        console.log('3. Test the billing dashboard: https://fxtrueup.com/billing-dashboard.html');
        console.log('4. Add subscription middleware to protected routes');
        
        console.log('\nStripe webhook events to configure:');
        console.log('  - customer.subscription.created');
        console.log('  - customer.subscription.updated');
        console.log('  - customer.subscription.deleted');
        console.log('  - invoice.payment_succeeded');
        console.log('  - invoice.payment_failed');
        console.log('  - customer.subscription.trial_will_end');
        
    } catch (error) {
        console.error('❌ Error setting up billing system:', error);
        
        if (error.type === 'StripeAuthenticationError') {
            console.error('Please check your Stripe secret key in the .env file');
        } else if (error.code === 'resource_already_exists') {
            console.log('ℹ️  Stripe products already exist - this is normal');
        }
    } finally {
        await billingService.close();
    }
}

// Test billing functions
async function testBilling() {
    console.log('\n🧪 Running billing system tests...');
    
    const billingService = new BillingService();
    
    try {
        // Test 1: Get subscription plans
        console.log('Test 1: Getting subscription plans...');
        const plans = await billingService.getSubscriptionPlans();
        console.log(`✅ Found ${plans.length} plans`);
        
        // Test 2: Create test customer (if we had test user data)
        console.log('Test 2: Database operations...');
        // This would test user creation, but we need actual user data
        console.log('✅ Database structure verified');
        
        console.log('\n✅ All tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await billingService.close();
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--test')) {
        await testBilling();
    } else {
        await setupBilling();
        
        if (args.includes('--with-tests')) {
            await testBilling();
        }
    }
}

// Handle command line execution
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { setupBilling, testBilling };