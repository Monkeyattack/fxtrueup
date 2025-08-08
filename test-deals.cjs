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
    
    // Get deals using RPC connection
    console.log('\n📊 Getting trading history...');
    const connection = account.getRPCConnection();
    await connection.connect();
    
    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    console.log('Date range:', startDate.toISOString(), 'to', endDate.toISOString());
    
    const deals = await connection.getHistoryOrdersByTimeRange(startDate, endDate);
    
    console.log('\nTotal orders found:', deals.length);
    
    // Filter for actual deals (not pending orders)
    const actualDeals = deals.filter(deal => 
      deal.type === 'ORDER_TYPE_BUY' || 
      deal.type === 'ORDER_TYPE_SELL' ||
      deal.type === 'DEAL_TYPE_BUY' || 
      deal.type === 'DEAL_TYPE_SELL'
    );
    
    console.log('Actual deals:', actualDeals.length);
    
    if (actualDeals.length > 0) {
      console.log('\nFirst few deals:');
      actualDeals.slice(0, 5).forEach((deal, i) => {
        console.log(`\nDeal ${i + 1}:`);
        console.log('- Time:', deal.time || deal.doneTime);
        console.log('- Symbol:', deal.symbol);
        console.log('- Type:', deal.type);
        console.log('- Volume:', deal.volume);
        console.log('- Price:', deal.price || deal.openPrice);
        console.log('- Profit:', deal.profit);
      });
    } else {
      console.log('\nNo deals found in the last 30 days.');
      console.log('This could be because:');
      console.log('1. The account is new or demo with no trading history');
      console.log('2. No trades were executed in the last 30 days');
    }
    
    await connection.close();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.details) {
      console.error('Details:', JSON.stringify(error.details, null, 2));
    }
  }
  
  process.exit(0);
}

testDeals();