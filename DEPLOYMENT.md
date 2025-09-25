# Deployment Instructions for Routes Interface

The routes management interface has been successfully added to the FXTrueUp project. To deploy it to the VPS:

## Manual Deployment Steps

1. SSH into the VPS:
   ```bash
   ssh -i ~/.ssh/tao_alpha_dca_key root@172.93.51.42
   ```

2. Navigate to the project directory:
   ```bash
   cd /var/www/fxtrueup
   ```

3. Pull the latest changes:
   ```bash
   git pull origin master
   ```

4. Install any new dependencies (if needed):
   ```bash
   npm install
   ```

5. Restart the PM2 process:
   ```bash
   pm2 restart fxtrueup
   ```

## Accessing the Routes Interface

Once deployed, the routes interface will be available at:
- Development: http://localhost:8080/routes
- Production: https://fxtrueup.com/routes

To access it at dashboard.profithits.app/routes, you'll need to configure NGINX to proxy requests from that subdomain to the FXTrueUp server.

## NGINX Configuration

Add this to your NGINX configuration for dashboard.profithits.app:

```nginx
location /routes {
    proxy_pass http://localhost:8080/routes;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Features Added

1. **Routes API** (`/api/routes/*`):
   - GET `/api/routes/config` - Get routing configuration
   - GET `/api/routes/stats` - Get route statistics
   - POST `/api/routes` - Create new route
   - PUT `/api/routes/:id` - Update route
   - DELETE `/api/routes/:id` - Delete route
   - POST `/api/routes/:id/toggle` - Toggle route enabled/disabled
   - POST `/api/routes/test` - Test a route

2. **Routes Web Interface** (`/routes`):
   - Standalone HTML/JavaScript interface
   - Real-time statistics updates
   - Route management (create, edit, delete, toggle)
   - Visual route flow display
   - Performance metrics

3. **Advanced Router Service**:
   - Multiple source to multiple destination routing
   - Configurable rule sets (proportional, fixed, dynamic)
   - Advanced filters (martingale detection, trading hours, etc.)
   - Redis integration for real-time updates
   - Enhanced Telegram notifications

## Configuration

The routing configuration is stored in `/src/config/routing-config.json`. An example configuration is provided in `routing-config-example.json`.

## Running the Router Service

To start the advanced router service:

```bash
cd /var/www/fxtrueup
node src/services/routerService.cli.js
```

Or add it to PM2:
```bash
pm2 start src/services/routerService.cli.js --name "fxtrueup-router"
pm2 save
```