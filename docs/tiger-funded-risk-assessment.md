# Tiger Funded Copy Trading Risk Assessment Report

Generated: 2025-09-04T19:12:25.730Z

## Executive Summary

**Verdict: DO NOT PROCEED**
- Confidence Level: HIGH
- Rationale: 23.29% survival rate is too low. Strategy has unacceptable risk for Tiger Funded.

## Risk Score: 26.1/100 (EXTREME)

NOT recommended - unacceptable risk level

### Risk Score Breakdown
- **Survival Rate**: 24.30% (Penalty: -37.9 points)
- **Daily Loss Margin**: 5.8% (Penalty: -13.3 points)
- **Martingale Usage**: 51.8% (Penalty: -10.4 points)
- **Phase 1 Success Rate**: 7.60% (Penalty: -12.5 points)


## 1. Strategy Overview

### Source Account Performance
- Balance: $5000
- Total Return: 25.9% over 3 months
- Monthly Average: 8.63%
- Win Rate: 74.6%
- Martingale Usage: 51.8%

### Tiger Funded Requirements
- Max Daily Loss: 5%
- Max Total Drawdown: 12%
- Phase 1 Target: 8%
- Phase 2 Target: 5%
- Evaluation Period: 30 days

## 2. Proposed Risk Settings

```
Tiger Lot = Gold Lot × (Tiger Balance / 5000) × 0.65
```

- Scaling Factor: 0.65
- Max Single Position: 2 lots
- Max Total Exposure: 5 lots
- Max Martingale Levels: 3
- Daily Loss Stop: 4.5%
- Emergency Stop: 8%

## 3. Risk Analysis

### R-Multiple Analysis
- 1R (1% risk): $1000.00
- Scaled Largest Loss: $1131.13 (1.13R)
- Scaled Martingale Sequence: $4710.03 (4.71R)
- Daily Loss Safety Margin: 5.8%
- Total Drawdown Safety Margin: 60.7%

### Expectancy Calculation
- Win Probability: 74.6%
- Average Win (scaled): $304.85
- Average Loss (scaled): $413.14
- **Expectancy per Trade: $122.48**
- Trades for Phase 1: 66
- Estimated Days to Phase 1: 31
- Within Evaluation Period: ❌ No

## 4. Monte Carlo Simulation Results (10,000 runs)

### Success Metrics
- **Survival Rate: 23.29%**
- **Phase 1 Pass Rate: 5.26%**
- Account Bust Rate: 76.71%
- Daily Limit Hit Rate: 69.28%

### Performance Statistics
- Survivors Average Profit: $649.15 (0.65%)
- Average Max Drawdown: $5997.04 (6.00%)
- Worst Drawdown: $-16891.96
- Best Profit: $21926.31

## 5. Stress Test Results

| Scenario | Loss | % of Account | Survives |
|----------|------|--------------|----------|
| Worst Historical Day Repeated | $4710.03 | 4.71% | ✅ |
| Multiple Martingale Failures | $7065.05 | 7.07% | ❌ |
| 10 Consecutive Losses | $4131.40 | 4.13% | ✅ |
| Maximum Positions All Lose | $9502.22 | 9.50% | ❌ |
| Black Swan Event | $10000.00 | 10.00% | ✅ |

## 6. Critical Warnings

### ⚠️ Timeline Risk [MEDIUM]
**Phase 1 may take 31 days, close to 30-day limit**
- Impact: Risk of failing evaluation due to time constraints

### ⚠️ Daily Loss Risk [HIGH]
**Only 5.8% safety margin for daily loss**
- Impact: High risk of breaching 5% daily loss limit

### ⚠️ Martingale Risk [HIGH]
**52% of source trades use martingale - high risk strategy**
- Impact: Single bad sequence could blow the account

### ⚠️ Scalability Risk [MEDIUM]
**Strategy uses up to 23 concurrent positions**
- Impact: May hit broker position limits or margin requirements

## 7. Recommendations

### 🔴 Critical Priority

**Risk Limits**: Set hard stop at 4.5% daily loss
- *Reason: Provides 0.5% buffer before Tiger's 5% daily limit*

### 🟠 High Priority

**Position Sizing**: Consider reducing scaling factor to 0.5 or lower
- *Reason: Current scaling factor of 0.65 may be too aggressive for martingale strategies*

**Martingale Control**: Limit martingale to 3 levels maximum
- *Reason: Each additional level exponentially increases risk*

**Martingale Control**: Skip martingale sequences near daily calculation time (7-9 PM EST)
- *Reason: Avoid having open martingale sequences during daily loss calculation*

**Monitoring**: Set up real-time drawdown alerts at 2%, 3%, and 4% levels
- *Reason: Early warning system to prevent limit breaches*

### 🟡 Medium Priority

**Position Sizing**: Implement dynamic position sizing based on daily P&L
- *Reason: Reduce position size by 50% after any loss exceeding 2% of balance*

**Risk Limits**: Implement time-based stops for martingale sequences
- *Reason: Close all martingale positions if not recovered within 4 hours*

**Monitoring**: Track correlation between Gold positions and market volatility
- *Reason: Gold martingale strategies perform poorly in high volatility*

## 8. Implementation Checklist

If proceeding with this strategy, implement these controls:

- [ ] Set scaling factor to 0.65 or lower
- [ ] Configure max single position limit: 2 lots
- [ ] Configure max total exposure limit: 5 lots
- [ ] Implement 4.5% daily loss stop
- [ ] Set up 8% total drawdown stop
- [ ] Limit martingale to 3 levels
- [ ] Configure real-time monitoring alerts at 2%, 3%, and 4% drawdown
- [ ] Implement time-based stops for martingale sequences (4 hours max)
- [ ] Set up position reduction after 2% daily loss
- [ ] Avoid martingale sequences 7-9 PM EST (near daily calculation)
- [ ] Monitor correlation with gold volatility indices
- [ ] Set up automated emergency stop system
- [ ] Test all risk controls in demo first

## 9. Monitoring Dashboard Requirements

Create a real-time dashboard tracking:
- Current daily P&L and distance to 5% limit
- Current drawdown and distance to 12% limit
- Number of open positions and total exposure
- Active martingale sequences and their levels
- Time since last martingale recovery
- Win rate (rolling 20 trades)
- R-multiple performance tracking
- Correlation with VIX and gold volatility

---

*Report generated: 9/4/2025, 7:12:25 PM*
