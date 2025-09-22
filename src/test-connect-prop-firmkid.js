#!/usr/bin/env node

// Quick connectivity test for the new PropFirmKidEA source account
// Uses the connection pool API to fetch account info and open positions

import dotenv from 'dotenv';
import poolClient from './services/poolClient.js';
import { ACCOUNT_CONFIGS, PROP_FIRMKID_EA_ID } from './config/accounts.js';

dotenv.config();

async function main() {
  const accountId = PROP_FIRMKID_EA_ID;
  const region = ACCOUNT_CONFIGS.PROP_FIRMKID_EA.region || 'london';

  console.log('🔌 Testing connection to PropFirmKidEA (source)');
  console.log(`Account ID: ${accountId}`);
  console.log(`Region: ${region}`);

  try {
    const info = await poolClient.getAccountInfo(accountId, region);
    const positions = await poolClient.getPositions(accountId, region);

    console.log('\n✅ Connection OK');
    console.log(`Balance: $${info.balance ?? 'N/A'}`);
    console.log(`Equity: $${info.equity ?? 'N/A'}`);
    console.log(`Platform: ${info.platform ?? 'mt5'}`);
    console.log(`Open positions: ${positions.length}`);

    if (positions.length) {
      positions.slice(0, 10).forEach(p => {
        console.log(` - ${p.symbol} ${p.type} ${p.volume} lots @ ${p.openPrice}`);
      });
    }
  } catch (err) {
    console.error('❌ Failed to connect via pool:', err.message);
    console.error('Hints:');
    console.error(' - Ensure POOL_API_URL points to your pool server (default http://localhost:8087)');
    console.error(' - Ensure METAAPI_TOKEN is set in .env');
    console.error(' - Ensure the MetaApi account is deployed and reachable');
    process.exit(1);
  }
}

main();

