#!/usr/bin/env node
/**
 * Test cTrader Authentication
 * Tests the OAuth2 flow and JWT token management
 */

import auth from '../auth.js';
import { logger } from '../../../utils/logger.js';

// Test configuration
const testConfig = {
  clientId: process.env.CTRADER_CLIENT_ID || 'test_client_id',
  clientSecret: process.env.CTRADER_CLIENT_SECRET || 'test_client_secret',
  redirectUri: process.env.CTRADER_REDIRECT_URI || 'http://localhost:8080/api/ctrader/callback',
  accountId: process.env.CTRADER_TEST_ACCOUNT || '12345'
};

async function testAuthentication() {
  console.log('🔐 Testing cTrader Authentication...\n');

  try {
    // Test 1: Get authorization URL
    console.log('1. Testing authorization URL generation:');
    const authUrl = auth.getAuthorizationUrl('test_state_123');
    console.log(`✅ Auth URL: ${authUrl}\n`);

    // Test 2: Mock token exchange (would need actual auth code in production)
    console.log('2. Testing token exchange (mock):');
    if (process.env.CTRADER_AUTH_CODE) {
      const tokens = await auth.exchangeCodeForTokens(process.env.CTRADER_AUTH_CODE);
      console.log('✅ Tokens received:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in
      });
    } else {
      console.log('⚠️  Skipping - No auth code provided\n');
    }

    // Test 3: Test vault integration
    console.log('3. Testing Vault integration:');
    try {
      await auth.saveTokensToVault(testConfig.accountId, {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expires_in: 3600
      });
      console.log('✅ Tokens saved to Vault\n');
    } catch (error) {
      console.log('⚠️  Vault not available:', error.message, '\n');
    }

    // Test 4: Test token retrieval from Vault
    console.log('4. Testing token retrieval:');
    try {
      const savedTokens = await auth.getTokensFromVault(testConfig.accountId);
      console.log('✅ Tokens retrieved:', {
        hasAccessToken: !!savedTokens?.accessToken,
        hasRefreshToken: !!savedTokens?.refreshToken
      });
    } catch (error) {
      console.log('⚠️  Could not retrieve tokens:', error.message, '\n');
    }

    // Test 5: Test token refresh
    console.log('5. Testing token refresh:');
    if (process.env.CTRADER_REFRESH_TOKEN) {
      try {
        const newTokens = await auth.refreshAccessToken(process.env.CTRADER_REFRESH_TOKEN);
        console.log('✅ Tokens refreshed:', {
          hasNewAccessToken: !!newTokens.access_token,
          expiresIn: newTokens.expires_in
        });
      } catch (error) {
        console.log('❌ Refresh failed:', error.message, '\n');
      }
    } else {
      console.log('⚠️  Skipping - No refresh token provided\n');
    }

    // Test 6: Test account initialization
    console.log('6. Testing account initialization:');
    try {
      const initialized = await auth.initializeAccount(testConfig.accountId);
      console.log(initialized ? '✅ Account initialized' : '⚠️  Account not initialized\n');
    } catch (error) {
      console.log('❌ Initialization failed:', error.message, '\n');
    }

    console.log('\n✅ Authentication tests completed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testAuthentication().catch(console.error);