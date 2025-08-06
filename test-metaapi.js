import metaApiIntegration from './src/metaapi-integration.js';
import dotenv from 'dotenv';

dotenv.config();

async function testMetaApiConnection() {
  console.log('🧪 Testing MetaApi Integration...\n');
  
  try {
    // Test connection
    console.log('1️⃣ Testing MetaApi connection...');
    const isConnected = await metaApiIntegration.testConnection();
    
    if (!isConnected) {
      console.error('❌ Failed to connect to MetaApi');
      return;
    }
    
    // List existing accounts
    console.log('\n2️⃣ Listing existing accounts...');
    const accounts = await metaApiIntegration.listAccounts();
    
    if (accounts.length === 0) {
      console.log('📭 No accounts found');
    } else {
      console.log(`📬 Found ${accounts.length} account(s):`);
      accounts.forEach(account => {
        console.log(`\n  Account: ${account.name}`);
        console.log(`  - ID: ${account.id}`);
        console.log(`  - Login: ${account.login}`);
        console.log(`  - Server: ${account.server}`);
        console.log(`  - Platform: ${account.platform}`);
        console.log(`  - State: ${account.state}`);
        console.log(`  - Region: ${account.region}`);
        if (account.balance !== undefined) {
          console.log(`  - Balance: ${account.baseCurrency} ${account.balance}`);
          console.log(`  - Equity: ${account.baseCurrency} ${account.equity}`);
        }
      });
    }
    
    console.log('\n✅ MetaApi integration test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testMetaApiConnection();