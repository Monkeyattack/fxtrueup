// Debug script to test account detail API endpoints
const http = require('http');
const url = require('url');

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8080,
            path: path,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                console.log();
                console.log();
                console.log(, res.headers);
                console.log(, data.substring(0, 500) + (data.length > 500 ? '...' : ''));
                resolve({status: res.statusCode, data: data});
            });
        });

        req.on('error', (e) => {
            console.error(, e.message);
            reject(e);
        });

        req.end();
    });
}

async function testAPI() {
    console.log('Testing FX TrueUp API endpoints...');
    
    // Test basic endpoints
    try {
        await makeRequest('/api/health');
        await makeRequest('/api/accounts');
        await makeRequest('/api/auth/me');
        await makeRequest('/api/accounts/d25b9ece-3422-43e8-a59b-cf85246beb3b');
        await makeRequest('/api/accounts/d25b9ece-3422-43e8-a59b-cf85246beb3b/deals');
    } catch (error) {
        console.error('API test failed:', error);
    }
}

testAPI();
