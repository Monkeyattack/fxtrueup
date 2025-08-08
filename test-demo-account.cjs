require('dotenv').config();

async function testDemoAccount() {
  try {
    console.log('🔍 Testing MonkeyAttack Gold EA Demo account...');
    
    const MetaApi = require('metaapi.cloud-sdk').default;
    const api = new MetaApi(process.env.METAAPI_TOKEN, { region: 'new-york' });
    
    const accountId = 'd25b9ece-3422-43e8-a59b-cf85246beb3b';
    console.log('Account ID:', accountId);
    
    // Get account
    const account = await api.metatraderAccountApi.getAccount(accountId);
    console.log('\n📊 Account Status:');
    console.log('- Name:', account.name);
    console.log('- State:', account.state);
    console.log('- Connection:', account.connectionStatus);
    console.log('- Server:', account.server);
    console.log('- Login:', account.login);
    
    // Wait for connection if needed
    if (account.connectionStatus !== 'CONNECTED') {
      console.log('\n🔌 Connecting to account...');
      await account.waitConnected();
      console.log('✅ Connected!');
    }
    
    // Get account information
    console.log('\n💰 Getting account information...');
    const connection = account.getRPCConnection();
    const accountInfo = await connection.getAccountInformation();
    
    console.log('\n📈 Account Details:');
    console.log('- Balance:', accountInfo.balance, accountInfo.currency);
    console.log('- Equity:', accountInfo.equity);
    console.log('- Margin:', accountInfo.margin);
    console.log('- Free Margin:', accountInfo.freeMargin);
    console.log('- Leverage:', accountInfo.leverage);
    console.log('- Broker:', accountInfo.broker);
    
    // Get open positions
    console.log('\n📊 Getting open positions...');
    const positions = await connection.getPositions();
    console.log('Open positions:', positions.length);
    
    if (positions.length > 0) {
      positions.forEach((pos, i) => {
        console.log(`\nPosition ${i + 1}:`);
        console.log('- Symbol:', pos.symbol);
        console.log('- Type:', pos.type);
        console.log('- Volume:', pos.volume);
        console.log('- Profit:', pos.profit);
      });
    }
    
    console.log('\n✅ Demo account is working correctly with MetaApi!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.details) {
      console.error('Details:', JSON.stringify(error.details, null, 2));
    }
  }
}

testDemoAccount();