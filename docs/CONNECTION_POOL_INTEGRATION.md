# MetaAPI Connection Pool Integration

## Overview
FX True Up now uses the centralized MetaAPI connection pool from meta-trader-hub instead of creating direct MetaAPI connections. This provides better performance, connection reuse, and access to MetaStats for accurate metrics.

## Architecture

```
fxtrueup (Node.js)
    ↓
poolClient.js (HTTP Client)
    ↓
[HTTP API :8086]
    ↓
meta-trader-hub/connection_pool_api.py
    ↓
├── SimpleConnectionPool (MetaAPI connections)
└── MetaStatsClient (Trading metrics)
```

## Configuration

Add to your `.env` file:
```env
# Connection Pool API (meta-trader-hub)
POOL_API_URL=http://localhost:8086
```

For production deployment on VPS:
```env
POOL_API_URL=http://172.93.51.42:8086
```

## Usage

### Get Account Metrics (with MetaStats)
```javascript
import poolClient from './services/poolClient.js';

// Get comprehensive metrics from MetaStats
const metrics = await poolClient.getAccountMetrics(accountId);

// Returns:
{
  balance: 50000,
  equity: 51234,
  winRate: 65.5,
  profitFactor: 1.8,
  sharpeRatio: 1.2,
  maxDrawdownPercent: 8.5,
  // ... many more metrics
}
```

### Get Trade History
```javascript
// Get last 30 days of trades
const history = await poolClient.getTradeHistory(accountId, 30);

// Returns:
{
  trades: [...],
  count: 150,
  period_days: 30
}
```

### Get Daily Growth Chart
```javascript
// Get daily performance data
const growth = await poolClient.getDailyGrowth(accountId, 30);

// Returns daily balance/equity progression
```

### Get Risk Status
```javascript
// Check current risk metrics
const risk = await poolClient.getRiskStatus(accountId);

// Returns:
{
  daily_loss_percent: 2.5,
  open_positions: 3,
  risk_status: 'OK' // or 'WARNING', 'CRITICAL'
}
```

## Starting the Pool API

The connection pool API must be running for fxtrueup to access MetaAPI:

```bash
# In meta-trader-hub/backend directory
python connection_pool_api.py
```

The API will start on port 8086.

## Testing

Run the integration test:
```bash
node test-pool-integration.js
```

This will verify:
- Pool API connectivity
- Account information retrieval
- MetaStats metrics
- Trade history
- Risk status
- Daily growth data

## Benefits

1. **Connection Pooling**: Reuses connections instead of creating new ones
2. **MetaStats Integration**: Official, accurate trading metrics
3. **Better Performance**: Reduced connection overhead
4. **Centralized Management**: One service manages all MetaAPI complexity
5. **Shared Resources**: Multiple services can use the same pool

## API Endpoints Used

### From Connection Pool
- `GET /accounts/{id}/info` - Account information
- `GET /accounts/{id}/positions` - Open positions
- `POST /trade/execute` - Execute trades
- `GET /pool/stats` - Pool statistics

### From MetaStats (New)
- `GET /accounts/{id}/metrics` - Comprehensive metrics
- `GET /accounts/{id}/trades` - Trade history
- `GET /accounts/{id}/daily-growth` - Performance chart
- `GET /accounts/{id}/risk-status` - Risk assessment
- `GET /accounts/{id}/symbol-stats/{symbol}` - Per-symbol statistics

## Migration Notes

### Old Method (Direct Connection)
```javascript
// Previously in metaapi.js
const api = new MetaApi(token);
const account = await api.metatraderAccountApi.getAccount(accountId);
const connection = await account.getStreamingConnection();
// ... manual metric calculations
```

### New Method (Pool Client)
```javascript
// Now using poolClient
const metrics = await poolClient.getAccountMetrics(accountId);
// Metrics from MetaStats - no manual calculation needed
```

## Troubleshooting

### Pool API Not Running
```
Error: connect ECONNREFUSED 127.0.0.1:8086
```
**Solution**: Start the connection pool API in meta-trader-hub

### Invalid Account ID
```
Error: Account not found
```
**Solution**: Ensure the account is configured in meta-trader-hub

### MetaStats Not Available
```
Error: Metrics not available
```
**Solution**: MetaStats may need time to collect data for new accounts

## Future Enhancements

- WebSocket support for real-time updates
- Caching layer for frequently accessed data
- Multi-region support
- Load balancing across multiple pool instances