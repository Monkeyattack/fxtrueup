/**
 * Vault configuration helper for FXTrueUp
 * Retrieves secrets from HashiCorp Vault
 */

import https from 'https';
import fs from 'fs';
import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

class VaultManager {
  constructor() {
    this.vaultAddr = process.env.VAULT_ADDR || 'https://vault.profithits.app:8200';
    this.vaultToken = process.env.VAULT_TOKEN;
    this.caCertPath = process.env.VAULT_CACERT || '/home/claude-dev/fullchain1.pem';

    // Create HTTPS agent with CA cert if it exists
    this.httpsAgent = null;
    if (fs.existsSync(this.caCertPath)) {
      this.httpsAgent = new https.Agent({
        ca: fs.readFileSync(this.caCertPath),
        rejectUnauthorized: true
      });
    }
  }

  async getSecret(path) {
    if (!this.vaultToken) {
      logger.warn('No VAULT_TOKEN found, falling back to environment variables');
      return null;
    }

    try {
      const url = `${this.vaultAddr}/v1/${path}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Vault-Token': this.vaultToken,
          'Content-Type': 'application/json'
        },
        agent: this.httpsAgent
      });

      if (!response.ok) {
        throw new Error(`Vault request failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data.data || data.data;
    } catch (error) {
      logger.error('Vault error:', error);
      return null;
    }
  }

  async getRedisConfig() {
    // Try to get Redis config from Vault
    const vaultConfig = await this.getSecret('secret/shared/redis');

    if (vaultConfig) {
      return {
        host: vaultConfig.host || 'localhost',
        port: parseInt(vaultConfig.port || '6379'),
        password: vaultConfig.password,
        db: parseInt(vaultConfig.db || '0')
      };
    }

    // Fallback to environment variables
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || '9W_n8pNROA_ZXOZt6KoKqL8V7FAvuAySw-kCmHSKBrA',
      db: parseInt(process.env.REDIS_DB || '0')
    };
  }

  async getMetaApiConfig() {
    // Try to get MetaAPI config from Vault
    const vaultConfig = await this.getSecret('secret/metaapi');

    if (vaultConfig) {
      return {
        token: vaultConfig.token,
        region: vaultConfig.region || 'new-york'
      };
    }

    // Fallback to environment variables
    return {
      token: process.env.METAAPI_TOKEN,
      region: process.env.METAAPI_REGION || 'new-york'
    };
  }

  async getTelegramConfig() {
    // Try to get Telegram config from Vault
    const vaultConfig = await this.getSecret('secret/telegram');

    if (vaultConfig) {
      return {
        botToken: vaultConfig.bot_token,
        chatId: vaultConfig.chat_id
      };
    }

    // Fallback to environment variables
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID
    };
  }
}

// Export singleton instance
export const vaultManager = new VaultManager();