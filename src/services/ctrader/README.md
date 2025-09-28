# cTrader Integration Backend

This directory contains the complete cTrader backend implementation for fxtrueup, designed to work alongside the existing MetaAPI integration without disrupting the running system.

## Architecture Overview

The cTrader integration follows the same architecture as the MetaAPI implementation:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Unified Pool    │────▶│ cTrader Pool     │────▶│ Python Pool API │
│ Client          │     │ Client (JS)      │     │ (FastAPI:8088)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                           │
                                                           ▼
                                                  ┌─────────────────┐
                                                  │ cTrader Open    │
                                                  │ API (TCP:5035)  │
                                                  └─────────────────┘
```

## Components

### JavaScript/Node.js Components

1. **auth.js** - OAuth2 authentication and JWT token management
2. **ctraderPoolClient.js** - Main client interface (mirrors poolClient.js API)
3. **ctraderConnection.js** - Individual connection wrapper
4. **dataMapper.js** - Converts between cTrader and MetaAPI formats
5. **streamingHandler.js** - Real-time data and event management
6. **../unifiedPoolClient.js** - Platform-agnostic interface

### Python Components

1. **ctrader_pool_api.py** - FastAPI service (port 8088)
2. **services/ctrader_connection_pool.py** - Connection pooling logic
3. **services/ctrader_data_mapper.py** - Python data format conversion

### Configuration

1. **config/symbols.json** - Symbol mapping between MT5 and cTrader
2. **config/demo.json** - Demo account configuration
3. **config/routing-config.json** - Account routing configuration

## Setup Instructions

### Prerequisites

1. Python 3.8+ with pip
2. Node.js 16+
3. HashiCorp Vault (for credentials)
4. Redis (for session management)

### Python Dependencies

```bash
cd src/services/ctrader
pip install -r requirements.txt
```

### Environment Variables

```bash
# cTrader OAuth2 (store in Vault)
CTRADER_CLIENT_ID=your_client_id
CTRADER_CLIENT_SECRET=your_client_secret
CTRADER_REDIRECT_URI=http://localhost:8080/api/ctrader/callback

# Test account
CTRADER_TEST_ACCOUNT=12345
CTRADER_ENV=demo

# Python pool service
CTRADER_POOL_PORT=8088
```

### Vault Configuration

Add cTrader credentials to Vault:

```bash
# OAuth2 credentials
vault kv put secret/ctrader/oauth \
    client_id="your_client_id" \
    client_secret="your_client_secret" \
    redirect_uri="http://localhost:8080/api/ctrader/callback"

# Account tokens (added after OAuth flow)
vault kv put secret/ctrader/accounts/12345 \
    access_token="jwt_token" \
    refresh_token="refresh_token" \
    expires_at="2024-12-31T23:59:59Z"
```

## Running the Services

### 1. Start Python Pool Service

```bash
cd src/services/ctrader
python3 ctrader_pool_api.py
# Service runs on http://localhost:8088
```

### 2. Configure Account Routing

Edit `src/config/routing-config.json`:

```json
{
  "accounts": {
    "your-metaapi-account": {
      "platform": "metaapi",
      "region": "new-york"
    },
    "12345": {
      "platform": "ctrader",
      "environment": "demo"
    }
  }
}
```

### 3. Use Unified Client

```javascript
import unifiedPoolClient from './services/unifiedPoolClient.js';

// Works with both MetaAPI and cTrader accounts
const accountInfo = await unifiedPoolClient.getAccountInfo('12345');
const positions = await unifiedPoolClient.getPositions('12345');
```

## Testing

### Run All Tests

```bash
cd src/services/ctrader/test
./run-all-tests.sh
```

### Individual Tests

```bash
# Test data mapping (no external deps)
node test-data-mapper.js

# Test Python pool service
./test-python-pool.sh

# Test authentication (requires cTrader creds)
node test-auth.js

# Test pool client (requires running Python service)
node test-pool.js

# Test streaming (requires running services)
node test-streaming.js

# Test unified interface
node test-unified.js
```

## API Compatibility

The cTrader integration maintains 100% API compatibility with the existing MetaAPI pool client:

| Method | MetaAPI | cTrader | Notes |
|--------|---------|---------|-------|
| getAccountInfo | ✅ | ✅ | Same response format |
| getPositions | ✅ | ✅ | Converted to MetaAPI format |
| executeTrade | ✅ | ✅ | Same parameters |
| modifyPosition | ✅ | ✅ | SL/TP modifications |
| closePosition | ✅ | ✅ | Close by position ID |
| subscribeToSymbol | ✅ | ✅ | Real-time prices |
| getPrice | ✅ | ✅ | Current bid/ask |
| initializeStreaming | ✅ | ✅ | WebSocket setup |

## Platform-Specific Features

### cTrader Only
- `getPendingOrders()` - Separate pending orders endpoint
- `placeLimitOrder()` - Direct limit order placement
- `cancelOrder()` - Cancel pending orders

### MetaAPI Only
- Magic numbers for trade labeling
- Investor password support

## Symbol Mapping

The system automatically maps between MT5 and cTrader symbols:

| MT5 Symbol | cTrader Symbol | cTrader ID |
|------------|----------------|------------|
| EURUSD | EUR/USD | 1 |
| GBPUSD | GBP/USD | 2 |
| XAUUSD | GOLD | 22 |
| BTCUSD | Bitcoin | 100 |

## Error Handling

The integration includes comprehensive error handling:

1. **Authentication Errors** - Token refresh, OAuth2 flow
2. **Connection Errors** - Retry logic with exponential backoff
3. **Trading Errors** - Detailed error messages from cTrader
4. **Data Errors** - Graceful fallbacks for missing data

## Monitoring

### Pool Statistics

```bash
curl http://localhost:8088/pool/stats
```

### Health Check

```bash
curl http://localhost:8088/health
```

## Deployment (Phase 2)

1. Deploy Python service with PM2:
   ```bash
   pm2 start ecosystem.ctrader.config.js
   ```

2. Update NGINX to proxy `/api/ctrader/*` to port 8088

3. Add cTrader accounts to routing configuration

4. Monitor logs:
   ```bash
   pm2 logs ctrader-pool
   ```

## Security Considerations

1. All credentials stored in Vault
2. JWT tokens auto-refresh before expiry
3. Read-only access for reporting accounts
4. SSL/TLS for all API communications
5. Rate limiting on pool endpoints

## Troubleshooting

### Common Issues

1. **"Pool service not running"**
   - Start the Python service: `python3 ctrader_pool_api.py`

2. **"Authentication failed"**
   - Check Vault for valid OAuth2 credentials
   - Verify redirect URI matches configuration

3. **"Symbol not found"**
   - Check symbols.json for mapping
   - Verify symbol format (MT5 vs cTrader)

4. **"Connection timeout"**
   - Check cTrader API server status
   - Verify network connectivity to TCP port 5035

## Next Steps

1. Complete OAuth2 flow with real cTrader credentials
2. Add production account configurations to Vault
3. Deploy Python service to VPS
4. Update frontend to support platform selection
5. Add cTrader-specific reporting features