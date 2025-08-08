import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encrypt, decrypt, encryptCredentials, decryptCredentials, generateSecureToken } from './crypto-secure.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SecureTokenStore {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.tokensFile = path.join(this.dataDir, 'tokens.encrypted');
    this.accountsFile = path.join(this.dataDir, 'accounts.encrypted');
    this.sessionsFile = path.join(this.dataDir, 'sessions.encrypted');
    
    this.ensureDataDirectory();
    this.initializeFiles();
    
    // In-memory cache with TTL for performance
    this.tokenCache = new Map();
    this.accountCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Cleanup expired cache entries every 10 minutes
    setInterval(() => this.cleanupCache(), 10 * 60 * 1000);
  }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    }
  }

  initializeFiles() {
    const files = [this.tokensFile, this.accountsFile, this.sessionsFile];
    files.forEach(file => {
      if (!fs.existsSync(file)) {
        this.writeEncryptedFile(file, {});
      }
    });
  }

  writeEncryptedFile(filePath, data) {
    try {
      const jsonString = JSON.stringify(data, null, 0); // No formatting to reduce size
      const encryptedData = encrypt(jsonString);
      
      // Atomic write with temporary file
      const tempFile = filePath + '.tmp';
      fs.writeFileSync(tempFile, encryptedData, { mode: 0o600 });
      fs.renameSync(tempFile, filePath);
      
      return true;
    } catch (error) {
      logger.error('Failed to write encrypted file', { filePath, error: error.message });
      return false;
    }
  }

  readEncryptedFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return {};
      }

      const encryptedData = fs.readFileSync(filePath, 'utf8');
      const decryptedString = decrypt(encryptedData);
      return JSON.parse(decryptedString);
    } catch (error) {
      logger.error('Failed to read encrypted file', { filePath, error: error.message });
      return {};
    }
  }

  cleanupCache() {
    const now = Date.now();
    
    for (const [key, entry] of this.tokenCache.entries()) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.tokenCache.delete(key);
      }
    }
    
    for (const [key, entry] of this.accountCache.entries()) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.accountCache.delete(key);
      }
    }
  }

  // Secure token management
  setToken(token, userData, expiresIn = 24 * 60 * 60 * 1000) { // 24 hours default
    try {
      const tokens = this.readEncryptedFile(this.tokensFile);
      const expiresAt = new Date(Date.now() + expiresIn);
      
      tokens[token] = {
        ...userData,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        lastAccessed: new Date().toISOString()
      };
      
      const success = this.writeEncryptedFile(this.tokensFile, tokens);
      
      if (success) {
        // Update cache
        this.tokenCache.set(token, {
          data: tokens[token],
          timestamp: Date.now()
        });
        
        logger.info('Token stored securely', { 
          userId: userData.id, 
          email: userData.email,
          expiresAt: expiresAt.toISOString()
        });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to set token', { error: error.message });
      return false;
    }
  }

  getToken(token) {
    try {
      // Check cache first
      const cached = this.tokenCache.get(token);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        // Check if token is expired
        if (new Date(cached.data.expiresAt) < new Date()) {
          this.deleteToken(token);
          return null;
        }
        
        // Update last accessed time
        this.updateTokenAccess(token);
        return cached.data;
      }

      // Read from encrypted storage
      const tokens = this.readEncryptedFile(this.tokensFile);
      const tokenData = tokens[token];
      
      if (!tokenData) {
        return null;
      }

      // Check if token is expired
      if (new Date(tokenData.expiresAt) < new Date()) {
        this.deleteToken(token);
        return null;
      }

      // Update cache and last accessed time
      this.tokenCache.set(token, {
        data: tokenData,
        timestamp: Date.now()
      });
      
      this.updateTokenAccess(token);
      return tokenData;
    } catch (error) {
      logger.error('Failed to get token', { error: error.message });
      return null;
    }
  }

  updateTokenAccess(token) {
    try {
      const tokens = this.readEncryptedFile(this.tokensFile);
      if (tokens[token]) {
        tokens[token].lastAccessed = new Date().toISOString();
        this.writeEncryptedFile(this.tokensFile, tokens);
        
        // Update cache
        const cached = this.tokenCache.get(token);
        if (cached) {
          cached.data.lastAccessed = tokens[token].lastAccessed;
        }
      }
    } catch (error) {
      logger.warn('Failed to update token access time', { error: error.message });
    }
  }

  hasToken(token) {
    const tokenData = this.getToken(token);
    return tokenData !== null;
  }

  deleteToken(token) {
    try {
      const tokens = this.readEncryptedFile(this.tokensFile);
      delete tokens[token];
      const success = this.writeEncryptedFile(this.tokensFile, tokens);
      
      if (success) {
        this.tokenCache.delete(token);
        logger.info('Token deleted securely');
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to delete token', { error: error.message });
      return false;
    }
  }

  // Clean up expired tokens
  cleanupExpiredTokens() {
    try {
      const tokens = this.readEncryptedFile(this.tokensFile);
      const now = new Date();
      let cleanedCount = 0;

      Object.keys(tokens).forEach(token => {
        if (new Date(tokens[token].expiresAt) < now) {
          delete tokens[token];
          this.tokenCache.delete(token);
          cleanedCount++;
        }
      });

      if (cleanedCount > 0) {
        this.writeEncryptedFile(this.tokensFile, tokens);
        logger.info('Cleaned up expired tokens', { count: cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired tokens', { error: error.message });
      return 0;
    }
  }

  // Secure account management with encrypted credentials
  getUserAccounts(userId) {
    try {
      const cached = this.accountCache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data.map(account => ({
          ...account,
          // Decrypt credentials on demand
          ...(account.encryptedCredentials ? 
            { credentials: decryptCredentials(account.encryptedCredentials) } : {}
          )
        }));
      }

      const accounts = this.readEncryptedFile(this.accountsFile);
      const userAccounts = accounts[userId] || [];
      
      // Update cache
      this.accountCache.set(userId, {
        data: userAccounts,
        timestamp: Date.now()
      });

      // Return accounts with decrypted credentials
      return userAccounts.map(account => ({
        ...account,
        ...(account.encryptedCredentials ? 
          { credentials: decryptCredentials(account.encryptedCredentials) } : {}
        )
      }));
    } catch (error) {
      logger.error('Failed to get user accounts', { userId, error: error.message });
      return [];
    }
  }

  addAccount(userId, accountData) {
    try {
      const accounts = this.readEncryptedFile(this.accountsFile);
      
      if (!accounts[userId]) {
        accounts[userId] = [];
      }

      // Generate unique ID if not provided
      if (!accountData.id) {
        accountData.id = generateSecureToken(16);
      }

      // Encrypt sensitive credentials
      if (accountData.credentials) {
        accountData.encryptedCredentials = encryptCredentials(accountData.credentials);
        delete accountData.credentials; // Remove plaintext credentials
      }

      accountData.createdAt = new Date().toISOString();
      accountData.updatedAt = new Date().toISOString();

      accounts[userId].push(accountData);
      
      const success = this.writeEncryptedFile(this.accountsFile, accounts);
      
      if (success) {
        // Invalidate cache
        this.accountCache.delete(userId);
        
        logger.info('Account added securely', { 
          userId, 
          accountId: accountData.id,
          accountName: accountData.accountName
        });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to add account', { userId, error: error.message });
      return false;
    }
  }

  updateAccount(userId, accountId, updateData) {
    try {
      const accounts = this.readEncryptedFile(this.accountsFile);
      
      if (!accounts[userId]) {
        return false;
      }

      const accountIndex = accounts[userId].findIndex(acc => acc.id === accountId);
      if (accountIndex === -1) {
        return false;
      }

      // Encrypt credentials if provided
      if (updateData.credentials) {
        updateData.encryptedCredentials = encryptCredentials(updateData.credentials);
        delete updateData.credentials; // Remove plaintext credentials
      }

      updateData.updatedAt = new Date().toISOString();
      
      accounts[userId][accountIndex] = {
        ...accounts[userId][accountIndex],
        ...updateData
      };

      const success = this.writeEncryptedFile(this.accountsFile, accounts);
      
      if (success) {
        // Invalidate cache
        this.accountCache.delete(userId);
        
        logger.info('Account updated securely', { 
          userId, 
          accountId,
          accountName: accounts[userId][accountIndex].accountName
        });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to update account', { userId, accountId, error: error.message });
      return false;
    }
  }

  deleteAccount(userId, accountId) {
    try {
      const accounts = this.readEncryptedFile(this.accountsFile);
      
      if (!accounts[userId]) {
        return false;
      }

      const initialLength = accounts[userId].length;
      accounts[userId] = accounts[userId].filter(acc => acc.id !== accountId);
      
      if (accounts[userId].length === initialLength) {
        return false; // Account not found
      }

      const success = this.writeEncryptedFile(this.accountsFile, accounts);
      
      if (success) {
        // Invalidate cache
        this.accountCache.delete(userId);
        
        logger.info('Account deleted securely', { userId, accountId });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to delete account', { userId, accountId, error: error.message });
      return false;
    }
  }

  // Session management for additional security
  createSession(userId, sessionData = {}) {
    try {
      const sessions = this.readEncryptedFile(this.sessionsFile);
      const sessionId = generateSecureToken(32);
      
      if (!sessions[userId]) {
        sessions[userId] = {};
      }

      sessions[userId][sessionId] = {
        ...sessionData,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      };

      const success = this.writeEncryptedFile(this.sessionsFile, sessions);
      
      if (success) {
        logger.info('Session created securely', { userId, sessionId });
        return sessionId;
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to create session', { userId, error: error.message });
      return null;
    }
  }

  validateSession(userId, sessionId) {
    try {
      const sessions = this.readEncryptedFile(this.sessionsFile);
      const userSessions = sessions[userId];
      
      if (!userSessions || !userSessions[sessionId]) {
        return false;
      }

      const session = userSessions[sessionId];
      
      // Check if session is expired
      if (new Date(session.expiresAt) < new Date()) {
        this.deleteSession(userId, sessionId);
        return false;
      }

      // Update last accessed time
      session.lastAccessed = new Date().toISOString();
      this.writeEncryptedFile(this.sessionsFile, sessions);
      
      return true;
    } catch (error) {
      logger.error('Failed to validate session', { userId, sessionId, error: error.message });
      return false;
    }
  }

  deleteSession(userId, sessionId) {
    try {
      const sessions = this.readEncryptedFile(this.sessionsFile);
      
      if (sessions[userId] && sessions[userId][sessionId]) {
        delete sessions[userId][sessionId];
        
        if (Object.keys(sessions[userId]).length === 0) {
          delete sessions[userId];
        }
        
        return this.writeEncryptedFile(this.sessionsFile, sessions);
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to delete session', { userId, sessionId, error: error.message });
      return false;
    }
  }

  // Security maintenance
  getSecurityStats() {
    try {
      const tokens = this.readEncryptedFile(this.tokensFile);
      const accounts = this.readEncryptedFile(this.accountsFile);
      const sessions = this.readEncryptedFile(this.sessionsFile);
      
      return {
        activeTokens: Object.keys(tokens).length,
        totalUsers: Object.keys(accounts).length,
        totalAccounts: Object.values(accounts).reduce((sum, userAccounts) => sum + userAccounts.length, 0),
        activeSessions: Object.values(sessions).reduce((sum, userSessions) => sum + Object.keys(userSessions).length, 0),
        cacheStats: {
          tokenCacheSize: this.tokenCache.size,
          accountCacheSize: this.accountCache.size
        }
      };
    } catch (error) {
      logger.error('Failed to get security stats', { error: error.message });
      return null;
    }
  }
}

// Export singleton instance
export default new SecureTokenStore();