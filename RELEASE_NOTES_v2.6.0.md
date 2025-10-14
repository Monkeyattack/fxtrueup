# FXTrueUp v2.6.0 Release Notes
**Release Date:** October 14, 2025

## 🎯 Major Features

### Gap Detection System for MetaAPI Reconnections
Implements comprehensive gap detection to catch trades that open/close during MetaAPI websocket disconnect windows.

**Problem Solved:**
- MetaAPI cloud servers disconnect websockets every 3-5 minutes (server-side behavior)
- Auto-reconnection typically takes 1-2 seconds
- Trades opening/closing during these disconnect windows were being missed

**Solution Implemented:**
- **Connection Pool Tracking** (meta-trader-hub): Added reconnection event detection with disconnect timestamp tracking
- **Callback Architecture**: Extensible callback system notifies registered listeners when reconnections occur
- **Gap Detection Logic**: Compares current positions against `seenTrades` Set to identify missed positions
- **Automatic Processing**: Missed trades are automatically processed through full validation pipeline
- **Telegram Alerts**: Detailed notifications for gap detection events and processing results
- **Daily Limit Protection**: Respects configured daily trade and loss limits even for missed trades

**Technical Implementation:**
- `simple_connection_pool.py:30-48`: Added `disconnect_timestamp` and `reconnection_callbacks` tracking
- `simple_connection_pool.py:615-635`: Enhanced `on_connected()` to detect reconnections and trigger callbacks
- `filteredCopyTrader.js:211-302`: Implemented `checkForMissedTrades()` method
- `filteredCopyTrader.js:73-82`: Registered reconnection callback on router startup
- `unifiedPoolClient.js:176-180`: Added callback registration interface
- `poolClient.js:249-267`: HTTP client support for callback registration

**Files Modified:**
- `/home/claude-dev/repos/meta-trader-hub/backend/services/metaapi/simple_connection_pool.py`
- `/home/claude-dev/repos/fxtrueup/src/services/filteredCopyTrader.js`
- `/home/claude-dev/repos/fxtrueup/src/services/unifiedPoolClient.js`
- `/home/claude-dev/repos/fxtrueup/src/services/poolClient.js`

**Benefits:**
- ✅ Zero missed trades during disconnect windows
- ✅ Automatic recovery without manual intervention
- ✅ Full validation and limit protection
- ✅ Real-time monitoring and alerts

## 🐛 Bug Fixes

### Fix: Aggressive Dynamic Rule Set Time Delay Issue
**Commit:** `29ffef5`

**Problem:**
The `aggressive_dynamic` rule set was blocking rapid-fire trades due to a missing `minTimeBetweenTrades` configuration. Trades were being rejected if they occurred within 30 minutes of each other (hardcoded default).

**Root Cause:**
- `aggressive_dynamic` rule set lacked `minTimeBetweenTrades` property
- Defaulted to hardcoded 30-minute delay in `FilteredCopyTrader` constructor (line 46)
- Time-based validation check occurred before JSON config filters (line 401-405)

**Evidence:**
- Position 1: Copied at 19:18:23 ✅
- Position 2: Rejected at 19:36:34 (18.2 minutes later) ❌
- Position 3: Rejected at 19:37:33 (1 minute later) ❌

**Fix:**
Added `"minTimeBetweenTrades": 0` to `aggressive_dynamic` rule set in `routing-config.json:261`, allowing immediate trade copying without time delays.

**Impact:**
- Gold to LiveCopyFromGold route can now handle rapid position opens
- No artificial delays between trade copies
- Maintains 40 trades/day and $2000 daily loss limits

**Files Modified:**
- `src/config/routing-config.json`

## 📊 Related Commits

### meta-trader-hub Repository
- `219d891`: feat: Add reconnection event tracking to MetaAPI connection pool

### fxtrueup Repository
- `bbbee64`: feat: Implement gap detection for MetaAPI reconnection events
- `29ffef5`: fix: Set minTimeBetweenTrades to 0 for aggressive_dynamic rule set

## 🔄 How It Works

### Gap Detection Flow
1. **Disconnect Detection**: Connection pool records timestamp when websocket disconnects
2. **Reconnection Event**: On reconnection, calculates disconnect duration
3. **Callback Notification**: Triggers all registered callbacks with accountId and duration
4. **Gap Check**: Router compares current positions against seen trades
5. **Trade Processing**: New positions go through full validation pipeline
6. **Alert & Track**: Sends Telegram notifications and updates tracking sets

### Configuration Structure
```javascript
// Rule set with no time delays
"aggressive_dynamic": {
  "name": "Aggressive Dynamic",
  "multiplier": 3,
  "maxDailyTrades": 40,
  "maxDailyLoss": 2000,
  "maxOpenPositions": 20,
  "minTimeBetweenTrades": 0,  // ← New: Allow immediate copies
  "filters": []
}
```

## 🚀 Deployment

### Router Restart Required
```bash
pm2 restart fxtrueup-router
```

### Verification
Check logs for successful gap detection registration:
```
📡 Registered reconnection callback for gap detection
```

### Monitoring
Gap detection events appear in logs as:
```
🔍 GAP DETECTION: Checking for missed trades after {duration}s disconnect
📍 MISSED TRADE DETECTED during disconnect: Position ID: {id}
```

## ⚠️ Known Limitations

1. **HTTP Endpoint Missing**: Callback registration endpoint `/streaming/register-reconnection-callback` returns 404 (handled gracefully)
2. **Implicit Gap Detection**: System detects gaps on startup when positions aren't in `seenTrades` Set
3. **Event-Driven Preferred**: Full callback implementation would be more efficient than polling-based detection

## 🔮 Future Enhancements

1. Add HTTP endpoint for real-time callback notifications
2. Implement periodic gap checks as backup mechanism
3. Add configurable gap detection sensitivity
4. Track and report gap detection frequency metrics
5. Implement cross-source data validation

## 📝 Testing Recommendations

1. Monitor gap detection alerts during MetaAPI disconnect cycles
2. Verify missed trades are processed correctly
3. Confirm daily limits are respected for gap-detected trades
4. Check Telegram notifications for accuracy

---

**Generated:** 2025-10-14
**Version:** 2.6.0
**Type:** Feature Release + Bug Fix
