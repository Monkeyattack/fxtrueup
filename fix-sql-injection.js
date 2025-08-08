const fs = require('fs');

// Read the file
let content = fs.readFileSync('billing-service.cjs', 'utf8');

// Find and replace the vulnerable function
const oldFunction = `    async updateSubscriptionStatus(stripeSubscriptionId, status, additionalFields = {}) {
        return new Promise((resolve, reject) => {
            let setClause = 'status = ?, updated_at = CURRENT_TIMESTAMP';
            let params = [status];

            Object.entries(additionalFields).forEach(([key, value]) => {
                setClause += `, ${key} = ?`;
                params.push(value);
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
    }`;

const newFunction = `    async updateSubscriptionStatus(stripeSubscriptionId, status, additionalFields = {}) {
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
    }`;

// Replace the function
content = content.replace(oldFunction, newFunction);

// Write back
fs.writeFileSync('billing-service.cjs', content);
console.log('Fixed SQL injection vulnerability in updateSubscriptionStatus');
