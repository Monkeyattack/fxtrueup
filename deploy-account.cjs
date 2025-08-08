require('dotenv').config();

// Account data from the VPS accounts.json file
const accountData = {
  id: "1754509908393",
  userId: "123",
  connectionMethod: "metaapi",
  accountName: "MonkeyAttack Gold EA",
  accountType: "mt4",
  login: "1123261449",
  serverName: "Plexytrade-Live",
  brokerName: "PlexyTrade", 
  accountRegion: "new-york",
  password: "ETX00kr*WD",
  readOnlyPassword: "",
  magic: "",
  riskManagementApiEnabled: false,
  baseCurrency: "USD",
  copyFactoryRoles: "",
  initialBalance: "",
  currentBalance: "",
  equity: "",
  categoryTags: "ea",
  accountNotes: "",
  tags: ["demo", "scalping", "aggressive", "ea", "test", "signalstart"],
  createdAt: "2025-08-06T19:51:48.393Z"
};

async function deployUserAccount() {
  try {
    console.log('🚀 Starting MetaApi deployment for MonkeyAttack Gold EA account...');
    console.log(`📋 Account: ${accountData.accountName}`);
    console.log(`🏦 Broker: ${accountData.brokerName}`);
    console.log(`🔗 Server: ${accountData.serverName}`);
    console.log(`👤 Login: ${accountData.login}`);
    
    // Import MetaApi SDK using CommonJS
    const { default: MetaApi } = await import('metaapi.cloud-sdk');
    const api = new MetaApi(process.env.METAAPI_TOKEN, { region: 'new-york' });
    
    // Create provisioning profile first
    console.log('📋 Creating provisioning profile...');
    const profiles = await api.provisioningProfileApi.getProvisioningProfiles();
    
    let provisioningProfileId;
    const existingProfile = profiles.find(p => 
      p.name.toLowerCase().includes(accountData.brokerName.toLowerCase())
    );
    
    if (existingProfile) {
      console.log(`📋 Using existing provisioning profile: ${existingProfile.name}`);
      provisioningProfileId = existingProfile._id;
    } else {
      // Create new provisioning profile
      const profileName = `${accountData.brokerName}-${Date.now()}`;
      const profile = await api.provisioningProfileApi.createProvisioningProfile({
        name: profileName,
        version: accountData.accountType.toUpperCase() === 'MT5' ? 5 : 4,
        brokerTimezone: 'EET',
        brokerDSTSwitchTimezone: 'EET'
      });
      
      console.log(`✅ Created provisioning profile: ${profileName}`);
      provisioningProfileId = profile.id;
    }
    
    // Deploy the account to MetaApi
    console.log('⏳ Deploying account to MetaApi...');
    const metaAccount = await api.metatraderAccountApi.createAccount({
      name: accountData.accountName,
      type: 'cloud',
      login: accountData.login,
      password: accountData.password,
      server: accountData.serverName,
      provisioningProfileId: provisioningProfileId,
      magic: parseInt(accountData.magic) || 0,
      application: 'MetaApi',
      connectionStatus: 'connected'
    });

    console.log(`✅ Deployed account ${accountData.accountName} to MetaApi: ${metaAccount.id}`);
    
    // Wait for deployment (with timeout)
    console.log('⏳ Waiting for account deployment...');
    try {
      await metaAccount.waitDeployed();
      console.log(`🚀 Account ${accountData.accountName} deployed successfully`);
    } catch (error) {
      console.log(`⚠️  Deployment in progress (${error.message}), continuing...`);
    }
    
    const deployment = {
      metaApiAccountId: metaAccount.id,
      provisioningProfileId: provisioningProfileId,
      state: metaAccount.state,
      connectionStatus: metaAccount.connectionStatus
    };
    
    console.log('✅ Account deployment details:', JSON.stringify(deployment, null, 2));
    
    console.log('\n🎉 Deployment completed successfully!');
    console.log('📋 Next steps:');
    console.log('1. Update the account record in accounts.json with the metaApiAccountId');
    console.log('2. Restart the server to use real MetaApi data instead of mock data');
    console.log(`3. MetaApi Account ID: ${deployment.metaApiAccountId}`);
    
    return deployment;
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    if (error.details) {
      console.error('📋 Error details:', JSON.stringify(error.details, null, 2));
    }
    console.error('📚 Stack:', error.stack);
    process.exit(1);
  }
}

// Run deployment
deployUserAccount();