import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate a proper UUID v4
function generateUUID() {
    return crypto.randomUUID();
}

// Migrate accounts and tokens to use proper GUIDs
const accountsFile = path.join(__dirname, 'accounts.json');
const tokensFile = path.join(__dirname, 'tokens.json');

// Meredith's new GUID
const MEREDITH_GUID = generateUUID();
console.log('New GUID for meredith@monkeyattack.com:', MEREDITH_GUID);

try {
    // Migrate accounts
    const accountsData = fs.readFileSync(accountsFile, 'utf8');
    const accounts = JSON.parse(accountsData);
    
    const newAccounts = {};
    
    // Move accounts from '123' to the new GUID
    if (accounts['123']) {
        newAccounts[MEREDITH_GUID] = accounts['123'].map(account => ({
            ...account,
            userId: MEREDITH_GUID
        }));
        console.log(`Migrated ${accounts['123'].length} accounts to GUID ${MEREDITH_GUID}`);
    }
    
    // Keep any other user accounts
    Object.keys(accounts).forEach(userId => {
        if (userId !== '123' && !newAccounts[userId]) {
            newAccounts[userId] = accounts[userId];
        }
    });
    
    // Write back accounts
    fs.writeFileSync(accountsFile, JSON.stringify(newAccounts, null, 2));
    console.log('Accounts migration complete!');
    
    // Migrate tokens
    const tokensData = fs.readFileSync(tokensFile, 'utf8');
    const tokens = JSON.parse(tokensData);
    
    // Update all tokens for meredith@monkeyattack.com to use the new GUID
    Object.keys(tokens).forEach(token => {
        if (tokens[token].email === 'meredith@monkeyattack.com') {
            tokens[token].id = MEREDITH_GUID;
        }
    });
    
    // Write back tokens
    fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2));
    console.log('Tokens migration complete!');
    
    // Create a mapping file for reference
    const mappingFile = path.join(__dirname, 'user-id-mapping.json');
    const mapping = {
        'meredith@monkeyattack.com': {
            oldId: '123',
            newId: MEREDITH_GUID,
            migratedAt: new Date().toISOString()
        }
    };
    fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));
    console.log('Created user ID mapping file');
    
} catch (error) {
    console.error('Migration failed:', error);
}