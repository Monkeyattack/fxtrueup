# Release Notes - v2.5.1: Orphan Notification Deduplication

**Release Date**: 2025-10-11
**Commit**: 3334d46

## Overview
This release fixes the orphaned position notification spam that was sending repeated Telegram alerts every 30 minutes for the same positions.

## Problem Solved
The orphan detection system was correctly identifying orphaned positions (destination positions without source mappings), but was sending **duplicate Telegram notifications every 30 minutes** with no deduplication tracking. This caused notification spam for positions that were already reported.

## Solution Implemented

### Redis-Based Deduplication (24h TTL)
Added intelligent notification tracking to prevent re-alerting about the same orphaned positions:

**New Redis Methods** (`redisManager.js`):
- `markOrphanNotified(accountId, positionId)` - Stores notification timestamp with 24-hour TTL
- `wasOrphanNotified(accountId, positionId)` - Checks if already notified within 24 hours

**Enhanced Orphan Scanner** (`orphanedPositionCleaner.js`):
- Before sending each Telegram alert, checks Redis for prior notifications
- Skips positions already notified within the last 24 hours
- Logs notification statistics (sent vs skipped counts)

## Behavior Changes

### Before
- 8 orphaned positions detected every 30 minutes
- 8 Telegram notifications sent every 30 minutes
- Result: **Notification spam** for the same positions

### After
- 8 orphaned positions detected every 30 minutes (detection unchanged)
- 8 Telegram notifications on **first detection only**
- 0 Telegram notifications for next 24 hours (duplicates skipped)
- Result: **Clean notification stream** with no spam

## Log Output Examples

**First Scan (notifications sent)**:
```
📬 Sent 8 new orphan alerts, skipped 0 duplicates
```

**Subsequent Scans (duplicates suppressed)**:
```
ℹ️ Skipping notification for 51930835 (already notified within 24h)
ℹ️ Skipping notification for 51937159 (already notified within 24h)
...
📬 Sent 0 new orphan alerts, skipped 8 duplicates
```

## Technical Details

### Redis Key Pattern
```
orphan:notified:{accountId}:{positionId}
```

### TTL Strategy
- **24-hour expiration**: Ensures fresh alerts if positions remain orphaned
- **Automatic cleanup**: Redis TTL handles memory management
- **Position-specific tracking**: Each orphan tracked independently

### Edge Cases Handled
- New orphans are always notified immediately
- Re-notifications occur after 24h if position still orphaned
- Closed positions automatically stop generating alerts
- No risk of missing genuinely new orphaned positions

## Files Modified

1. **src/services/redisManager.js**
   - Added `markOrphanNotified()` method
   - Added `wasOrphanNotified()` method
   - 24-hour TTL for notification tracking

2. **src/utils/orphanedPositionCleaner.js**
   - Imported redisManager
   - Added deduplication check before sending notifications
   - Enhanced logging with notification statistics

## Deployment

**Automatic Deployment**:
- ✅ Changes committed to master branch
- ✅ PM2 service restarted automatically
- ✅ Live since 2025-10-11 17:03 UTC

**Verification**:
```bash
pm2 logs fxtrueup-router --lines 50 | grep "orphan"
```

## Impact

### User Experience
- ✅ **Eliminated notification spam** - No more repeated alerts
- ✅ **Actionable alerts only** - First-time notifications remain immediate
- ✅ **24h refresh cycle** - Persistent orphans get re-alerted daily

### System Performance
- ✅ **Minimal overhead** - Simple Redis existence checks
- ✅ **Automatic cleanup** - TTL handles memory management
- ✅ **No breaking changes** - Fully backward compatible

### Monitoring
- ✅ **Clear log visibility** - Sent vs skipped counts logged
- ✅ **Redis inspection available** - `redis-cli keys "orphan:notified:*"`

## Known Orphaned Positions
The following positions are currently orphaned and will stop generating notifications:

**Account b90a1029** (3 positions):
- XAUUSD #51930835 (opened 2025-10-10 16:37)
- XAUUSD #51937159 (opened 2025-10-10 18:34)
- XAUUSD #51942330 (opened 2025-10-10 20:17)

**Account bb106d21** (5 positions):
- XAUUSD #72180577 (opened 2025-10-08 17:28)
- XAUUSD #72188696 (opened 2025-10-08 18:15)
- XAUUSD #72538157 (opened 2025-10-10 09:53)
- XAUUSD #72665920 (opened 2025-10-10 18:34)
- XAUUSD #72675192 (opened 2025-10-10 19:59)

**Note**: These positions still need manual review/closure. Use:
- `/closeOrphan <positionId>` - Close via Telegram bot
- `scripts/close-orphans.js` - Bulk closure script

## Future Enhancements
Potential improvements for consideration:
- Configurable TTL per account type (FTMO vs demo)
- Orphan severity levels (age-based escalation)
- Auto-close orphans older than X days
- Weekly orphan summary digest

## Testing
✅ Verified deduplication logic on live system
✅ Confirmed 24h TTL working correctly
✅ Validated notification skip logging
✅ Checked Redis key creation/expiration

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
