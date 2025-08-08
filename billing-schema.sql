-- Billing and Subscription Schema for FXTrueUp
-- Created: Thu, Aug  7, 2025  3:38:25 PM

-- Users table (if not exists)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    stripe_customer_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Subscription plans
CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    stripe_price_id TEXT UNIQUE NOT NULL,
    amount INTEGER NOT NULL, -- in cents
    currency TEXT DEFAULT 'usd',
    interval_type TEXT CHECK (interval_type IN ('month', 'year')) DEFAULT 'month',
    features TEXT, -- JSON string of features
    max_accounts INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid')) NOT NULL,
    current_period_start DATETIME NOT NULL,
    current_period_end DATETIME NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at DATETIME,
    trial_start DATETIME,
    trial_end DATETIME,
    grace_period_end DATETIME,
    metadata TEXT, -- JSON string for additional data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans (id)
);

-- Payment methods
CREATE TABLE IF NOT EXISTS payment_methods (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    stripe_payment_method_id TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    type TEXT NOT NULL, -- card, bank_account, etc.
    card_brand TEXT,
    card_last4 TEXT,
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    is_default BOOLEAN DEFAULT false,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subscription_id TEXT,
    stripe_invoice_id TEXT UNIQUE NOT NULL,
    amount_paid INTEGER NOT NULL,
    amount_due INTEGER NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')) NOT NULL,
    invoice_pdf TEXT, -- URL to invoice PDF
    hosted_invoice_url TEXT,
    period_start DATETIME,
    period_end DATETIME,
    due_date DATETIME,
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES user_subscriptions (id)
);

-- Payment attempts and failures
CREATE TABLE IF NOT EXISTS payment_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subscription_id TEXT,
    invoice_id TEXT,
    stripe_payment_intent_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT CHECK (status IN ('succeeded', 'failed', 'pending', 'canceled')) NOT NULL,
    failure_code TEXT,
    failure_message TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES user_subscriptions (id),
    FOREIGN KEY (invoice_id) REFERENCES invoices (id)
);

-- Webhooks log
CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    stripe_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at DATETIME,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    data TEXT NOT NULL, -- JSON string of webhook data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Usage tracking (for future usage-based billing)
CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subscription_id TEXT,
    metric_type TEXT NOT NULL, -- accounts_connected, api_calls, etc.
    quantity INTEGER NOT NULL DEFAULT 1,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES user_subscriptions (id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON user_subscriptions (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods (user_id, is_default);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices (user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices (subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_user ON payment_attempts (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON payment_attempts (status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events (processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events (event_type);
CREATE INDEX IF NOT EXISTS idx_usage_records_user ON usage_records (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_period ON usage_records (period_start, period_end);

-- Insert default subscription plans
INSERT OR REPLACE INTO subscription_plans (id, name, stripe_price_id, amount, currency, interval_type, features, max_accounts) VALUES
('basic_monthly', 'Basic', 'price_basic_monthly', 999, 'usd', 'month', '{accounts: 1, support: email}', 1),
('professional_monthly', 'Professional', 'price_professional_monthly', 2999, 'usd', 'month', '{accounts: 3, support: priority, analytics: true}', 3),
('enterprise_monthly', 'Enterprise', 'price_enterprise_monthly', 14999, 'usd', 'month', '{accounts: 10, support: phone, analytics: true, api_access: true}', 10);
