require('dotenv').config();

async function testDemoAccount() {
  try {
    console.log('🔍 Testing MonkeyAttack Gold EA Demo account...');
    
    const MetaApi = require('metaapi.cloud-sdk').default;
    const api = new MetaApi(process.env.METAAPI_TOKEN, { 
      region: 'new-york',
      domain: 'agiliumtrade.agiliumtrade.ai'
    });
    
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
    
    // Create streaming connection
    console.log('\n🔌 Creating streaming connection...');
    const connection = account.getStreamingConnection();
    await connection.connect();
    await connection.waitSynchronized();
    console.log('✅ Connected and synchronized!');
    
    // Get terminal state
    const terminalState = connection.terminalState;
    const accountInformation = terminalState.accountInformation;
    
    if (accountInformation) {
      console.log('\n📈 Account Details:');
      console.log('- Balance:', accountInformation.balance, accountInformation.currency);
      console.log('- Equity:', accountInformation.equity);
      console.log('- Margin:', accountInformation.margin);
      console.log('- Free Margin:', accountInformation.freeMargin);
      console.log('- Leverage:', accountInformation.leverage);
      console.log('- Broker:', accountInformation.broker);
    }
    
    // Get positions
    const positions = terminalState.positions || [];
    console.log('\n📊 Open positions:', positions.length);
    
    if (positions.length > 0) {
      positions.forEach((pos, i) => {
        console.log(`\nPosition ${i + 1}:`);
        console.log('- Symbol:', pos.symbol);
        console.log('- Type:', pos.type);
        console.log('- Volume:', pos.volume);
        console.log('- Profit:', pos.profit);
      });
    }
    
    // Close connection
    await connection.close();
    console.log('\n✅ Demo account is working correctly with MetaApi!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.details) {
      console.error('Details:', JSON.stringify(error.details, null, 2));
    }
  }
  
  process.exit(0);
}

testDemoAccount();