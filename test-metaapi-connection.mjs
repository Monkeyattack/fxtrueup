import MetaApi from 'metaapi.cloud-sdk';
import dotenv from 'dotenv';

dotenv.config();

async function testMetaApi() {
  try {
    console.log('🧪 Testing MetaApi connectivity...');
    const api = new MetaApi(process.env.METAAPI_TOKEN, { region: 'new-york' });
    console.log('✅ MetaApi SDK loaded successfully');
    
    // Test basic API access
    console.log('📋 Fetching provisioning profiles...');
    const profiles = await api.provisioningProfileApi.getProvisioningProfiles();
    console.log('✅ Successfully connected to MetaApi');
    console.log('📋 Found', profiles.length, 'provisioning profiles');
    
    console.log('📊 Fetching MetaTrader accounts...');
    const accounts = await api.metatraderAccountApi.getAccounts();
    console.log('📊 Found', accounts.length, 'MetaTrader accounts');
    
    // Show some details
    if (accounts.length > 0) {
      console.log('🔍 Existing accounts:');
      accounts.forEach(acc => {
        console.log(`  - ${acc.name} (${acc.login}) - State: ${acc.state}`);
      });
    }
    
    console.log('🎉 MetaApi test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ MetaApi test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testMetaApi();