# FX True Up Consolidated Server - Deployment Guide

## 🚀 Overview

This guide covers the deployment of the new **consolidated server** (`server.cjs`) which combines all features from:
- `server-commonjs.cjs` (base functionality)
- `server-secure.cjs` (security features)  
- `server-optimized.cjs` (performance optimizations)

## 🔧 Quick Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.template .env
# Edit .env with your actual values
```

**Required Variables:**
- `METAAPI_TOKEN` - Your MetaAPI token for live trading data

**Optional Variables (enhance security):**
- `JWT_SECRET` - Enables JWT authentication (recommended)
- `NODE_ENV=production` - Enables clustering and performance optimizations

### 3. Start Server

```bash
# Development
npm run dev

# Production  
npm run production

# Simple start
npm start
```

## 🛠️ Configuration Options

### Authentication Modes

The server automatically detects and uses the best authentication method:

1. **JWT Mode** (if `JWT_SECRET` is set)
   - Enhanced security with signed tokens
   - Secure HTTP-only cookies
   - Token expiration and refresh

2. **Simple Token Mode** (fallback)
   - Compatible with existing frontend
   - File-based token storage
   - Backward compatibility

### Security Features

When security environment variables are set, the server enables:

- ✅ **Rate Limiting** - Prevents abuse
- ✅ **CORS Protection** - Controls origins  
- ✅ **Security Headers** - XSS, clickjacking protection
- ✅ **Request Validation** - Input sanitization
- ✅ **Suspicious Activity Logging** - Attack detection

### Performance Features

Production mode enables:

- ✅ **Process Clustering** - Multi-worker scaling
- ✅ **Compression** - Reduces bandwidth
- ✅ **Static Asset Caching** - Faster loading
- ✅ **Performance Monitoring** - Real-time metrics

## 📊 API Endpoints

### Authentication
- `GET /api/auth/google/login` - OAuth login
- `GET /api/auth/google/callback` - OAuth callback
- `POST /api/auth/login` - Direct login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get user info

### Accounts Management
- `GET /api/accounts` - List all accounts
- `GET /api/accounts/:id` - Get account details
- `POST /api/accounts` - Add new account
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Delete account

### Trading Data  
- `GET /api/accounts/:id/history` - Trading history
- `GET /api/accounts/:id/positions` - Open positions
- `GET /api/accounts/:id/metrics` - Performance metrics

### Analytics
- `GET /api/analytics` - Portfolio analytics
- `GET /api/analytics/performance` - Performance data

### Admin & Monitoring
- `GET /api/admin/performance` - Performance metrics (admin only)
- `GET /api/admin/security-report` - Security status (admin only)
- `GET /health` - Health check with detailed status

## 🔍 Troubleshooting

### Issue: Balance Shows as 0

**Diagnosis:**
```bash
curl http://localhost:8080/health
```

Check the response:
```json
{
  "metaApi": {
    "connected": false,
    "tokenConfigured": false
  }
}
```

**Solutions:**
1. **Missing MetaAPI Token**
   ```bash
   # Add to .env file
   METAAPI_TOKEN=your_actual_token_here
   ```

2. **MetaAPI Account Not Connected**
   - Check if MetaAPI account ID is correctly set in account data
   - Verify MetaAPI account is deployed and connected

3. **Network/Firewall Issues**
   - Ensure server can reach MetaAPI endpoints
   - Check firewall settings

### Issue: Account Detail Page Fails

**Common Causes:**
1. **Authentication Token Mismatch**
   - Clear browser storage and re-authenticate
   - Check if JWT_SECRET changed

2. **Account Not Found**  
   - Verify account ID in URL
   - Check if account belongs to authenticated user

3. **MetaAPI Connection Issues**
   - Check server logs for MetaAPI errors
   - Verify account deployment status

### Issue: Enterprise Features Not Available

**Solution:**
The consolidated server automatically sets Enterprise subscription:
```javascript
subscription: 'enterprise'
```

If still prompted for upgrade:
1. Clear browser cache and cookies
2. Re-authenticate via Google OAuth
3. Check `/api/auth/me` response

## 📈 Performance Monitoring

### Real-time Health Check
```bash
curl http://localhost:8080/health | jq '.'
```

### Performance Metrics (Admin)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8080/api/admin/performance | jq '.'
```

### Key Metrics to Monitor
- **Response Time** - Should be <2000ms for most requests
- **Error Rate** - Should be <5%
- **Memory Usage** - Monitor for leaks
- **MetaAPI Connection** - Should stay connected

## 🔐 Security Best Practices

### Production Security Checklist

1. **Environment Variables**
   ```bash
   NODE_ENV=production
   JWT_SECRET=secure-32+-character-secret
   ```

2. **HTTPS Configuration**
   - Use reverse proxy (nginx/Apache)
   - SSL certificates properly configured
   - HSTS headers enabled

3. **Firewall Rules**
   - Only expose port 8080 to reverse proxy
   - Block direct external access

4. **Regular Updates**
   - Keep dependencies updated
   - Monitor security advisories
   - Rotate JWT secrets periodically

## 🚦 Migration from Existing Servers

### From server-commonjs.cjs
1. No changes needed - fully backward compatible
2. Existing tokens continue to work
3. Optional: Add JWT_SECRET for enhanced security

### From server-secure.cjs  
1. Environment variables remain the same
2. All endpoints preserved
3. Enhanced error handling added

### From server-optimized.cjs
1. All performance features included
2. Additional endpoints added
3. Enhanced monitoring capabilities

## 📝 Logging and Debugging

### Enable Debug Logging
```bash
NODE_ENV=development npm start
```

### Key Log Messages
- `✅ Real metrics retrieved` - MetaAPI working
- `❌ Failed to get MetaApi data` - Connection issues
- `⚠️ Slow request` - Performance issues
- `🚫 Blocked CORS request` - Security blocks

### Common Debug Commands
```bash
# Check MetaAPI connection
curl http://localhost:8080/health

# Test authentication
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8080/api/auth/me

# Get account data
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8080/api/accounts
```

## 🆘 Support

If you encounter issues:

1. **Check Health Endpoint** - `GET /health`
2. **Review Server Logs** - Console output
3. **Verify Environment Variables** - `.env` file
4. **Test MetaAPI Connection** - Use provided debug endpoints
5. **Check Frontend Console** - Browser developer tools

## 📋 Version Information

- **Version**: 2.0.0-consolidated
- **Features**: All endpoints, security, performance, monitoring
- **Compatibility**: Full backward compatibility with existing frontend
- **Authentication**: Dual-mode (JWT + Simple Token)
- **Performance**: Production clustering, compression, caching

---

The consolidated server represents the best of all previous implementations with enhanced reliability, security, and performance.