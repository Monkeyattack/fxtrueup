#!/usr/bin/env node

/**
 * Find and analyze the Gold Buy Only Service account
 * This script helps identify the account ID from the MetaAPI response
 */

import dotenv from 'dotenv';

dotenv.config();

// The account data you provided
const GOLD_ACCOUNT_DATA = {
  "state": "DEPLOYED",
  "magic": 0,
  "connectionStatus": "CONNECTED",
  "quoteStreamingIntervalInSeconds": 2.5,
  "symbol": "EURUSD",
  "reliability": "high",
  "tags": [],
  "resourceSlots": 1,
  "copyFactoryResourceSlots": 1,
  "region": "london",
  "name": "Gold Buy Only Service",
  "login": "3052705",
  "server": "PlexyTrade-Server01",
  "type": "cloud-g2",
  "version": 5,
  "hash": 45790,
  "userId": "190a63adf52f8e729e41df1315aad725",
  "copyFactoryRoles": [],
  "metastatsApiEnabled": true, // You said you enabled it
  "riskManagementApiEnabled": false,
  "accountReplicas": [],
  "application": "MetaApi",
  "createdAt": "2025-08-31T22:05:19.712Z",
  "primaryReplica": true,
  "connections": [
    {
      "application": "MetaApi",
      "region": "london",
      "zone": "a"
    },
    {
      "application": "MetaApi",
      "region": "london",
      "zone": "b"
    }
  ]
};

console.log('🔍 GOLD BUY ONLY SERVICE - ACCOUNT IDENTIFICATION');
console.log('═'.repeat(60));

console.log('\n📋 Account Details:');
console.log(`Name: ${GOLD_ACCOUNT_DATA.name}`);
console.log(`Login: ${GOLD_ACCOUNT_DATA.login}`);
console.log(`Server: ${GOLD_ACCOUNT_DATA.server}`);
console.log(`Region: ${GOLD_ACCOUNT_DATA.region}`);
console.log(`Type: ${GOLD_ACCOUNT_DATA.type}`);
console.log(`State: ${GOLD_ACCOUNT_DATA.state}`);
console.log(`MetaStats: ${GOLD_ACCOUNT_DATA.metastatsApiEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
console.log(`Created: ${new Date(GOLD_ACCOUNT_DATA.createdAt).toLocaleString()}`);

console.log('\n🔑 Identifying Information:');
console.log(`User ID: ${GOLD_ACCOUNT_DATA.userId}`);
console.log(`Hash: ${GOLD_ACCOUNT_DATA.hash}`);

console.log('\n💡 To find the account ID:');
console.log('1. When you create/deploy an account in MetaAPI, it returns an ID');
console.log('2. The ID is usually in the response as "id" or "_id" field');
console.log('3. It\'s a UUID format like: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');

console.log('\n📝 Next Steps:');
console.log('1. Check the MetaAPI dashboard for this account');
console.log('2. Look for the account with login 3052705');
console.log('3. The account ID should be visible in the account details');
console.log('4. Or check the response when you created/deployed this account');

console.log('\n🔧 Configuration Needed:');
console.log('Add this account to meta-trader-hub configuration:');
console.log('```');
console.log(`GOLD_ACCOUNT_ID=<the-account-uuid>`);
console.log(`GOLD_REGION=london`);
console.log(`GOLD_LOGIN=3052705`);
console.log('```');

console.log('\n📊 Once configured, you can run:');
console.log('GOLD_ACCOUNT_ID=<uuid> node gold-account-report.js');

// Check if the account data was from a create/get response
console.log('\n⚠️  Important:');
console.log('The JSON data you provided appears to be from a GET account response.');
console.log('The account ID is usually included as "id" or "_id" at the root level.');
console.log('If you have the full response, look for these fields.');