import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migrate accounts to proper user ID structure
const accountsFile = path.join(__dirname, 'src', 'accounts.json');

try {
    // Read current accounts
    const accountsData = fs.readFileSync(accountsFile, 'utf8');
    const accounts = JSON.parse(accountsData);
    
    console.log('Current accounts structure:', Object.keys(accounts));
    
    // Create new structure with email-based keys
    const newAccounts = {};
    
    // Copy existing accounts
    Object.keys(accounts).forEach(userId => {
        newAccounts[userId] = accounts[userId];
    });
    
    // Also add accounts under the email key for meredith@monkeyattack.com
    if (accounts['123']) {
        newAccounts['meredith@monkeyattack.com'] = accounts['123'];
        console.log(`Copied ${accounts['123'].length} accounts to meredith@monkeyattack.com`);
    }
    
    // Write back
    fs.writeFileSync(accountsFile, JSON.stringify(newAccounts, null, 2));
    console.log('Migration complete!');
    
} catch (error) {
    console.error('Migration failed:', error);
}