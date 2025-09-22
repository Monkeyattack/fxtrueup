# VPS Conflict Analysis & Consistency Report

> **Generated**: 2025-08-03  
> **VPS**: 172.93.51.42 (SSD Nodes, Ubuntu 24.04)  
> **Analysis Scope**: All repositories in C:\Users\cmeredith\source\repos  

---

## 🔍 Executive Summary

**Status**: ⚠️ Multiple conflicts identified that need immediate attention  
**Projects Analyzed**: 7 active projects across shared VPS infrastructure  
**Critical Issues**: 3 major conflicts, 5 minor inconsistencies  

---

## 🚨 Critical Conflicts Identified

### 1. Port Conflicts
| Port | Project 1 | Project 2 | Status | Action Required |
|------|-----------|-----------|--------|-----------------|
| **3000** | cashflow-trader (backend) | tax-lien-search (frontend) | 🔴 Conflict | Reassign cashflow to 3002 |
| **3001** | cashflow-trader (frontend) | calendar-app/metaday-app | 🔴 Conflict | Reassign calendar to 3005 |
| **5001** | tao-alpha-dca (main dashboard) | tao-dashboard (VPS) | 🔴 Active conflict | Already resolved on VPS |

### 2. Domain Conflicts
| Domain | Primary Project | Conflicting Config | Status |
|--------|----------------|-------------------|--------|
| **tao.profithits.app** | tao-dashboard | defi-dashboard | 🔴 NGINX conflict |
| **webdev.monkeyattack.com** | crypto-paper-trading | tao-dashboard | 🔴 Multiple server_name |

### 3. VPS Path Conflicts
| Path | Project | Deployment Status | Issue |
|------|---------|------------------|-------|
| `/var/www/metaday-app` | calendar-app | Deployed but inactive | PM2 not running |
| `/var/www/html/cashflowfinder` | cashflow-trader | Static files only | Backend not deployed |

---

## 📊 Current VPS Deployment Status

### Active Services (PM2)
```
ID  Name                 Port    Domain                    Status
1   alpha-dca           5001    tao.profithits.app        ✅ Online
5   cashflow-finder     3000    cashflowfinder.app        ✅ Online  
2   cashflow-finder-api 8001    cashflowfinder.app/api    ✅ Online
16  defi-dashboard      5002    tao.profithits.app/defi   ✅ Online
10  defi-rebalancer     N/A     Background process        ✅ Online
11  fxtrueup           8080    fxtrueup.com              ✅ Online
12  fxtrueup           8080    fxtrueup.com (cluster)    ✅ Online  
8   tax-lien-api       8000    tax.profithits.app        ✅ Online
```

### NGINX Active Sites
```
Domain                   Config File            Proxy Target        Status
cashflowfinder.app      cashflow-finder        127.0.0.1:3000      ✅ Active
crypto.profithits.app   crypto.profithits.app  127.0.0.1:8502      ✅ Active
dev.metaday.app         dev.metaday.app        Static files        ✅ Active
fxtrueup.com           fxtrueup.com           127.0.0.1:8080      ✅ Active
tao.profithits.app     tao-dashboard          127.0.0.1:5001      ✅ Active
tax.profithits.app     tax-profithits         127.0.0.1:8000      ✅ Active
```

---

## 🗂️ Project Inventory & Port Allocation

### Recommended Port Assignment
| Project | Current Port | Recommended Port | Service Type | Priority |
|---------|-------------|------------------|--------------|----------|
| **fxtrueup** | 8080 | 8080 | Node.js API | ✅ Keep |
| **tao-alpha-dca** | 5001 | 5001 | Flask Dashboard | ✅ Keep |
| **defi-dashboard** | 5002 | 5002 | Flask Dashboard | ✅ Keep |  
| **tax-lien-search** | 8000 | 8000 | FastAPI Backend | ✅ Keep |
| **crypto-paper-trading** | 8501 | 8501 | Streamlit | ✅ Keep |
| **cashflow-trader (backend)** | 3000 | **3002** | Node.js API | 🔄 Change |
| **cashflow-trader (frontend)** | 3001 | **3003** | Next.js | 🔄 Change |
| **calendar-app/metaday-app** | 3001 | **3005** | Node.js API | 🔄 Change |

### Safe Port Ranges
- **8000-8099**: API services (FastAPI, Express)
- **5000-5099**: Dashboard services (Flask, Streamlit)  
- **3000-3099**: Frontend services (React, Next.js)

---

## 🌐 Domain Management

### CloudFlare DNS Records (Confirmed)
```
Domain                  → IP Address      Project
tao.profithits.app     → 172.93.51.42   tao-alpha-dca + defi-dashboard
webdev.monkeyattack.com → 172.93.51.42   crypto-paper-trading
metaday.app            → 172.93.51.42   calendar-app
fxtrueup.com           → 172.93.51.42   metatrader-reporting
```

### Domain Recommendations
| Current Domain | Project | Suggested Change | Reason |
|---------------|---------|------------------|---------|
| crypto.profithits.app | crypto-paper-trading | webdev.monkeyattack.com | Use existing DNS |
| tax.profithits.app | tax-lien-search | tax.profithits.app | ✅ Good |
| cashflowfinder.app | cashflow-trader | cashflow.profithits.app | Consistency |

---

## 🔧 NGINX Configuration Issues

### Inconsistencies Found
1. **Security Headers**: Not standardized across sites
2. **CloudFlare Integration**: Only tao-dashboard has CF real IP config
3. **SSL Termination**: All sites expect CloudFlare SSL termination
4. **Proxy Headers**: Inconsistent header forwarding

### Standard NGINX Template Needed
```nginx
server {
    listen 80;
    server_name example.domain.com;
    
    # Standard CloudFlare real IP config
    set_real_ip_from 173.245.48.0/20;
    # ... (full CF IP ranges)
    real_ip_header CF-Connecting-IP;
    
    # Standard security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
    
    # Standard proxy configuration
    location / {
        proxy_pass http://127.0.0.1:PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
    }
}
```

---

## 📁 Repository Deployment Status

### Fully Deployed ✅
- **fxtrueup** (metatrader-reporting): Complete deployment
- **tao-alpha-dca**: Active with dashboard + DeFi rebalancer  
- **tax-lien-search**: Backend deployed, frontend static
- **cashflow-trader**: Partial (frontend static, backend running)

### Needs Deployment 🔄
- **crypto-paper-trading**: Only NGINX config exists
- **calendar-app**: Directory exists but PM2 not configured
- **youtube-pull**: Not deployed (monitoring service)

### Local Only 📍
- **alpha-DCA**: Duplicate of tao-alpha-dca (can be removed)

---

## 🚀 Immediate Action Items

### Priority 1 (Critical) 🔴
1. **Resolve tao.profithits.app conflict**:
   ```bash
   # Move defi-dashboard to subdomain
   sed -i 's/tao.profithits.app/defi.profithits.app/' /etc/nginx/sites-available/defi-dashboard
   ```

2. **Fix port conflicts in local development**:
   - Update cashflow-trader to use ports 3002/3003
   - Update calendar-app to use port 3005

3. **Standardize NGINX configurations**:
   - Add CloudFlare real IP to all sites
   - Standardize security headers

### Priority 2 (Important) 🟡  
1. **Deploy missing projects**:
   - crypto-paper-trading (Streamlit app)
   - Complete calendar-app deployment

2. **Cleanup unused configurations**:
   - Remove .backup and .bak NGINX files
   - Clean up inactive PM2 processes

### Priority 3 (Maintenance) 🟢
1. **Documentation updates**:
   - Update each project's README with VPS info
   - Create deployment runbooks
   - Document port allocation system

---

## 📋 Environment Variables Audit

### Standardization Needed
All projects should use consistent environment variable naming:

```bash
# Standard format for all projects
PORT=XXXX
NODE_ENV=production
DOMAIN=project.domain.com
VPS_IP=172.93.51.42

# Database (if applicable)
DATABASE_URL=postgresql://...

# API Keys (project-specific)
API_KEY_SERVICE=...
```

---

## 🔐 Security Considerations

### Current Issues
1. **Mixed SSL termination**: Some configs assume HTTPS, others HTTP
2. **Inconsistent headers**: Not all sites forward real client IP
3. **Rate limiting**: Not implemented across all services

### Recommendations
1. Standardize CloudFlare integration across all sites
2. Implement rate limiting at NGINX level
3. Add fail2ban protection for repeated failed requests
4. Regular security header audits

---

## 📈 Monitoring & Alerting

### Current Monitoring
- PM2 built-in monitoring
- NGINX access/error logs
- No centralized alerting

### Recommended Additions
1. **Uptime monitoring**: External service to monitor all domains
2. **Log aggregation**: Centralized logging system
3. **Resource monitoring**: CPU/memory/disk alerts
4. **SSL certificate expiration monitoring**

---

## 🧹 Cleanup Tasks

### VPS Cleanup
```bash
# Remove backup NGINX configs
rm /etc/nginx/sites-available/*.backup
rm /etc/nginx/sites-available/*.bak

# Clean up unused directories
# Review and remove if not needed:
# /var/www/html/cashflowfinder (if backend deployed elsewhere)
# /var/www/metaday-mobile (if not used)
```

### Repository Cleanup
- **alpha-DCA**: Can be removed (duplicate of tao-alpha-dca)
- **Unused branches**: Clean up any obsolete branches
- **Environment files**: Ensure all have .env.template

---

## 📞 Contact Information for Issues

| Service | Contact | Priority |
|---------|---------|----------|
| **VPS Issues** | SSD Nodes Support | High |
| **Domain/SSL** | CloudFlare Dashboard | Medium |
| **NGINX Config** | Self-managed | High |
| **Application Issues** | Check logs: `pm2 logs [app-name]` | High |

---

## 📝 Change Log

| Date | Change | Impact |
|------|--------|---------|
| 2025-08-03 | Initial conflict analysis | Documentation |
| 2025-08-03 | fxtrueup deployment complete | Production ready |
| TBD | Port conflict resolution | Development workflow |
| TBD | NGINX standardization | Security & consistency |

---

**Next Review**: 2025-08-10  
**Document Owner**: Claude Code Assistant  
**Last Updated**: 2025-08-03 by Claude