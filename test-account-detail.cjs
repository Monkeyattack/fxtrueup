const https = require('https');
const fs = require('fs');

// Read the first token from tokens.json
const tokens = JSON.parse(fs.readFileSync('/var/www/fxtrueup/tokens.json', 'utf8'));
const token = Object.keys(tokens)[0];

if (!token) {
  console.error('No token found');
  process.exit(1);
}

console.log('Using token:', token.substring(0, 10) + '...');

// Test the account detail endpoint
const options = {
  hostname: 'fxtrueup.com',
  path: '/api/accounts/1754522018780',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('\nResponse:');
      console.log(JSON.stringify(json, null, 2));
      
      if (json.balance !== undefined) {
        console.log('\n✅ Account data loaded successfully!');
        console.log('- Balance:', json.balance);
        console.log('- Equity:', json.equity);
        console.log('- Data Source:', json.dataSource);
      }
    } catch (e) {
      console.error('Failed to parse response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request failed:', e);
});

req.end();