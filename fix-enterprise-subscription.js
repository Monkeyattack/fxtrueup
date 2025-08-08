const fs = require('fs');

// Load tokens
let tokens = {};
try {
    tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
} catch (error) {
    console.log('Creating new tokens file');
}

// Find all tokens for meredith@monkeyattack.com and update them
let updated = 0;
Object.keys(tokens).forEach(tokenKey => {
    if (tokens[tokenKey].email === 'meredith@monkeyattack.com') {
        tokens[tokenKey].subscription = 'enterprise';
        tokens[tokenKey].subscriptionTier = 'Enterprise';
        tokens[tokenKey].isAdmin = true;
        updated++;
    }
});

// Also ensure the user exists in accounts.json with proper subscription
let accounts = {};
try {
    accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
} catch (error) {
    console.log('Creating new accounts file');
}

// Update subscription for the user
Object.keys(accounts).forEach(accountKey => {
    if (accounts[accountKey].userId === '57b5347a-acac-4cc4-a8fe-b7ea95bbe4cb') {
        accounts[accountKey].subscription = 'enterprise';
        accounts[accountKey].subscriptionTier = 'Enterprise';
    }
});

// Save updated files
fs.writeFileSync('tokens.json', JSON.stringify(tokens, null, 2));
fs.writeFileSync('accounts.json', JSON.stringify(accounts, null, 2));

console.log(`✅ Updated ${updated} tokens to Enterprise subscription`);
console.log('✅ Set subscription tier to "Enterprise" (not "Contact Us")');
console.log('✅ Enterprise subscription properly configured for meredith@monkeyattack.com');
