require('dotenv').config();

async function deployDemoAccount() {
  try {
    console.log('🚀 Deploying MonkeyAttack Gold EA Demo account to MetaApi...');
    
    const MetaApi = require('metaapi.cloud-sdk').default;
    const api = new MetaApi(process.env.METAAPI_TOKEN, { region: 'new-york' });
    
    const accountConfig = {
      "quoteStreamingIntervalInSeconds": 2.5,
      "resourceSlots": 1,
      "copyFactoryResourceSlots": 1,
      "region": "new-york",
      "magic": 0,
      "reliability": "high",
      "metastatsApiEnabled": false,
      "riskManagementApiEnabled": false,
      "platform": "mt4",
      "name": "Monkey Attack Gold EA Demo (Direct)",
      "type": "cloud-g2",
      "server": "PlexyTrade-Demo",
      "login": "1123261449",
      "copyFactoryRoles": ["SUBSCRIBER"],
      "baseCurrency": "USD",
      "password": "ETX00kr*WD"  // Using the actual password from your accounts
    };
    
    console.log('📋 Deploying with config:', {
      ...accountConfig,
      password: '[HIDDEN]'
    });
    
    try {
      const account = await api._metatraderAccountApi.createAccount(accountConfig);
      console.log('✅ Success! Account deployed to MetaApi');
      console.log('Account ID:', account.id);
      console.log('State:', account.state);
      console.log('Connection Status:', account.connectionStatus);
      
      // Wait for deployment
      console.log('\n⏳ Waiting for account deployment...');
      await account.waitDeployed();
      console.log('✅ Account deployed successfully!');
      
      // Connect to account
      console.log('\n🔌 Connecting to account...');
      await account.waitConnected();
      console.log('✅ Account connected!');
      
      // Get account information
      console.log('\n📊 Getting account information...');
      const accountInfo = await account.getAccountInformation();
      console.log('Account info:', accountInfo);
      
      console.log('\n✨ Deployment complete!');
      console.log('MetaApi Account ID:', account.id);
      console.log('\nNEXT STEPS:');
      console.log('1. Update accounts.json to add metaApiAccountId:', account.id);
      console.log('2. Restart the server to use real MetaApi data');
      
      return account.id;
      
    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      if (error.details) {
        console.error('Details:', JSON.stringify(error.details, null, 2));
      }
    }
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  }
}

deployDemoAccount();