const fs = require('fs');
const path = require('path');

// Simple file-based token storage for PM2 cluster mode
class TokenStore {
    constructor() {
        this.tokenFile = path.join(__dirname, 'tokens.json');
        this.accountsFile = path.join(__dirname, 'accounts.json');
        this.ensureFiles();
    }

    ensureFiles() {
        if (!fs.existsSync(this.tokenFile)) {
            fs.writeFileSync(this.tokenFile, '{}');
        }
        if (!fs.existsSync(this.accountsFile)) {
            fs.writeFileSync(this.accountsFile, '{}');
        }
    }

    // Token management
    setToken(token, userData) {
        try {
            const tokens = this.readTokens();
            tokens[token] = {
                ...userData,
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
        const tokens = this.readTokens();
        return tokens[token] || null;
    }

    hasToken(token) {
        const tokens = this.readTokens();
        return !!tokens[token];
    }

    deleteToken(token) {
        try {
            const tokens = this.readTokens();
            delete tokens[token];
            fs.writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
            return true;
        } catch (error) {
            console.error('Error deleting token:', error);
            return false;
        }
    }

    readTokens() {
        try {
            const data = fs.readFileSync(this.tokenFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }

    // Account management
    getUserAccounts(userId) {
        try {
            const accounts = this.readAccounts();
            return accounts[userId] || [];
        } catch (error) {
            console.error('Error reading accounts:', error);
            return [];
        }
    }

    addAccount(userId, accountData) {
        try {
            const accounts = this.readAccounts();
            if (!accounts[userId]) {
                accounts[userId] = [];
            }
            accounts[userId].push(accountData);
            fs.writeFileSync(this.accountsFile, JSON.stringify(accounts, null, 2));
            return true;
        } catch (error) {
            console.error('Error adding account:', error);
            return false;
        }
    }

    updateAccount(userId, accountId, updateData) {
        try {
            const accounts = this.readAccounts();
            if (!accounts[userId]) return false;
            
            const index = accounts[userId].findIndex(acc => acc.id === accountId);
            if (index === -1) return false;
            
            accounts[userId][index] = {
                ...accounts[userId][index],
                ...updateData
            };
            
            fs.writeFileSync(this.accountsFile, JSON.stringify(accounts, null, 2));
            return true;
        } catch (error) {
            console.error('Error updating account:', error);
            return false;
        }
    }

    deleteAccount(userId, accountId) {
        try {
            const accounts = this.readAccounts();
            if (!accounts[userId]) return false;
            
            accounts[userId] = accounts[userId].filter(acc => acc.id !== accountId);
            
            fs.writeFileSync(this.accountsFile, JSON.stringify(accounts, null, 2));
            return true;
        } catch (error) {
            console.error('Error deleting account:', error);
            return false;
        }
    }

    readAccounts() {
        try {
            const data = fs.readFileSync(this.accountsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }
}

module.exports = new TokenStore();