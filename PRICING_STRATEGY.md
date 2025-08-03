# FX True Up Pricing Strategy

## Pricing Tiers with Annual Discounts

### Monthly Plans

| Plan | Monthly | Accounts | Features | MetaApi Cost* | Margin |
|------|---------|----------|----------|---------------|---------|
| **BYO** | $5 | Unlimited** | MyFxBook API only, Reports, Public sharing | $0 | 100% |
| **Starter** | $15 | 1 | Direct MT4/5, Full analytics | ~$2.16 | 86% |
| **Trader** | $35 | 3 | + Comparisons, Tags | ~$6.48 | 81% |
| **Pro** | $75 | 10 | + API access, Webhooks | ~$21.60 | 71% |
| **Portfolio** | $149 | 25 | + White-label, Priority | ~$54.00 | 64% |

### Annual Plans (20% Discount)

| Plan | Annual | Monthly Equivalent | Savings |
|------|--------|-------------------|---------|
| **BYO** | $48 | $4/mo | $12 |
| **Starter** | $144 | $12/mo | $36 |
| **Trader** | $336 | $28/mo | $84 |
| **Pro** | $720 | $60/mo | $180 |
| **Portfolio** | $1,430 | $119/mo | $358 |

*Assuming MetaApi costs $0.003/hour per account ($2.16/month)
**BYO limited by MyFxBook API rate limits

## Justification

### BYO Plan ($5/month)
- **Zero infrastructure cost** - Users bring their own MyFxBook API
- **Gateway drug** - Easy entry point to upsell later
- **Community building** - Public sharing creates organic marketing
- **Pure profit** - 100% margin since no MetaApi costs

### Revised Pricing (vs Original)
- **Original**: $9/$19/$49/$99
- **New**: $15/$35/$75/$149 (+$5 BYO)
- **Rationale**: 
  - Ensures profitability even if MetaApi costs 3x estimates
  - Still competitive vs manual tracking or accountants
  - Premium positioning for serious traders

### Annual Discount (20%)
- **Industry standard** - Most SaaS offer 15-25%
- **Cash flow benefit** - Upfront payment improves runway
- **Reduces churn** - Annual commits stick around
- **Easy math** - 20% = 2.4 months free

## Feature Matrix

| Feature | BYO | Starter | Trader | Pro | Portfolio |
|---------|-----|---------|--------|-----|-----------|
| MyFxBook Import | ✅ | ✅ | ✅ | ✅ | ✅ |
| Direct MT4/5 | ❌ | ✅ | ✅ | ✅ | ✅ |
| Account Limit | ∞* | 1 | 3 | 10 | 25 |
| Monthly Reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quarterly Reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| CSV Export | ✅ | ✅ | ✅ | ✅ | ✅ |
| PDF Export | ❌ | ✅ | ✅ | ✅ | ✅ |
| Tax Reports | ❌ | ❌ | ✅ | ✅ | ✅ |
| Public Sharing | ✅ | ✅ | ✅ | ✅ | ✅ |
| Account Comparison | ❌ | ❌ | ✅ | ✅ | ✅ |
| API Access | ❌ | ❌ | ❌ | ✅ | ✅ |
| Webhooks | ❌ | ❌ | ❌ | ✅ | ✅ |
| White Label | ❌ | ❌ | ❌ | ❌ | ✅ |
| Priority Support | ❌ | ❌ | ❌ | ❌ | ✅ |

*Limited by MyFxBook API rate limits

## Public Sharing Features

### All Plans Can:
- Generate public performance URLs (fxtrueup.com/u/username)
- Embed performance widgets
- Share verified track records for prop firm applications
- Privacy controls (hide balance, show only percentages)

### Benefits:
- **Social proof** - Top traders become brand ambassadors
- **SEO value** - Public profiles rank for trader names
- **Viral growth** - Traders share to prove performance
- **Trust building** - Transparency attracts serious traders

## Implementation Notes

1. **BYO Technical Requirements**:
   - MyFxBook API integration
   - Rate limit handling (their API has strict limits)
   - Graceful degradation when API fails
   - Clear messaging about limitations

2. **Annual Billing**:
   - Stripe subscriptions with yearly intervals
   - Proration for plan upgrades
   - No refunds (industry standard)
   - Auto-renewal with 30-day notice

3. **Free Trial Strategy**:
   - 7 days with mock data (no credit card)
   - OR 7 days with 1 real account (card required)
   - BYO plan has no trial (already low cost)

## Competitive Analysis

| Competitor | Pricing | Accounts | Notes |
|------------|---------|----------|--------|
| MyFxBook | Free | Unlimited | But no advanced analytics |
| FX Blue | Free-$30 | Unlimited | Desktop software, not SaaS |
| Psyquation | $29-99 | 1-10 | Similar features, higher entry |
| TradersLog | $20-60 | 3-15 | Manual entry focus |
| **FX True Up** | $5-149 | 1-25+ | Best value with BYO option |

## Revenue Projections

Assuming 1000 users after 12 months:
- 40% BYO ($5): 400 × $5 = $2,000/mo
- 30% Starter ($15): 300 × $15 = $4,500/mo
- 20% Trader ($35): 200 × $35 = $7,000/mo
- 8% Pro ($75): 80 × $75 = $6,000/mo
- 2% Portfolio ($149): 20 × $149 = $2,980/mo

**Total MRR**: $22,480
**With 30% annual**: $26,976 MRR equivalent

## Key Advantages

1. **BYO Option** - Unique in market, zero risk entry
2. **Public Profiles** - Free marketing via trader sharing
3. **Prop Firm Focus** - Clear use case, willing to pay
4. **Annual Discounts** - Improved cash flow and retention
5. **Safe Margins** - Profitable even with 3x cost surprises