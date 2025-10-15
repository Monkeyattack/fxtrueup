# CLAUDE.md - FX True Up (Copy Trading Router)

## Project Overview
FX True Up is a copy trading routing system that monitors trading accounts and copies positions between accounts using configurable rules and filters. It runs locally using PM2 process management.

## Architecture
- **Backend**: Node.js with ES modules
- **Copy Trading Engine**: Advanced router with JSON config-driven filtering
- **Position Tracking**: Redis-based position mapping
- **MT4/MT5 API**: MetaAPI via connection pool (meta-trader-hub)
- **Process Management**: PM2 (local, NOT on remote VPS)

## Local Infrastructure

### PM2 Process
- **Process Name**: `fxtrueup-router`
- **Process ID**: 161
- **Mode**: cluster
- **Repository**: https://github.com/Monkeyattack/fxtrueup
- **Branch**: master

### Environment Configuration
- **METAAPI_TOKEN**: Set in ecosystem.config.cjs
- **Connection Pool**: Communicates with meta-trader-hub connection pool

## Development Workflow

### Local Development
1. **Make changes** in this Git repository
2. **Commit and push** to GitHub
3. **Restart local service**: `pm2 restart fxtrueup-router`

### Development Commands
**Local Operations:**
- Setup: `npm install`
- Restart service: `pm2 restart fxtrueup-router`
- View logs: `pm2 logs fxtrueup-router --lines 50`
- Check status: `pm2 status`
- Monitor: `pm2 monit`

**Git Operations:**
- Commit: `git add -A && git commit -m "message"`
- Push: `git push origin master`

## Key Files
- `src/services/advancedRouter.js`: Route orchestration and config loading
- `src/services/filteredCopyTrader.js`: Core copy trading logic
- `src/config/routing-config.json`: JSON configuration for routes, rule sets, and filters
- `src/services/positionMapper.js`: Position tracking and mapping
- `src/services/unifiedPoolClient.js`: Connection pool communication
- `ecosystem.config.cjs`: PM2 configuration

## Configuration Architecture

### Config-Driven Design
ALL validation and filtering is now config-driven via JSON:
- **No hardcoded defaults** in FilteredCopyTrader constructor
- **No hardcoded validation checks** in shouldCopyTrade()
- **Empty filters array** (`"filters": []`) means copy ALL trades
- **All limits** must be explicitly configured via JSON filters

### Key Configuration Files
- `routing-config.json`: Defines accounts, rule sets, filters, and routes
- Rule sets specify: sizing type (proportional/fixed/dynamic) and filters array
- Filters define: validation rules like frequency limits, time restrictions, etc.

## Current Status
- ✅ Running locally via PM2
- ✅ All hardcoded validation removed (2025-10-15)
- ✅ Config-driven filtering implemented
- ⚠️ Gap detection endpoint (404) - non-critical

## Development Principles
- Never Ever ever load fake data if real data is unavailable. Ever.
- System runs LOCALLY via PM2 - no remote VPS deployment
- All changes require: edit → commit → push → `pm2 restart fxtrueup-router`

## Sister Projects
See `~/.claude/PROJECTS.md` for cross-project references:
- **meta-trader-hub**: Advanced multi-platform trading system with connection pooling
- **Shared Infrastructure**: MetaAPI SDK, Vault patterns, PM2 best practices
- **Learning Opportunities**: Advanced connection pool implementation (70-90% cost savings)

---
Last Updated: 2025-10-15