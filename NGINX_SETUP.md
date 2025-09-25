# NGINX Setup Instructions

## 1. Setup SSL Certificate for fxtrueup.com

First, obtain SSL certificate using Certbot:

```bash
sudo certbot certonly --nginx -d fxtrueup.com -d www.fxtrueup.com
```

## 2. Copy NGINX Configuration for fxtrueup.com

```bash
sudo cp /tmp/fxtrueup.com.conf /etc/nginx/sites-available/fxtrueup.com.conf
sudo ln -s /etc/nginx/sites-available/fxtrueup.com.conf /etc/nginx/sites-enabled/
```

## 3. Add Routes Location to dashboard.profithits.app

Edit the dashboard configuration to add the routes locations:

```bash
sudo nano /etc/nginx/sites-available/dashboard.profithits.app.conf
```

Add these location blocks before the closing `}` of the server block:

```nginx
    # Routes Management Interface - Proxy to FXTrueUp
    location /routes {
        proxy_pass http://127.0.0.1:8080/routes;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # API endpoints for routes
    location /api/routes {
        proxy_pass http://127.0.0.1:8080/api/routes;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

## 4. Test NGINX Configuration

```bash
sudo nginx -t
```

## 5. Reload NGINX

If the test passes:

```bash
sudo systemctl reload nginx
```

## 6. Update DNS Records

Make sure DNS records exist for:
- fxtrueup.com → Your server IP
- www.fxtrueup.com → Your server IP

## 7. Verify Services

Check that FXTrueUp is running on port 8080:

```bash
pm2 list
curl http://localhost:8080/health
```

## Access Points

Once configured, you'll be able to access:

- Main site: https://fxtrueup.com
- Routes interface via FXTrueUp: https://fxtrueup.com/routes
- Routes interface via dashboard: https://dashboard.profithits.app/routes

## Troubleshooting

If fxtrueup.com doesn't work:

1. Check if the service is running:
   ```bash
   pm2 list | grep fxtrueup
   pm2 logs fxtrueup
   ```

2. Check if port 8080 is listening:
   ```bash
   sudo netstat -tlnp | grep 8080
   ```

3. Check NGINX error logs:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

4. Check if firewall allows HTTPS:
   ```bash
   sudo ufw status
   ```