import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple file-based token storage for PM2 cluster mode
class TokenStore {
    constructor() {
        this.tokenFile = path.join(__dirname, 'tokens.json');
        this.accountsFile = path.join(__dirname, 'accounts.json');
        this.ensureFiles();
    }

    ensureFiles() {
        // Ensure token file exists
        if (!fs.existsSync(this.tokenFile)) {
            fs.writeFileSync(this.tokenFile, JSON.stringify({}));
        }
        // Ensure accounts file exists
        if (!fs.existsSync(this.accountsFile)) {
            fs.writeFileSync(this.accountsFile, JSON.stringify({}));
        }
    }

    // Token methods
    getTokens() {
        try {
            const data = fs.readFileSync(this.tokenFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading tokens:', error);
            return {};
        }
    }

    setToken(token, user) {
        try {
            const tokens = this.getTokens();
            tokens[token] = {
                ...user,
                createdAt: new Date().toISOString()
            };
            fs.writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving token:', error);
            return false;
        }
    }

    getToken(token) {
        const tokens = this.getTokens();
        return tokens[token] || null;
    }

    deleteToken(token) {
        try {
            const tokens = this.getTokens();
            delete tokens[token];
            fs.writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
            return true;
        } catch (error) {
            console.error('Error deleting token:', error);
            return false;
        }
    }

    hasToken(token) {
        const tokens = this.getTokens();
        return token in tokens;
    }

    // Clean up old tokens (older than 7 days)
    cleanupTokens() {
        try {
            const tokens = this.getTokens();
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            Object.keys(tokens).forEach(token => {
                const createdAt = new Date(tokens[token].createdAt);
                if (createdAt < sevenDaysAgo) {
                    delete tokens[token];
                }
            });
            
            fs.writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
        } catch (error) {
            console.error('Error cleaning up tokens:', error);
        }
    }

    // Account methods
    getAccounts() {
        try {
            const data = fs.readFileSync(this.accountsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading accounts:', error);
            return {};
        }
    }

    getUserAccounts(userId) {
        const accounts = this.getAccounts();
        return accounts[userId] || [];
    }

    setUserAccounts(userId, accountsList) {
        try {
            const accounts = this.getAccounts();
            accounts[userId] = accountsList;
            fs.writeFileSync(this.accountsFile, JSON.stringify(accounts, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving accounts:', error);
            return false;
        }
    }

    addAccount(userId, account) {
        try {
            const accounts = this.getUserAccounts(userId);
            accounts.push(account);
            return this.setUserAccounts(userId, accounts);
        } catch (error) {
            console.error('Error adding account:', error);
            return false;
        }
    }

    updateAccount(userId, accountId, updateData) {
        try {
            const accounts = this.getUserAccounts(userId);
            const index = accounts.findIndex(acc => acc.id === accountId);
            if (index !== -1) {
                accounts[index] = { ...accounts[index], ...updateData };
                return this.setUserAccounts(userId, accounts);
            }
            return false;
        } catch (error) {
            console.error('Error updating account:', error);
            return false;
        }
    }

    deleteAccount(userId, accountId) {
        try {
            const accounts = this.getUserAccounts(userId);
            const filtered = accounts.filter(acc => acc.id !== accountId);
            return this.setUserAccounts(userId, filtered);
        } catch (error) {
            console.error('Error deleting account:', error);
            return false;
        }
    }
}

// Create singleton instance
const tokenStore = new TokenStore();

// Run cleanup every hour
setInterval(() => {
    tokenStore.cleanupTokens();
}, 60 * 60 * 1000);

export default tokenStore;