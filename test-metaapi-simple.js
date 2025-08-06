require('dotenv').config();

async function testMetaApiConnection() {
  console.log('🧪 Testing MetaApi Connection...\n');
  
  const token = process.env.METAAPI_TOKEN;
  const region = process.env.METAAPI_REGION || 'new-york';
  
  if (!token) {
    console.error('❌ MetaApi token not found in environment variables');
    return;
  }
  
  console.log(`✅ MetaApi Token: ${token.substring(0, 50)}...`);
  console.log(`🌍 MetaApi Region: ${region}`);
  
  try {
    const MetaApi = require('metaapi.cloud-sdk').default;
    console.log('✅ MetaApi SDK loaded successfully');
    
    const api = new MetaApi(token, {
      region: region,
      requestTimeout: 30000
    });
    
    console.log('✅ MetaApi client initialized');
    
    // Test API connection
    const accounts = await api.metatraderAccountApi.getAccounts();
    console.log(`\n📊 Found ${accounts.length} MetaTrader account(s)`);
    
    if (accounts.length > 0) {
      accounts.forEach((account, index) => {
        console.log(`\nAccount ${index + 1}:`);
        console.log(`- Name: ${account.name}`);
        console.log(`- Login: ${account.login}`);
        console.log(`- Server: ${account.server}`);
        console.log(`- State: ${account.state}`);
      });
    }
    
    console.log('\n✅ MetaApi connection test successful!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
  }
}

testMetaApiConnection();