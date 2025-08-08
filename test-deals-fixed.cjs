require('dotenv').config();

async function testDeals() {
  try {
    console.log('🔍 Testing deal history for demo account...');
    
    const MetaApi = require('metaapi.cloud-sdk').default;
    const api = new MetaApi(process.env.METAAPI_TOKEN, { 
      region: 'new-york',
      domain: 'agiliumtrade.agiliumtrade.ai'
    });
    
    const accountId = 'd25b9ece-3422-43e8-a59b-cf85246beb3b';
    
    // Get account
    const account = await api.metatraderAccountApi.getAccount(accountId);
    console.log('Account state:', account.state);
    console.log('Connection status:', account.connectionStatus);
    
    // Get deals using streaming connection
    console.log('\n📊 Getting account history via streaming connection...');
    const connection = account.getStreamingConnection();
    await connection.connect();
    await connection.waitSynchronized();
    
    // Check terminal state for orders
    const terminalState = connection.terminalState;
    console.log('\nTerminal state keys:', Object.keys(terminalState));
    
    // Check if there are any orders in terminal state
    const orders = terminalState.orders || [];
    const positions = terminalState.positions || [];
    const historyOrders = terminalState.historyOrders || [];
    
    console.log('Current orders:', orders.length);
    console.log('Open positions:', positions.length);
    console.log('History orders:', Object.keys(historyOrders).length);
    
    // Try to get history using historyStorage
    const historyStorage = connection.historyStorage;
    if (historyStorage) {
      console.log('\nHistory storage available');
      const deals = historyStorage.deals || [];
      console.log('Deals in history:', deals.length);
      
      if (deals.length > 0) {
        console.log('\nFirst few deals:');
        deals.slice(0, 5).forEach((deal, i) => {
          console.log(`\nDeal ${i + 1}:`, deal);
        });
      }
    }
    
    // Also check account information
    const accountInfo = terminalState.accountInformation;
    if (accountInfo) {
      console.log('\nAccount info:');
      console.log('- Balance:', accountInfo.balance);
      console.log('- Equity:', accountInfo.equity);
      console.log('- Broker:', accountInfo.broker);
      console.log('- Server:', accountInfo.server);
    }
    
    await connection.close();
    
    console.log('\n💡 Note: Demo accounts often start with no trading history.');
    console.log('The mock data you see is a placeholder until real trades are made.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
  
  process.exit(0);
}

testDeals();