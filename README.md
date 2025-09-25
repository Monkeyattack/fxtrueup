# FX True Up

MetaTrader 4/5 portfolio tracking and analytics SaaS platform with advanced copy trading route management.

## Features

### Core Features
- **MT4/MT5 Integration**: Connect trading accounts via MetaApi using read-only investor passwords
- **Portfolio Analytics**: Consolidated reporting, risk analysis, and prop firm compliance tracking
- **Subscription Management**: Stripe-powered subscription tiers with multiple account support
- **Real-time Updates**: WebSocket-powered live position monitoring and P&L tracking

### Copy Trading Routes System (NEW)
- **Multi-Source/Multi-Destination Routing**: Route trades from multiple source accounts to multiple destinations
- **Advanced Rule Sets**: Proportional, fixed, or dynamic position sizing with configurable multipliers
- **Smart Filters**: Martingale detection, trading hour restrictions, position limits, and more
- **Web Interface**: Manage routes via dashboard at `/routes` or `dashboard.profithits.app/routes`
- **Real-time Monitoring**: Live statistics, P&L tracking, and performance metrics per route
- **Enhanced Notifications**: Telegram alerts with detailed trade information and calculations

## Architecture

- **Backend**: Node.js/Express with ES modules
- **Database**: Firestore (Firebase)
- **Authentication**: Firebase Auth
- **Payments**: Stripe subscriptions
- **MT4/MT5 API**: MetaApi Cloud SDK
- **Process Manager**: PM2 cluster mode
- **Cache/Queue**: Redis
- **Deployment**: VPS with NGINX reverse proxy

## Installation

### Prerequisites
- Node.js 18+
- Redis server
- Firebase project with service account
- MetaApi token
- Stripe account

### Setup

1. Clone the repository:
```bash
git clone https://github.com/Monkeyattack/fxtrueup.git
cd fxtrueup
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. Start the server:
```bash
npm start
```

## Copy Trading Routes

### Configuration

Routes are configured in `src/config/routing-config.json`. Example structure:

```json
{
  "accounts": {
    "acc_001": {
      "accountId": "metaapi-account-id",
      "type": "source",
      "nickname": "PropFirmKid",
      "balance": 25000
    }
  },
  "ruleSets": {
    "standard_11x": {
      "name": "11x Multiplier",
      "type": "proportional",
      "multiplier": 11
    }
  },
  "routes": [
    {
      "id": "route_001",
      "name": "Gold to Grid",
      "source": "acc_001",
      "destination": "acc_002",
      "ruleSet": "standard_11x",
      "enabled": true
    }
  ]
}
```

### Running the Router Service

Start the advanced router as a separate service:

```bash
# Development
node src/services/routerService.cli.js

# Production (with PM2)
pm2 start src/services/routerService.cli.js --name "fxtrueup-router"
pm2 save
```

### API Endpoints

#### Routes Management
- `GET /api/routes/config` - Get routing configuration
- `GET /api/routes/stats` - Get route statistics
- `POST /api/routes` - Create new route
- `PUT /api/routes/:id` - Update route
- `DELETE /api/routes/:id` - Delete route
- `POST /api/routes/:id/toggle` - Enable/disable route

### Web Interface

Access the routes management interface at:
- Development: `http://localhost:8080/routes`
- Production: `https://fxtrueup.com/routes`
- Dashboard: `https://dashboard.profithits.app/routes`

## Deployment

### VPS Deployment

1. SSH into the VPS:
```bash
ssh -i ~/.ssh/your_key root@your_server_ip
```

2. Pull latest changes:
```bash
cd /var/www/fxtrueup
git pull origin master
npm install
```

3. Restart services:
```bash
pm2 restart fxtrueup
pm2 restart fxtrueup-router  # If router is running separately
```

### NGINX Configuration

See `NGINX_SETUP.md` for detailed NGINX configuration instructions.

## Pricing Tiers

1. **Free Trial**: 7 days, 1 account
2. **Starter**: $9.99/mo - 3 accounts
3. **Professional**: $24.99/mo - 10 accounts
4. **Team**: $49.99/mo - 25 accounts
5. **Enterprise**: $149.99/mo - 100 accounts

## Development

### Project Structure
```
src/
├── index.js              # Main Express server
├── routes/               # API endpoints
│   ├── auth.js
│   ├── accounts.js
│   ├── analytics.js
│   ├── subscriptions.js
│   └── routes.js        # Copy trading routes API
├── services/
│   ├── metaapi.js       # MetaApi integration
│   ├── stripe.js        # Payment processing
│   ├── advancedRouter.js # Route management system
│   └── filteredCopyTrader.js # Copy trading logic
└── public/
    └── routes/          # Routes web interface
```

### Development Commands
```bash
npm start          # Start development server
npm test           # Run tests
npm run lint       # Lint code
npm run build      # Build for production
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/Monkeyattack/fxtrueup/issues
- Email: support@fxtrueup.com

## License

Proprietary - All Rights Reserved