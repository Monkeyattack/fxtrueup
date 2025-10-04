# Release Notes - October 4, 2025

## 🚀 Release v2.2.0 – Unified Pool Routing & Telemetry Fixes

### 📅 Date: October 4, 2025

---

## ✨ Highlights

- **Unified pool client rollout** for the filtered copy trader so DXtrade, cTrader, and MetaAPI accounts now route through the same abstraction.
- **Realtime telemetry fixes**: router stats now publish real last-trade timestamps to both `routing:stats` and `routing:stats:current`, unblocking the meta-trader-hub dashboards.
- **New live destination** account (`b90a1029-9ef4-4db5-be87-97fd148fe341`) wired into configuration with a dedicated aggressive Gold route.

---

## 🛠️ Engineering Changes

### Copy Trader Platform Compatibility
- Replaced all direct `poolClient` usage in `filteredCopyTrader.js` with `unifiedPoolClient`, ensuring destination-specific APIs (DXtrade/cTrader) are selected automatically.
- Injected `actionType` metadata into trade payloads so DXtrade executions map to the proper order schema.
- Optimized position monitor now runs against the unified client, keeping DXtrade and cTrader subscriptions in step with MT5 polling.

### Router Telemetry Reliability
- `routerService.cli.js` now normalizes per-route stats with ISO8601 `lastActivity` and millisecond `lastTradeTime` values.
- Published stats to both `routing:stats` (consumed by meta-trader-hub) and `routing:stats:current` (existing fxtrueup tooling) to preserve backwards compatibility.
- Route hash entries in Redis carry the real trade timestamps instead of clock time, restoring last-activity accuracy in dashboards and alerts.

### Configuration Updates
- Added **LiveCopyFromGold** (MetaAPI, PlexyTrade-Server01) as a destination account in `routing-config.json`.
- Registered a new aggressive Gold route targeting the live account and fixed the JSON identifier typo that previously broke router startup (`Expected ',' or '}'` error).

---

## ✅ Verification

- Unit lint pass pending (repository lacks shared ESLint config; `npm run lint` exits with missing config warning).
- Manual validation: router boot now succeeds after JSON fix; stats payloads observed in Redis via PM2 logs.
- Confirmed `unifiedPoolClient` handles DXtrade trade requests with correct `actionType` mapping during local dry run.

---

## 📌 Next Steps

1. Run the shared lint suite once the workspace ESLint config is restored.
2. Monitor PM2 routers for DXtrade executions to verify end-to-end trade propagation.
3. Update route balances/limits once the live account funding amounts are finalized.

---
🤖 Generated with Claude Code
