// Client-side Billing Integration for FXTrueUp
// Handles subscription management and payment processing

class BillingClient {
    constructor() {
        this.stripe = null;
        this.elements = null;
        this.card = null;
        this.csrfToken = null;
        
        // Initialize Stripe when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        try {
            // Generate CSRF token for this session
            this.generateCSRFToken();
            
            // Load Stripe.js
            if (!window.Stripe) {
                const script = document.createElement('script');
                script.src = 'https://js.stripe.com/v3/';
                script.onload = () => this.initializeStripe();
                document.head.appendChild(script);
            } else {
                this.initializeStripe();
            }
        } catch (error) {
            console.error('Failed to initialize billing client:', error);
        }
    }

    initializeStripe() {
        // Note: Replace with your actual Stripe publishable key
        this.stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY || 'pk_test_your_key_here');
        this.elements = this.stripe.elements();
        console.log('Stripe billing client initialized');
    }

    // Get subscription plans
    async getPlans() {
        try {
            const response = await fetch('/api/billing/plans');
            const data = await response.json();
            
            if (data.success) {
                return data.plans;
            } else {
                throw new Error(data.error || 'Failed to get plans');
            }
        } catch (error) {
            console.error('Error getting plans:', error);
            throw error;
        }
    }

    // Get current subscription
    async getCurrentSubscription() {
        try {
            const token = this.getAuthToken();
            const response = await fetch('/api/billing/subscription', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': this.getCSRFToken(),
                    'X-Session-Token': this.getSessionToken()
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                return data;
            } else {
                throw new Error(data.error || 'Failed to get subscription');
            }
        } catch (error) {
            console.error('Error getting subscription:', error);
            throw error;
        }
    }

    // Create subscription
    async createSubscription(priceId, paymentMethodId = null, trialDays = null) {
        try {
            const token = this.getAuthToken();
            const csrfToken = this.getCSRFToken();
            const sessionToken = this.getSessionToken();
            
            const response = await fetch('/api/billing/subscription', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': csrfToken,
                    'X-Session-Token': sessionToken
                },
                body: JSON.stringify({
                    priceId,
                    paymentMethodId,
                    trialDays
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                return data;
            } else {
                throw new Error(data.error || 'Failed to create subscription');
            }
        } catch (error) {
            console.error('Error creating subscription:', error);
            throw error;
        }
    }

    // Update subscription
    async updateSubscription(priceId) {
        try {
            const token = this.getAuthToken();
            const response = await fetch('/api/billing/subscription', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': this.getCSRFToken(),
                    'X-Session-Token': this.getSessionToken()
                },
                body: JSON.stringify({ priceId })
            });
            
            const data = await response.json();
            
            if (data.success) {
                return data.subscription;
            } else {
                throw new Error(data.error || 'Failed to update subscription');
            }
        } catch (error) {
            console.error('Error updating subscription:', error);
            throw error;
        }
    }

    // Cancel subscription
    async cancelSubscription(cancelImmediately = false) {
        try {
            const token = this.getAuthToken();
            const response = await fetch('/api/billing/subscription', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': this.getCSRFToken(),
                    'X-Session-Token': this.getSessionToken()
                },
                body: JSON.stringify({ cancelImmediately })
            });
            
            const data = await response.json();
            
            if (data.success) {
                return data;
            } else {
                throw new Error(data.error || 'Failed to cancel subscription');
            }
        } catch (error) {
            console.error('Error canceling subscription:', error);
            throw error;
        }
    }

    // Create billing portal session
    async createBillingPortalSession(returnUrl = window.location.href) {
        try {
            const token = this.getAuthToken();
            const response = await fetch('/api/billing/portal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': this.getCSRFToken(),
                    'X-Session-Token': this.getSessionToken()
                },
                body: JSON.stringify({ returnUrl })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Redirect to billing portal
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Failed to create billing portal session');
            }
        } catch (error) {
            console.error('Error creating billing portal session:', error);
            throw error;
        }
    }

    // Setup card element
    setupCardElement(containerId) {
        if (!this.stripe || !this.elements) {
            console.error('Stripe not initialized');
            return null;
        }

        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Card container not found:', containerId);
            return null;
        }

        this.card = this.elements.create('card', {
            style: {
                base: {
                    fontSize: '16px',
                    color: '#424770',
                    '::placeholder': {
                        color: '#aab7c4',
                    },
                },
                invalid: {
                    color: '#9e2146',
                },
            },
        });

        this.card.mount(`#${containerId}`);
        return this.card;
    }

    // Create payment method
    async createPaymentMethod() {
        if (!this.stripe || !this.card) {
            throw new Error('Stripe or card element not initialized');
        }

        const { error, paymentMethod } = await this.stripe.createPaymentMethod({
            type: 'card',
            card: this.card,
        });

        if (error) {
            throw error;
        }

        return paymentMethod;
    }

    // Handle subscription with payment
    async subscribeWithPayment(priceId, trialDays = null) {
        try {
            // Create payment method
            const paymentMethod = await this.createPaymentMethod();
            
            // Create subscription
            const result = await this.createSubscription(priceId, paymentMethod.id, trialDays);
            
            if (result.clientSecret) {
                // Confirm payment if needed
                const { error } = await this.stripe.confirmCardPayment(result.clientSecret);
                
                if (error) {
                    throw error;
                } else {
                    return result.subscription;
                }
            }
            
            return result.subscription;
        } catch (error) {
            console.error('Error subscribing with payment:', error);
            throw error;
        }
    }

    // Get user invoices
    async getInvoices() {
        try {
            const token = this.getAuthToken();
            const response = await fetch('/api/billing/invoices', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': this.getCSRFToken(),
                    'X-Session-Token': this.getSessionToken()
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                return data.invoices;
            } else {
                throw new Error(data.error || 'Failed to get invoices');
            }
        } catch (error) {
            console.error('Error getting invoices:', error);
            throw error;
        }
    }

    // Format price for display
    formatPrice(amount, currency = 'usd') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount / 100);
    }

    // Format plan features for display
    formatFeatures(features) {
        if (typeof features === 'string') {
            try {
                features = JSON.parse(features);
            } catch {
                return [];
            }
        }
        
        const featureList = [];
        
        if (features.accounts) {
            featureList.push(`${features.accounts} trading account${features.accounts > 1 ? 's' : ''}`);
        }
        
        if (features.support) {
            featureList.push(`${features.support} support`);
        }
        
        if (features.analytics) {
            featureList.push('Cross broker analytics');
        }
        
        if (features.api_access) {
            featureList.push('API access');
        }
        
        return featureList;
    }

    // Get auth token from storage
    getAuthToken() {
        return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    }

    // Generate CSRF token
    generateCSRFToken() {
        // Generate a random token
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        this.csrfToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        
        // Store in session storage
        sessionStorage.setItem('csrfToken', this.csrfToken);
        return this.csrfToken;
    }

    // Get CSRF token
    getCSRFToken() {
        if (!this.csrfToken) {
            this.csrfToken = sessionStorage.getItem('csrfToken') || this.generateCSRFToken();
        }
        return this.csrfToken;
    }

    // Get session token (for CSRF validation)
    getSessionToken() {
        return sessionStorage.getItem('sessionToken') || 'no-session';
    }

    // Display subscription status
    async displaySubscriptionStatus(containerId) {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            const subscription = await this.getCurrentSubscription();
            
            let html = '';
            
            if (subscription.hasActive) {
                html = `
                    <div class="subscription-status active">
                        <h3>Active Subscription</h3>
                        <p>Plan: ${subscription.subscription.plan_name}</p>
                        <p>Status: ${subscription.subscription.status}</p>
                        <p>Next billing: ${new Date(subscription.subscription.current_period_end).toLocaleDateString()}</p>
                        <button onclick="billingClient.createBillingPortalSession()" class="btn-portal">
                            Manage Subscription
                        </button>
                    </div>
                `;
            } else if (subscription.inGracePeriod) {
                html = `
                    <div class="subscription-status grace-period">
                        <h3>Payment Issue</h3>
                        <p>Your subscription requires attention</p>
                        <button onclick="billingClient.createBillingPortalSession()" class="btn-portal">
                            Update Payment Method
                        </button>
                    </div>
                `;
            } else {
                html = `
                    <div class="subscription-status inactive">
                        <h3>No Active Subscription</h3>
                        <p>Subscribe to access all features</p>
                        <button onclick="billingClient.showPricingModal()" class="btn-subscribe">
                            View Plans
                        </button>
                    </div>
                `;
            }
            
            container.innerHTML = html;
        } catch (error) {
            console.error('Error displaying subscription status:', error);
        }
    }

    // Show pricing modal (implement based on your UI framework)
    showPricingModal() {
        // This would open your pricing modal
        // Implementation depends on your UI framework
        console.log('Show pricing modal');
    }

    // Handle errors gracefully
    handleError(error, context = '') {
        console.error(`Billing error ${context}:`, error);
        
        // Show user-friendly error message
        const message = error.message || 'An error occurred with billing. Please try again.';
        
        // You can implement your own error notification system here
        if (typeof showNotification === 'function') {
            showNotification(message, 'error');
        } else {
            alert(message);
        }
    }
}

// Initialize billing client
const billingClient = new BillingClient();

// Export for use in other scripts
window.BillingClient = BillingClient;
window.billingClient = billingClient;