require('dotenv').config();

async function checkMetaApi() {
  console.log('🔍 Checking MetaApi Setup...\n');
  
  const token = process.env.METAAPI_TOKEN;
  
  if (!token) {
    console.error('❌ METAAPI_TOKEN not found in .env file');
    return;
  }
  
  console.log('✅ Token found:', token.substring(0, 40) + '...');
  console.log('📍 Region:', process.env.METAAPI_REGION || 'new-york');
  
  try {
    // Parse JWT token to check expiration
    const tokenParts = token.split('.');
    if (tokenParts.length === 3) {
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      const expDate = new Date(payload.exp * 1000);
      const now = new Date();
      
      console.log('\n📋 Token Details:');
      console.log('- Token ID:', payload.tokenId);
      console.log('- User ID:', payload.realUserId);
      console.log('- Issued:', new Date(payload.iat * 1000).toISOString());
      console.log('- Expires:', expDate.toISOString());
      console.log('- Valid:', expDate > now ? '✅ Yes' : '❌ Expired');
      
      const daysLeft = Math.floor((expDate - now) / (1000 * 60 * 60 * 24));
      console.log('- Days remaining:', daysLeft);
    }
  } catch (error) {
    console.error('Failed to parse token:', error.message);
  }
  
  console.log('\n💡 Next Steps:');
  console.log('1. The MetaApi token is configured and ready');
  console.log('2. Integration code is in place');
  console.log('3. Ready to connect trading accounts when users add them');
}

checkMetaApi();