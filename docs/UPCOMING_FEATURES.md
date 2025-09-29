# Upcoming Features

## Trade Signal Submission to Meta-Trader-Hub

### Overview
When the fxtrueup router copies a trade, it will also submit the trade as a signal to meta-trader-hub's signal processing queue. This will allow the copied trades to be rated and analyzed by the meta-trader-hub system.

### Purpose
- Track performance metrics for all copied trades
- Analyze which source accounts perform best
- Get ratings and confidence scores for each trade
- Enable meta-trader-hub's ML analysis on copied trades

### Implementation Plan

#### 1. Create Signal Submission Service
- Create `/home/claude-dev/repos/fxtrueup/src/services/signalSubmitter.js`
- This will handle formatting and submitting trades to meta-trader-hub's Redis queue
- It will convert fxtrueup trade data to meta-trader-hub signal format

#### 2. Add Redis Configuration
- Update environment variables to include meta-trader-hub Redis connection
- Add configuration for signal submission (enabled/disabled flag)

#### 3. Update FilteredCopyTrader
- Modify `executeCopyTrade()` method in `filteredCopyTrader.js`
- After successful trade copy, call signal submission service
- Include source account info in the signal metadata

#### 4. Signal Format Mapping
The signal will be formatted as:
```javascript
{
  id: `fxtrueup_copy_${timestamp}`,
  symbol: trade.symbol,
  action: trade.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
  entry: currentPrice,
  stop_loss: stopLoss,
  take_profit: takeProfit,
  source: `fxtrueup_${sourceAccountNickname}`,
  metadata: {
    original_source: sourceAccountNickname,
    original_position_id: sourceTradeId,
    copy_multiplier: multiplier,
    destination_account: destAccountNickname
  },
  timestamp: new Date().toISOString()
}
```

#### 5. Queue Integration
- Submit to `signals:queue:pending` Redis queue
- Store signal details in Redis hash with appropriate key
- Handle errors gracefully (don't fail copy if signal submission fails)

### Benefits
- All copied trades will be tracked and rated in meta-trader-hub
- Performance metrics will be available per source account
- Enables analysis of which source accounts perform best
- Maintains separation of concerns (copy trading continues even if signal system is down)

### Configuration
Add these environment variables:
- `META_HUB_REDIS_HOST` (default: localhost)
- `META_HUB_REDIS_PORT` (default: 6379)
- `META_HUB_SIGNAL_SUBMISSION_ENABLED` (default: true)

### Testing Plan
1. Test signal format conversion
2. Test Redis connection to meta-trader-hub
3. Test end-to-end flow with a copied trade
4. Verify signal appears in meta-trader-hub dashboard
5. Test error handling when meta-hub is unavailable

### Implementation Status
- [ ] Create signal submission service
- [ ] Update environment configuration
- [ ] Integrate with FilteredCopyTrader
- [ ] Add error handling and logging
- [ ] Test integration
- [ ] Deploy to production

---
Last Updated: 2025-09-29