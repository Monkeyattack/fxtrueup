require('dotenv').config();

async function testMetaApi() {
  try {
    console.log('🧪 Testing MetaApi connectivity (fixed)...');
    
    const MetaApi = require('metaapi.cloud-sdk').default;
    const api = new MetaApi(process.env.METAAPI_TOKEN, { region: 'new-york' });
    console.log('✅ MetaApi SDK loaded successfully');
    
    // Test basic API access (using correct property names)
    console.log('📋 Fetching provisioning profiles...');
    const profiles = await api._provisioningProfileApi.getProvisioningProfilesWithClassicPagination();
    console.log('✅ Successfully connected to MetaApi');
    console.log('📋 Found', profiles.length, 'provisioning profiles');
    
    console.log('📊 Fetching MetaTrader accounts...');
    const accounts = await api._metatraderAccountApi.getAccountsWithClassicPagination();
    console.log('📊 Found', accounts.length, 'MetaTrader accounts');
    
    // Show some details
    if (accounts.length > 0) {
      console.log('🔍 Existing accounts:');
      accounts.forEach(acc => {
        console.log('  - ' + acc.name + ' (' + acc.login + ') - State: ' + acc.state);
      });
    }
    
    console.log('🎉 MetaApi test completed successfully\!');
    
    // Test deploying your account
    console.log('🚀 Testing account deployment for PlexyTrade...');
    
    // Your account details
    const accountData = {
      accountName: 'MonkeyAttack Gold EA',
      accountType: 'mt4',
      login: '1123261449',
      serverName: 'Plexytrade-Live',
      brokerName: 'PlexyTrade', 
      password: 'ETX00kr*WD'
    };
    
    // Create provisioning profile
    let profileId;
    if (profiles.length > 0) {
      profileId = profiles[0]._id;
      console.log('📋 Using existing profile:', profiles[0].name);
    } else {
      console.log('📋 Creating new provisioning profile...');
      const profile = await api._provisioningProfileApi.createProvisioningProfile({
        name: 'PlexyTrade-Test-' + Date.now(),
        version: 4,
        brokerTimezone: 'EET',
        brokerDSTSwitchTimezone: 'EET'
      });
      profileId = profile.id;
      console.log('✅ Created profile:', profile.id);
    }
    
    // Deploy account
    console.log('🚀 Deploying account to MetaApi...');
    const metaAccount = await api._metatraderAccountApi.createAccount({
      name: accountData.accountName,
      type: 'cloud',
      login: accountData.login,
      password: accountData.password,
      server: accountData.serverName,
      provisioningProfileId: profileId,
      magic: 0,
      application: 'MetaApi',
      connectionStatus: 'connected'
    });
    
    console.log('✅ Account deployed\! MetaApi ID:', metaAccount.id);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ MetaApi test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testMetaApi();
