Copy Trader Orchestration

Overview
- Runs filtered copy trading using the existing FilteredCopyTrader.
- Supports multiple source → destination routes in one process.
- Uses file-based configuration by default; optional env JSON override.

Key Files
- `src/services/filteredCopyTrader.js` — core copy logic and filters
- `src/services/multiCopyService.js` — orchestrates multiple routes
- `src/services/multiCopy.cli.js` — CLI entrypoint for PM2 and local runs
- `src/config/copy-routes.js` — file-based routes config (recommended)
- `src/config/accounts.js` — known MetaApi account IDs and regions

Configure Routes (File-Based)
- Edit `src/config/copy-routes.js` and add one object per route:
  - `sourceId` (MetaApi account ID) — the source account to watch
  - `destId` (MetaApi account ID) — the destination account to trade on
  - `destRegion` (string) — destination region, e.g., `new-york`
  - `fixedLotSize` (number, optional) — default 2.50
  - `maxDailyTrades` (number, optional) — default 5

Example
```
import { ACCOUNT_CONFIGS, GOLD_ACCOUNT_ID, GRID_ACCOUNT_ID, PROP_FIRMKID_EA_ID } from './accounts.js';

export const COPY_ROUTES = [
  // PropFirmKidEA → Grid Demo (keep 2.50 lots)
  {
    sourceId: PROP_FIRMKID_EA_ID,
    destId: GRID_ACCOUNT_ID,
    destRegion: ACCOUNT_CONFIGS.GRID_DEMO.region,
    fixedLotSize: 2.50,
    maxDailyTrades: 5
  },
  // Gold Buy Only → Grid Demo (enable if desired)
  // {
  //   sourceId: GOLD_ACCOUNT_ID,
  //   destId: GRID_ACCOUNT_ID,
  //   destRegion: ACCOUNT_CONFIGS.GRID_DEMO.region,
  //   fixedLotSize: 2.50,
  //   maxDailyTrades: 5
  // }
];

export default COPY_ROUTES;
```

Optional: Configure via Environment
- Set `COPY_ROUTES` to a JSON array; this overrides the file config.
- Example:
```
COPY_ROUTES='[
  {"sourceId":"1becc873-1ac2-4dbd-b98d-0d81f1e13a4b","destId":"019ec0f0-09f5-4230-a7bd-fa2930af07a4","destRegion":"new-york","fixedLotSize":2.5,"maxDailyTrades":5},
  {"sourceId":"58b81c8e-18fa-4a1d-b7d0-b7f7aa7cf9ac","destId":"019ec0f0-09f5-4230-a7bd-fa2930af07a4","destRegion":"new-york","fixedLotSize":2.5,"maxDailyTrades":5}
]'
```

Environment Requirements
- `METAAPI_TOKEN` — required for MetaApi access (connection pool uses this)
- `POOL_API_URL` — optional, defaults to `http://localhost:8087`
- `POOL_PORT` — optional, port for the pool API if you run it locally

Local Run (without PM2)
- Start pool: `node src/services/connectionPool/api.js`
- Start multi-copy: `node src/services/multiCopy.cli.js`

PM2 Migration (replace existing single-route service)
- These commands replace `setup-gold-to-grid-copy.js` with the new multi-route CLI under the same PM2 name.

Commands
1) From repo root: `/home/claude-dev/repos/fxtrueup`
2) Stop and remove old single-route process:
   - `pm2 stop gold-to-grid-copy || true`
   - `pm2 delete gold-to-grid-copy || true`
3) Start multi-route service (file-config routes):
   - `pm2 start src/services/multiCopy.cli.js --name gold-to-grid-copy --namespace FXTrueUp --env production`
   - Ensure your shell/session has `METAAPI_TOKEN` (or define in PM2 env)
4) Persist and verify:
   - `pm2 save`
   - `pm2 ls`
   - `pm2 logs gold-to-grid-copy`

Updating Routes
- Edit `src/config/copy-routes.js`
- Restart process: `pm2 restart gold-to-grid-copy`

Troubleshooting
- No trades copying:
  - Check pool health: `curl http://localhost:8087/health`
  - Verify account IDs exist and are deployed in MetaApi
  - Confirm `METAAPI_TOKEN` is set for the PM2 app (`pm2 env gold-to-grid-copy`)
- Trade execution errors:
  - Multi-copy uses `action: BUY|SELL` (aligned with pool `/trade/execute`)
  - Check pool logs for execution errors
- Logging:
  - `pm2 logs gold-to-grid-copy` for service logs
  - Pool logs where you started `src/services/connectionPool/api.js`

Rollback
- Return to single-route:
  - `pm2 delete gold-to-grid-copy`
  - `pm2 start setup-gold-to-grid-copy.js --name gold-to-grid-copy --namespace FXTrueUp --env production`
  - `pm2 save`

