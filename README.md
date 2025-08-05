# FX True Up - MetaTrader Portfolio Analytics

> Smart MT4/MT5 Portfolio Tracker for Retail Traders, Signal Followers & Prop Firm Candidates  
> **Live URL**: [fxtrueup.com](https://fxtrueup.com)  
> **GitHub**: [Monkeyattack/fxtrueup](https://github.com/Monkeyattack/fxtrueup)  

---

## 🚀 Deployment Information

### Production Server
- **VPS Provider**: SSD Nodes
- **IP Address**: 172.93.51.42
- **Domain**: fxtrueup.com (via CloudFlare)
- **OS**: Ubuntu 24.04 LTS
- **Node.js**: v18.20.8
- **Process Manager**: PM2 (2 clustered instances)
- **Web Server**: NGINX (reverse proxy to port 8080)

### Repository
- **GitHub URL**: https://github.com/Monkeyattack/fxtrueup
- **Default Branch**: master
- **CI/CD**: Manual deployment via SSH

---

## 🛠️ Tech Stack

| Layer              | Tool / Service                         | Status |
|--------------------|----------------------------------------|--------|
| Backend            | **Node.js (Express)**                  | ✅ Deployed |
| Frontend           | **Vanilla JS + Tailwind CSS**          | ✅ Deployed |
| Auth               | **Google OAuth 2.0**                   | ✅ Configured |
| Database           | **Firestore** (Cloud NoSQL)            | 🔧 Config needed |
| MT4/MT5 Access     | **MetaApi** (REST/WebSocket)           | 🔧 Token needed |
| Reporting          | CSV + PDFKit + QBO API                 | ✅ Ready |
| Billing            | **Stripe** (tiered plans + trial)      | 🔧 Setup needed |
| Hosting            | **VPS + NGINX + PM2**                  | ✅ Live |

---

## 📍 Live Endpoints

### Health & Status
- **Health Check**: https://fxtrueup.com/health
- **API Status**: https://fxtrueup.com/api/status

### API Routes (Placeholders)
- **Auth**: https://fxtrueup.com/api/auth/me
- **Accounts**: https://fxtrueup.com/api/accounts
- **Analytics**: https://fxtrueup.com/api/analytics
- **Subscriptions**: https://fxtrueup.com/api/subscriptions/plans

### Webhook
- **Stripe**: https://fxtrueup.com/api/webhooks/stripe

---

## 🔐 Environment Variables

Located in `/var/www/fxtrueup/.env` on VPS:

```bash
# MetaApi Configuration
METAAPI_TOKEN=your_metaapi_token_here  # Get from https://app.metaapi.cloud/token
METAAPI_DOMAIN=mt-client-api-v1.london.agiliumtrade.ai
METAAPI_REGION=london

# Firebase Configuration
FIREBASE_PROJECT_ID=fxtrueup
FIREBASE_PRIVATE_KEY=your_firebase_private_key_here
FIREBASE_CLIENT_EMAIL=your_firebase_client_email_here

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
# ... (all price IDs after running setup-stripe)

# Server Configuration
PORT=8080
NODE_ENV=production
API_URL=https://fxtrueup.com

# Security
JWT_SECRET=fxtrueup_super_secret_jwt_key_2025
ENCRYPTION_KEY=fxtrueup_32_character_encrypt_key
```

---

## 📝 Deployment Steps

### Initial Setup (Already Complete)
```bash
# 1. Create GitHub repository
curl -H "Authorization: token ghp_TOKEN" https://api.github.com/user/repos -d '{"name":"fxtrueup"}'

# 2. Push code
git init
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/Monkeyattack/fxtrueup.git
git push -u origin master

# 3. Clone on VPS
ssh -i ~/.ssh/tao_alpha_dca_key root@172.93.51.42
cd /var/www
git clone https://github.com/Monkeyattack/fxtrueup.git

# 4. Install dependencies
cd fxtrueup
npm install

# 5. Set up PM2
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# 6. Configure NGINX
# Already configured at /etc/nginx/sites-available/fxtrueup.com
```

### Regular Deployment
```bash
# Local development
git add -A
git commit -m "Update: description of changes"
git push origin master

# Deploy to VPS (one command)
ssh -i ~/.ssh/tao_alpha_dca_key root@172.93.51.42 "cd /var/www/fxtrueup && git pull && pm2 restart fxtrueup && pm2 save"
```

### Quick Commands
```bash
# Check status
ssh -i ~/.ssh/tao_alpha_dca_key root@172.93.51.42 "pm2 status"

# View logs
ssh -i ~/.ssh/tao_alpha_dca_key root@172.93.51.42 "pm2 logs fxtrueup --lines 50"

# Restart services
ssh -i ~/.ssh/tao_alpha_dca_key root@172.93.51.42 "pm2 restart fxtrueup"

# Update NGINX
ssh -i ~/.ssh/tao_alpha_dca_key root@172.93.51.42 "nginx -t && systemctl reload nginx"
```

---

## 🏗️ Project Structure

```
/var/www/fxtrueup/
├── src/
│   ├── index.js              # Main server file
│   ├── index-simple.js       # Simplified server (backup)
│   ├── controllers/          # Request handlers
│   ├── middleware/           # Express middleware
│   ├── routes/               # API routes
│   ├── services/             # Business logic
│   │   ├── metaapi.js       # MT4/5 integration
│   │   ├── stripe.js        # Payment processing
│   │   ├── myfxbook.js      # MyFxBook integration
│   │   └── mockData.js      # Demo data generator
│   └── utils/               # Helper functions
├── scripts/
│   └── setup-stripe.js      # Stripe product setup
├── .env                     # Production secrets
├── .env.template            # Environment template
├── ecosystem.config.cjs     # PM2 configuration
├── package.json             # Dependencies
└── README.md                # This file
```

---

## 💰 Pricing Strategy

### Subscription Tiers
| Plan | Monthly | Annual | Accounts | Key Features |
|------|---------|--------|----------|--------------|
| **BYO** | $5 | $48 | Unlimited* | MyFxBook API only |
| **Starter** | $15 | $144 | 1 | Direct MT4/5 |
| **Trader** | $35 | $336 | 3 | + Comparisons |
| **Pro** | $75 | $720 | 10 | + API access |
| **Portfolio** | $149 | $1,430 | 25 | + White-label |

*Limited by MyFxBook API rate limits

---

## 🔧 Pending Setup Tasks

### 1. MetaApi Integration
```bash
# Get token from https://app.metaapi.cloud/token
# Add to .env: METAAPI_TOKEN=your_token_here
```

### 2. Firebase Setup
```bash
# 1. Create Firebase project
# 2. Generate service account JSON
# 3. Add credentials to .env
```

### 3. Stripe Configuration
```bash
# Local:
npm run setup-stripe

# Copy generated price IDs to VPS .env
```

### 4. SSL Certificate
- CloudFlare handles SSL automatically
- Ensure CloudFlare SSL mode is set to "Flexible"

---

## 🐛 Troubleshooting

### PM2 Issues
```bash
# Check logs
pm2 logs fxtrueup --err --lines 100

# Restart with update
pm2 restart fxtrueup --update-env

# Full reset
pm2 delete fxtrueup
pm2 start ecosystem.config.cjs
```

### NGINX Issues
```bash
# Test configuration
nginx -t

# Check error logs
tail -f /var/log/nginx/fxtrueup.com.error.log

# Restart NGINX
systemctl restart nginx
```

### Node.js Issues
```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## 📈 Monitoring

### Application Health
- PM2 Dashboard: `pm2 monit`
- Logs: `/var/log/pm2/fxtrueup-*.log`
- NGINX Logs: `/var/log/nginx/fxtrueup.com.*.log`

### Performance Metrics
- Memory Usage: ~50MB per instance
- CPU: <5% idle
- Response Time: <100ms
- Uptime: 99.9% target

---

## 🚨 Important Security Notes

1. **Never commit**:
   - `.env` files
   - Private keys
   - API tokens
   - Firebase service account JSON

2. **Always use**:
   - Environment variables for secrets
   - HTTPS (via CloudFlare)
   - Rate limiting (implemented)
   - Helmet.js (implemented)

3. **Regular maintenance**:
   - Update dependencies monthly
   - Rotate API keys quarterly
   - Monitor error logs daily
   - Backup database weekly

---

## 📞 Support Contacts

- **VPS Support**: SSD Nodes support
- **Domain/SSL**: CloudFlare dashboard
- **Payment Issues**: Stripe dashboard
- **API Issues**: Check respective service docs

---

## 🎯 Next Development Phase

1. **Frontend Development**
   - Choose between React/Next.js
   - Implement responsive design
   - Connect to backend API

2. **Complete Integrations**
   - MetaApi account connections
   - Firebase authentication
   - Stripe payment flow

3. **Testing**
   - Unit tests for services
   - Integration tests for API
   - End-to-end testing

4. **Launch Preparation**
   - Marketing website
   - Documentation
   - Support system

---

Last Updated: 2025-08-03 by Claude