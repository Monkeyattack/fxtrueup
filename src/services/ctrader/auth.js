/**
 * cTrader OAuth2 Authentication Service
 * Handles authentication flow and token management
 */

import axios from 'axios';
import { logger } from '../../utils/logger.js';
import vaultManager from '../vaultConfig.js';

class CTraderAuth {
  constructor() {
    this.authBaseUrl = 'https://id.ctrader.com';
    this.apiBaseUrl = 'https://openapi.ctrader.com';
    this.tokenCache = new Map(); // In-memory token cache
    this.refreshTimers = new Map(); // Token refresh timers
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(clientId, redirectUri, scope = 'trading', state = '') {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope,
      state: state,
      response_type: 'code'
    });

    return `${this.authBaseUrl}/my/settings/openapi/grantingaccess/?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret
      });

      const response = await axios.get(`${this.apiBaseUrl}/apps/token?${params.toString()}`);

      if (response.data.access_token) {
        const tokenData = {
          accessToken: response.data.access_token,
          refreshToken: response.data.refresh_token,
          expiresIn: response.data.expires_in || 3600,
          tokenType: response.data.token_type || 'Bearer',
          obtainedAt: Date.now()
        };

        logger.info('Successfully exchanged authorization code for access token');
        return tokenData;
      } else {
        throw new Error('No access token in response');
      }
    } catch (error) {
      logger.error(`Failed to exchange code for token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken, clientId, clientSecret) {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      });

      const response = await axios.get(`${this.apiBaseUrl}/apps/token?${params.toString()}`);

      if (response.data.access_token) {
        const tokenData = {
          accessToken: response.data.access_token,
          refreshToken: response.data.refresh_token || refreshToken,
          expiresIn: response.data.expires_in || 3600,
          tokenType: response.data.token_type || 'Bearer',
          obtainedAt: Date.now()
        };

        logger.info('Successfully refreshed access token');
        return tokenData;
      } else {
        throw new Error('No access token in refresh response');
      }
    } catch (error) {
      logger.error(`Failed to refresh token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all accounts for an authenticated user
   */
  async getAllAccounts(accessToken) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/auth/jwt/all-accounts`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data.accounts || [];
    } catch (error) {
      logger.error(`Failed to get accounts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or refresh access token for an account
   */
  async getAccessToken(accountId) {
    // Check cache first
    const cached = this.tokenCache.get(accountId);
    if (cached && this.isTokenValid(cached)) {
      return cached.accessToken;
    }

    // Get from Vault
    const credentials = await this.getCredentialsFromVault(accountId);
    if (!credentials) {
      throw new Error(`No credentials found for account ${accountId}`);
    }

    // Check if current token is still valid
    if (credentials.accessToken && this.isTokenValid(credentials)) {
      this.tokenCache.set(accountId, credentials);
      this.scheduleTokenRefresh(accountId, credentials);
      return credentials.accessToken;
    }

    // Refresh the token
    const refreshed = await this.refreshTokenForAccount(accountId, credentials);
    return refreshed.accessToken;
  }

  /**
   * Check if token is still valid
   */
  isTokenValid(tokenData) {
    if (!tokenData.accessToken || !tokenData.obtainedAt) {
      return false;
    }

    const expiresIn = tokenData.expiresIn || 3600;
    const expiresAt = tokenData.obtainedAt + (expiresIn * 1000);
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    return Date.now() < (expiresAt - bufferTime);
  }

  /**
   * Get credentials from Vault
   */
  async getCredentialsFromVault(accountId) {
    try {
      const vaultPath = `ctrader/accounts/${accountId}`;
      const credentials = await vaultManager.getSecret(vaultPath);

      if (credentials) {
        return {
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token,
          expiresIn: credentials.expires_in,
          obtainedAt: credentials.obtained_at,
          ctidTraderAccountId: credentials.ctid_trader_account_id,
          environment: credentials.environment || 'demo',
          accNum: credentials.acc_num || 1
        };
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get credentials from Vault: ${error.message}`);
      return null;
    }
  }

  /**
   * Save credentials to Vault
   */
  async saveCredentialsToVault(accountId, tokenData, additionalData = {}) {
    try {
      const vaultPath = `ctrader/accounts/${accountId}`;
      const credentials = {
        access_token: tokenData.accessToken,
        refresh_token: tokenData.refreshToken,
        expires_in: tokenData.expiresIn,
        obtained_at: tokenData.obtainedAt,
        ...additionalData
      };

      await vaultManager.setSecret(vaultPath, credentials);
      logger.info(`Saved credentials for account ${accountId} to Vault`);
      return true;
    } catch (error) {
      logger.error(`Failed to save credentials to Vault: ${error.message}`);
      return false;
    }
  }

  /**
   * Refresh token for a specific account
   */
  async refreshTokenForAccount(accountId, existingCredentials) {
    try {
      // Get OAuth client credentials from Vault
      const oauthConfig = await vaultManager.getSecret('ctrader/oauth');
      if (!oauthConfig) {
        throw new Error('No OAuth configuration found in Vault');
      }

      const refreshed = await this.refreshAccessToken(
        existingCredentials.refreshToken,
        oauthConfig.client_id,
        oauthConfig.client_secret
      );

      // Save refreshed token to Vault
      await this.saveCredentialsToVault(accountId, refreshed, {
        ctid_trader_account_id: existingCredentials.ctidTraderAccountId,
        environment: existingCredentials.environment,
        acc_num: existingCredentials.accNum
      });

      // Update cache
      const fullCredentials = {
        ...existingCredentials,
        ...refreshed
      };
      this.tokenCache.set(accountId, fullCredentials);
      this.scheduleTokenRefresh(accountId, fullCredentials);

      return refreshed;
    } catch (error) {
      logger.error(`Failed to refresh token for account ${accountId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Schedule automatic token refresh
   */
  scheduleTokenRefresh(accountId, tokenData) {
    // Clear existing timer
    const existingTimer = this.refreshTimers.get(accountId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Calculate when to refresh (5 minutes before expiry)
    const expiresIn = tokenData.expiresIn || 3600;
    const refreshIn = Math.max((expiresIn - 300) * 1000, 30000); // At least 30 seconds

    const timer = setTimeout(async () => {
      try {
        logger.info(`Auto-refreshing token for account ${accountId}`);
        await this.refreshTokenForAccount(accountId, tokenData);
      } catch (error) {
        logger.error(`Auto-refresh failed for account ${accountId}: ${error.message}`);
      }
    }, refreshIn);

    this.refreshTimers.set(accountId, timer);
  }

  /**
   * Clear all cached tokens and timers
   */
  clearCache() {
    // Clear all refresh timers
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
    this.tokenCache.clear();
  }

  /**
   * Initialize account for first use
   */
  async initializeAccount(accountId, authCode, additionalData = {}) {
    try {
      // Get OAuth config from Vault
      const oauthConfig = await vaultManager.getSecret('ctrader/oauth');
      if (!oauthConfig) {
        throw new Error('No OAuth configuration found in Vault');
      }

      // Exchange code for token
      const tokenData = await this.exchangeCodeForToken(
        authCode,
        oauthConfig.client_id,
        oauthConfig.client_secret,
        oauthConfig.redirect_uri
      );

      // Get account details
      const accounts = await this.getAllAccounts(tokenData.accessToken);

      // Find the specific account or use first one
      const account = accounts.find(acc => acc.accountId === accountId) || accounts[0];
      if (!account) {
        throw new Error('No accounts found for this user');
      }

      // Save to Vault with account details
      await this.saveCredentialsToVault(accountId, tokenData, {
        ctid_trader_account_id: account.ctidTraderAccountId,
        environment: account.environment || 'demo',
        acc_num: additionalData.accNum || 1,
        broker_name: account.brokerName,
        account_name: account.accountName
      });

      return {
        success: true,
        accountId: accountId,
        ctidTraderAccountId: account.ctidTraderAccountId,
        environment: account.environment
      };
    } catch (error) {
      logger.error(`Failed to initialize account ${accountId}: ${error.message}`);
      throw error;
    }
  }
}

export default new CTraderAuth();