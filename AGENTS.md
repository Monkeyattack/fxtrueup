# Repository Guidelines

## Project Structure & Modules
- `src/`: Server modules (entry variants, `services/`, `routes/`, `middleware/`, `utils/`). Prefer adding new logic under `src/services` and wiring through `src/index*.js`.
- `public/`: Static frontend (HTML/JS/CSS). Do not serve secrets here.
- Root entries: `server.cjs` (default), plus `server-secure.cjs` and `server-optimized.cjs` for hardened/optimized runs.
- Config & ops: `.env` (use `.env.template`), PM2 files `ecosystem*.cjs`, SQL in `billing-schema.sql`, helper scripts in `scripts/`.
- Tests: ad‑hoc Node scripts named `test-*.js` in root and `src/`.

## Build, Test, and Development
- Install: `npm install` (Node >=16).
- Dev server: `npm run dev` (nodemon with `server.cjs`).
- Run server: `npm start` | `npm run start:secure` | `npm run start:optimized`.
- Lint: `npm run lint` (ESLint over root and `public/js/`).
- Performance check: `npm run test:performance`.
- Ad‑hoc tests: `node test-connection-pool.js`, `node src/test-squeeze-integration.js`.
- PM2 (optional): `pm2 start ecosystem.config.cjs`.

## Coding Style & Conventions
- JavaScript only; mix of CommonJS (`.cjs`) for entrypoints and ESM under `src/`.
- Indentation: 2 spaces; use semicolons; single quotes.
- Filenames: kebab-case for scripts (`risk-monitor-dashboard.js`), `.cjs` for Node configs.
- Keep services stateless; read config from `process.env`.

## Testing Guidelines
- Prefer small, focused scripts named `test-*.js` for integration flows.
- For unit tests, you may add Jest (`devDependency`) using `*.test.js` or `__tests__/` and `supertest` for HTTP routes.
- Cover core paths: MetaApi service (`metaapi-service*.cjs|mjs`), cache (`sqlite-cache*.cjs`), and entry middleware.

## Commit & Pull Requests
- Commits: imperative, present tense, concise (e.g., “Fix connection pool retry”, “Add Stripe webhook handler”). Include scope when useful.
- PRs: clear description, linked issues, repro/verification steps, screenshots for UI changes, and notes on env vars/migrations. Ensure `npm run lint` passes.

## Security & Configuration
- Required env vars include secrets for JWT and encryption; start from `.env.template`. Never commit `.env` or tokens.
- App uses Helmet, CORS, rate‑limit, and sqlite—avoid raw SQL; prefer existing helpers.
- Log carefully; redact tokens and account identifiers in errors.
