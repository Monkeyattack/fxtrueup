# Release Notes - FX True Up

## v2.7.0 - 2025-10-16

### Bug Fixes
- **Stop Loss Filter**: Fixed incorrect pip calculation for precious metals (XAUUSD, XAGUSD)
  - Gold/Silver now correctly use 100x multiplier (like JPY pairs) instead of 10,000x
  - Resolves PropFirmKid trades being rejected with "Stop loss too wide" errors
  - Before: 16.43 point SL = 164,300 pips (rejected)
  - After: 16.43 point SL = 164.3 pips (accepted)
  - **Impact**: PropFirmKid trades will now copy successfully to FTMO Live 997 and HolaPrime routes

### Technical Details
- Modified `filteredCopyTrader.js:997` to handle precious metals correctly
- Stop loss validation now properly recognizes metal pair pip sizes
- All three PropFirmKid routes (Alpha, FTMO Live, HolaPrime) now functional

---

## v2.6.0 - 2025-10-15

### Features
- **Gap Detection**: Added reconnection callback system to detect and copy missed trades during connection outages
- **Time Delay Fix**: Set `minTimeBetweenTrades` to 0 for aggressive_dynamic rule set to allow rapid position opening

### Bug Fixes
- Fixed `copyExistingPositions` set to false for PFK to Alpha route to prevent copying stale positions on startup

---

## v2.5.0 - 2025-10-15

### Breaking Changes
- **Config-Driven Architecture**: Removed ALL hardcoded validation checks and defaults
  - Empty filters array (`"filters": []`) now means copy ALL trades
  - All limits must be explicitly configured via JSON filters
  - No more implicit defaults in FilteredCopyTrader constructor

### Documentation
- Removed VPS deployment references - system runs locally via PM2
- Updated CLAUDE.md with current architecture and deployment model

---

## v2.4.0 - Earlier Releases

### Features
- Advanced routing system with JSON configuration
- Multi-platform support (MT5, cTrader, DXtrade)
- Connection pooling via meta-trader-hub
- Prop firm compliance filters
- Position mapping and orphan detection
- Telegram notifications
- Performance monitoring

---

**Repository**: https://github.com/Monkeyattack/fxtrueup
**Branch**: master
**PM2 Process**: fxtrueup-router (ID: 161)
