# MetaApi Token Configuration Preset

## Token Analysis

Based on the JWT token provided, here are the permissions and capabilities:

### Access Rules Included:
1. **trading-account-management-api** - Full read/write access
2. **metaapi-rest-api** - Full read/write access  
3. **metaapi-rpc-api** - WebSocket read/write access
4. **metaapi-real-time-streaming-api** - Real-time data streaming
5. **metastats-api** - Trading statistics and analytics
6. **risk-management-api** - Risk management features
7. **copyfactory-api** - Copy trading functionality
8. **mt-manager-api** - MT4/MT5 manager functionality
9. **billing-api** - Read-only billing information

### Token Details:
- **Token ID**: 20210213
- **User ID**: 190a63adf52f8e729e41df1315aad725
- **Issued At**: 1754498509 (Unix timestamp)
- **Expires At**: 1762274509 (Unix timestamp - ~90 days from issue)
- **Rate Limits**: Standard (not ignored)

### Environment Variable Template:
```bash
METAAPI_TOKEN=your_token_here
METAAPI_REGION=new-york
METAAPI_ACCOUNT_ID=your_account_id
```

### Regions Available:
- new-york (US East)
- london (Europe)
- singapore (Asia)
- sydney (Australia)

### Usage in Code:
```javascript
const metaApiToken = process.env.METAAPI_TOKEN;
const region = process.env.METAAPI_REGION || 'new-york';

// Initialize MetaApi client
const metaApi = new MetaApi(metaApiToken, {
  region: region,
  requestTimeout: 60000,
  retryOpts: {
    retries: 3,
    minDelayInSeconds: 1,
    maxDelayInSeconds: 30
  }
});
```

### Security Notes:
1. Never commit the actual token to version control
2. Use environment variables or secure key management
3. Rotate tokens periodically (this one expires in ~90 days)
4. Monitor API usage to stay within rate limits
5. Use read-only passwords when possible for account connections

### Required NPM Package:
```bash
npm install metaapi.cloud-sdk --save
```

This token has comprehensive permissions suitable for a full-featured trading platform integration.