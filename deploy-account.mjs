import dotenv from 'dotenv';
import MetaApiService from './metaapi-server-integration.js';

dotenv.config();

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
    
    const metaApiService = new MetaApiService();
    
    // Deploy the account to MetaApi
    console.log('⏳ Deploying account to MetaApi...');
    const deployment = await metaApiService.deployAccount(accountData);
    
    console.log('✅ Account deployment successful!');
    console.log('📋 Deployment details:', JSON.stringify(deployment, null, 2));
    
    // Test getting account info
    console.log('🔍 Testing account info retrieval...');
    const accountInfo = await metaApiService.getAccountInfo(deployment.metaApiAccountId);
    
    if (accountInfo) {
      console.log('✅ Account info retrieved successfully:');
      console.log(`💰 Balance: $${accountInfo.balance}`);
      console.log(`💎 Equity: $${accountInfo.equity}`);
      console.log(`📈 Profit: $${accountInfo.profit}`);
      console.log(`🔐 Trade Allowed: ${accountInfo.tradeAllowed}`);
      console.log(`🏦 Server: ${accountInfo.server}`);
    } else {
      console.log('⚠️  Account info not yet available (account may still be deploying)');
    }
    
    // Test getting recent deals
    console.log('📈 Testing deals retrieval...');
    const deals = await metaApiService.getDeals(deployment.metaApiAccountId);
    console.log(`📊 Retrieved ${deals.length} recent deals`);
    
    if (deals.length > 0) {
      console.log('🔍 Sample deal:', JSON.stringify(deals[0], null, 2));
    }
    
    // Test getting positions
    console.log('📊 Testing positions retrieval...');
    const positions = await metaApiService.getPositions(deployment.metaApiAccountId);
    console.log(`📈 Found ${positions.length} open positions`);
    
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
    console.error('📚 Full error:', error);
    process.exit(1);
  }
}

// Run deployment
deployUserAccount();