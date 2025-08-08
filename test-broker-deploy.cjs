require('dotenv').config();

async function testBrokerDeploy() {
  try {
    console.log('🔍 Testing PlexyTrade deployment without server files...');
    
    const MetaApi = require('metaapi.cloud-sdk').default;
    const api = new MetaApi(process.env.METAAPI_TOKEN, { region: 'new-york' });
    
    // Try different server name variations
    const serverVariations = [
      'Plexytrade-Live',
      'PlexyTrade-Live', 
      'Plexytrade-Real',
      'PlexyTrade-Real',
      'Plexytrade',
      'PlexyTrade'
    ];
    
    console.log('📋 Checking existing provisioning profiles...');
    const profiles = await api._provisioningProfileApi.getProvisioningProfilesWithClassicPagination();
    console.log(`Found ${profiles.length || 0} existing profiles`);
    
    if (profiles.length > 0) {
      console.log('\n📋 Existing profiles:');
      profiles.forEach(p => {
        console.log(`- ${p.name} (ID: ${p._id}, Status: ${p.status})`);
      });
    }
    
    // Try to create account with minimal config
    console.log('\n🚀 Attempting minimal deployment...');
    
    const accountConfig = {
      name: 'MonkeyAttack Gold EA - Test',
      type: 'cloud',
      login: '1123261449',
      password: 'ETX00kr*WD',
      server: 'Plexytrade-Live',
      platform: 'mt4'
    };
    
    console.log('📋 Trying deployment with config:', {
      ...accountConfig,
      password: '[HIDDEN]'
    });
    
    try {
      // Try without provisioning profile first
      const account = await api._metatraderAccountApi.createAccount(accountConfig);
      console.log('✅ Success! Account created without provisioning profile!');
      console.log('Account ID:', account.id);
      return;
    } catch (error) {
      console.log('❌ Direct deployment failed:', error.message);
    }
    
    // Try with each server variation
    for (const serverName of serverVariations) {
      console.log(`\n🔍 Trying server name: ${serverName}`);
      try {
        const testConfig = { ...accountConfig, server: serverName };
        const account = await api._metatraderAccountApi.createAccount(testConfig);
        console.log(`✅ Success with server name: ${serverName}!`);
        console.log('Account ID:', account.id);
        return;
      } catch (error) {
        console.log(`❌ Failed with ${serverName}: ${error.message}`);
      }
    }
    
    console.log('\n📝 Summary: PlexyTrade may require manual configuration.');
    console.log('Next steps:');
    console.log('1. Contact MetaApi support at support@metaapi.cloud');
    console.log('2. Ask them to add PlexyTrade support');
    console.log('3. Or use manual account updates for now');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testBrokerDeploy();