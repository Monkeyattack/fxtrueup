# CLAUDE.md - FX True Up (MetaTrader Reporting)

## Project Overview
FX True Up is a SaaS platform for MT4/MT5 portfolio tracking and performance analytics. It connects to trading accounts via MetaApi using read-only investor passwords to provide consolidated reporting, risk analysis, and prop firm compliance tracking.

## Architecture
- **Backend**: Node.js/Express with ES modules
- **Database**: Firestore (Firebase)
- **Auth**: Firebase Authentication
- **Payments**: Stripe subscriptions
- **MT4/MT5 API**: MetaApi Cloud SDK
- **Deployment**: PM2 cluster mode on VPS

## Infrastructure Configuration

### VPS Connection Info
- **SSH Command**: `ssh -i ~/.ssh/tao_alpha_dca_key root@172.93.51.42`
- **Server IP**: 172.93.51.42
- **Domain**: fxtrueup.com
- **Backend Port**: 8080 (PM2 cluster mode with 2 instances)

### Deployment Info
- **App Directory**: /var/www/fxtrueup
- **Git Repository**: https://github.com/Monkeyattack/fxtrueup
- **Branch**: main
- **PM2 Process**: fxtrueup (2 instances in cluster mode)
- **NGINX Config**: /etc/nginx/sites-available/fxtrueup.com

### Environment Variables (Production)
- **METAAPI_TOKEN**: Set in ecosystem.config.cjs
- **METAAPI_ACCOUNT_ID**: For demo account
- **STRIPE_SECRET_KEY**: Production key configured
- **STRIPE_WEBHOOK_SECRET**: For webhook handling
- **FIREBASE_SERVICE_ACCOUNT**: Base64 encoded credentials

## Pricing Strategy

### Tier Structure
1. **Free Trial**: 7 days, 1 account
2. **Starter**: $9.99/mo - 3 accounts
3. **Professional**: $24.99/mo - 10 accounts  
4. **Team**: $49.99/mo - 25 accounts
5. **Enterprise**: $149.99/mo - 100 accounts
6. **BYO MyFxBook**: $5/mo - Bring your own integration

### Key Pricing Considerations
- MetaApi charges per account per hour (opaque pricing)
- Need margin for MetaApi costs + profit
- 20% annual discount option recommended
- Free trial critical for conversion

## Development Commands
- Setup: `npm install`
- Run: `npm start` (port 8080)
- Test: `npm test`
- Deploy: `pm2 restart fxtrueup`
- Logs: `pm2 logs fxtrueup`

## Key Files
- `src/index.js`: Main Express server
- `src/services/metaapi.js`: MetaApi integration
- `src/services/stripe.js`: Subscription management
- `src/routes/`: API endpoints
- `ecosystem.config.cjs`: PM2 configuration

## Current Status
- ✅ Deployed to VPS (2025-08-03)
- ✅ NGINX configured with SSL
- ✅ PM2 running in cluster mode
- ⚠️ Firebase credentials needed for production
- ⚠️ MetaApi pricing model risk identified

## Pricing and Recommendations

- Save pricing recommendations and justifications to ensure clear documentation of pricing strategy decisions

## VPS Access

- You have access to the VPS check the global CLAUDE.md
- Save VPS info, API keys, url, and file paths on the VPS into local project for easy reference and configuration management

---
Last Updated: 2025-08-03