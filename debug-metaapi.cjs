require('dotenv').config();

async function debugMetaApi() {
  try {
    console.log('🔍 Debugging MetaApi structure...');
    
    const MetaApi = require('metaapi.cloud-sdk').default;
    console.log('MetaApi constructor:', typeof MetaApi);
    
    const api = new MetaApi(process.env.METAAPI_TOKEN, { region: 'new-york' });
    console.log('API instance created');
    console.log('API properties:', Object.keys(api));
    
    if (api.provisioningProfileApi) {
      console.log('provisioningProfileApi methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(api.provisioningProfileApi)));
    } else {
      console.log('❌ provisioningProfileApi not found');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugMetaApi();
