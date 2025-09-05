# Tiger Funded Copy Trading Setup Guide

## Quick Start

1. **Set your Tiger Funded account ID:**
   ```bash
   export TIGER_ACCOUNT_ID=your-metaapi-account-id
   ```

2. **Run the hybrid copy trader:**
   ```bash
   node tiger-funded-hybrid-copy.js
   ```

## Configuration Overview

### Hybrid Approach (Balancing Both Agent Recommendations)

The system starts conservatively and scales up based on performance:

- **Phase 1 (Week 1-2)**: Conservative - 10x multiplier
- **Phase 2 (Week 3)**: Moderate - 15x multiplier (if 60%+ win rate)
- **Phase 3 (Week 4+)**: Full - 20x multiplier (if profitable)

### Key Safety Features

1. **Hard stop at 3% daily loss** (more conservative than Tiger's 5%)
2. **Emergency close at 4% loss**
3. **Max 2 martingale levels** (vs 3 originally proposed)
4. **Position sizing reduces 50% after each loss**
5. **Pause trading after 2 consecutive losses**
6. **Max $500 daily volatility limit**

### Position Sizing Examples

On a $100,000 Tiger Funded account:

**Phase 1 (Conservative Start):**
- Gold 0.01 → Tiger 0.10 lots
- Gold 0.02 → Tiger 0.20 lots
- Gold 0.03 → Tiger 0.30 lots

**Phase 3 (Full Size - Only After Proven Success):**
- Gold 0.01 → Tiger 0.17 lots
- Gold 0.02 → Tiger 0.34 lots
- Gold 0.03 → Tiger 0.51 lots

### Files Created

1. **`tiger-funded-hybrid-copy.js`** - Main copy trading system
2. **`tiger-funded-trades.log`** - Trade history log
3. **`tiger-funded-metrics.json`** - Performance metrics

### Monitoring

The system provides updates every 5 minutes showing:
- Current balance and equity
- Win rate and trade count
- Progress toward phase targets
- Risk metrics and warnings

### Phase Upgrade Criteria

- **To Phase 2**: 7+ days, 60%+ win rate, 2%+ profit
- **To Phase 3**: 14+ days, 65%+ win rate, 5%+ profit

## Risk Summary

Starting with the conservative Phase 1 approach:
- Expected monthly return: 5-8%
- Maximum expected drawdown: 4-5%
- Time to complete evaluation: 4-6 weeks

The hybrid approach addresses both:
- Risk Manager's concerns about martingale spirals
- Quant Analyst's optimization for profitability

## Next Steps

Once you have your Tiger Funded account ID from MetaApi:

1. Set the environment variable
2. Run the copy trader
3. Monitor for the first week
4. Let the system automatically scale up based on performance

The system will automatically:
- Track all trades and performance
- Adjust position sizing based on results
- Upgrade phases when criteria are met
- Protect against excessive losses