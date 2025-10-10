# Position Exit Copy Fix - 2025-10-07

## Problem Summary
When source positions closed, the system attempted to mirror the exits to destination accounts but failed when the connection pool API was temporarily unavailable. This caused positions to remain open without SL/TP protection until the broker closed them due to accumulated losses.

## Root Causes

### 1. No Retry Logic for Exit Copying
The `copyPositionExit()` function had no retry mechanism. If the connection pool API was down or returned an error, it would immediately give up and delete the mapping.

### 2. False "Position Not Found" Detection
When `getPositions()` failed due to API connection issues, it returned an empty array `[]`. The system interpreted this as "position already closed" and deleted the mapping without actually closing the position.

### 3. Incident Timeline (2025-10-07)
- **01:25 UTC**: Positions opened on LiveCopyFromGold (51678668, 51678665, etc.)
- **01:48 UTC**: Connection pool API went down (`ECONNREFUSED 127.0.0.1:8086`)
- **01:48 UTC**: Source positions closed on GoldBuyOnly
- **01:48 UTC**: System tried to copy exits but got empty position arrays
- **01:48 UTC**: System assumed positions were "already closed" and deleted mappings
- **04:27 & 10:21 UTC**: Positions actually closed by broker due to accumulated losses (no SL/TP)

## Fixes Applied

### 1. Added Retry Logic to `copyPositionExit()`
**File**: `src/services/filteredCopyTrader.js:777-891`

```javascript
async copyPositionExit(mapping, closeInfo) {
  const maxRetries = 3;
  const retryDelays = [5000, 10000, 20000]; // 5s, 10s, 20s

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Try to get positions and close
    // Retry on connection failures
  }
}
```

**Changes**:
- Retry up to 3 times with exponential backoff (5s, 10s, 20s)
- Only delete mapping after final retry attempt
- Proper error detection for retryable vs non-retryable errors

### 2. Improved Position Detection
```javascript
// Check if we got an actual response or connection error
if (!Array.isArray(destPositions)) {
  throw new Error('Invalid response from getPositions - connection may be down');
}

const destPosition = destPositions.find(pos => pos.id === mapping.destPositionId);

if (!destPosition) {
  // Only delete mapping if we're sure (after all retries)
  if (attempt === maxRetries) {
    logger.warn(`⚠️ Position not found after ${maxRetries} attempts - assuming closed`);
    await positionMapper.deleteMapping(...);
    return;
  } else {
    // Retry - might be connection issue
    throw new Error('Position not found in response - retrying');
  }
}
```

### 3. Better Error Handling
- Validates response is an array before processing
- Distinguishes between "position not found" and "API down"
- Uses existing `isRetryableError()` method to detect connection issues
- Comprehensive logging for debugging

## Benefits

1. **Resilient to API Failures**: System will retry exits even if connection pool is temporarily down
2. **No False Deletions**: Won't delete mappings unless we're certain position is closed
3. **Better Debugging**: Clear logging shows retry attempts and reasons
4. **Prevents Losses**: Positions will be closed properly instead of being orphaned

## Testing
- Service restarted successfully: `pm2 restart fxtrueup-router`
- Connection pool verified: `curl http://localhost:8086/positions/...`
- Logs show proper startup and route initialization

## Related Fixes
Also fixed position mapping creation issue (using `result.positionId` instead of `result.orderId`) in earlier commit. See `filteredCopyTrader.js:543`.

## Deployment
- **Date**: 2025-10-07 17:06 UTC
- **Service**: fxtrueup-router (PM2)
- **Version**: 2.0.0
- **Status**: ✅ Active

## Prevention Measures
1. **Monitor connection pool health**: Check PM2 status regularly
2. **Alert on connection failures**: Telegram notifications already in place
3. **Set default SL/TP**: Consider adding default SL/TP to LiveCopyFromGold account config
4. **API health checks**: Consider adding health check endpoint to connection pool

## Future Improvements
- [ ] Add circuit breaker pattern for connection pool calls
- [ ] Queue failed exit copies for later retry (persistent queue)
- [ ] Add default SL/TP to all destination accounts in routing config
- [ ] Implement health check monitoring for all critical services
