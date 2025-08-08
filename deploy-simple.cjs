require('dotenv').config();

async function deployAccount() {
  try {
    console.log('🚀 Deploying MonkeyAttack Gold EA account...');
    
    const MetaApi = require('metaapi.cloud-sdk').default;
    const api = new MetaApi(process.env.METAAPI_TOKEN, { region: 'new-york' });
    console.log('✅ MetaApi SDK loaded');
    
    // Check existing accounts first
    const existingAccounts = await api._metatraderAccountApi.getAccountsWithClassicPagination();
    const accounts = Array.isArray(existingAccounts) ? existingAccounts : (existingAccounts ? [existingAccounts] : []);
    console.log(`📊 Found ${accounts.length} existing accounts`);
    
    // Check if account already exists
    const existingAccount = accounts.find(acc => acc.login === '1123261449');
    if (existingAccount) {
      console.log('✅ Account already deployed! MetaApi ID:', existingAccount.id);
      console.log('📋 Account state:', existingAccount.state);
      console.log('🔗 Connection status:', existingAccount.connectionStatus);
      return {
        metaApiAccountId: existingAccount.id,
        state: existingAccount.state,
        connectionStatus: existingAccount.connectionStatus
      };
    }
    
    // Get provisioning profiles
    const profiles = await api._provisioningProfileApi.getProvisioningProfilesWithClassicPagination();
    console.log(`📋 Found ${profiles.length || 0} provisioning profiles`);
    
    let profileId;
    if (profiles.length > 0) {
      profileId = profiles[0]._id;
      console.log('📋 Using existing profile:', profiles[0].name);
    } else {
      console.log('📋 Creating provisioning profile...');
      const profile = await api._provisioningProfileApi.createProvisioningProfile({
        name: 'PlexyTrade-Profile-' + Date.now(),
        version: 4,
        brokerTimezone: 'EET',
        brokerDSTSwitchTimezone: 'EET'
      });
      profileId = profile.id;
      console.log('✅ Created profile:', profile.id);
    }
    
    // Deploy account with proper validation
    console.log('🚀 Creating MetaTrader account...');
    
    const accountPayload = {
      name: 'MonkeyAttack Gold EA',
      type: 'cloud',
      login: '1123261449',
      password: 'ETX00kr*WD',
      server: 'Plexytrade-Live',
      provisioningProfileId: profileId,
      magic: 0,
      application: 'MetaApi'
    };
    
    console.log('📋 Account payload:', JSON.stringify(accountPayload, { password: '[HIDDEN]' }, 2));
    
    try {
      const metaAccount = await api._metatraderAccountApi.createAccount(accountPayload);
      console.log('✅ Account created successfully!');
      console.log('📋 MetaApi Account ID:', metaAccount.id);
      console.log('📋 Account state:', metaAccount.state);
      
      return {
        metaApiAccountId: metaAccount.id,
        provisioningProfileId: profileId,
        state: metaAccount.state,
        connectionStatus: metaAccount.connectionStatus
      };
      
    } catch (createError) {
      console.error('❌ Account creation failed:', createError.message);
      
      // Try to get more details about the validation error
      if (createError.details) {
        console.error('🔍 Validation details:', JSON.stringify(createError.details, null, 2));
      }
      
      throw createError;
    }
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    
    if (error.details) {
      console.error('📋 Error details:', JSON.stringify(error.details, null, 2));
    }
    
    console.error('📚 Full error:', error);
    process.exit(1);
  }
}

deployAccount();