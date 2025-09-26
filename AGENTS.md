# Repository Guidelines

## Project Structure & Module Organization
- Primary server entries live at `server.cjs`, `server-secure.cjs`, and `server-optimized.cjs`; wire new features through `src/index*.js`.
- Place business logic under `src/services/`; expose routes, middleware, and utilities from the matching folders within `src/`.
- Keep static frontend assets in `public/`; avoid shipping secrets or generated files there.
- Ad-hoc integration scripts and tests follow the `test-*.js` naming pattern at the repository root or under `src/`.

## Build, Test, and Development Commands
- `npm install` sets up dependencies (Node 16+ required).
- `npm run dev` launches the Nodemon-driven dev server using `server.cjs` with live reload.
- `npm start`, `npm run start:secure`, and `npm run start:optimized` boot the respective production entrypoints.
- `npm run lint` runs ESLint across the backend and `public/js/` to catch style and quality issues.
- `npm run test:performance` exercises the performance suite; trigger ad-hoc scripts via `node test-*.js`.

## Coding Style & Naming Conventions
- JavaScript only; use ESM under `src/` and CommonJS for entry files and configs.
- Format with 2 spaces, include semicolons, and prefer single quotes for strings.
- Name scripts in kebab-case (e.g., `risk-monitor-dashboard.js`) and configs with `.cjs`.
- Keep services stateless and load configuration from `process.env`.

## Testing Guidelines
- Favor focused integration scripts named `test-*.js`; run them with `node path/to/test-file.js`.
- Add Jest-based unit tests when useful (`*.test.js` or `__tests__/`), and pair HTTP route tests with `supertest`.
- Ensure new work keeps `npm run lint` and any relevant test script passing before opening a PR.

## Commit & Pull Request Guidelines
- Write commits in imperative, present tense (e.g., `Fix connection pool retry`); include scope when helpful.
- PRs should link issues, describe verification steps, and attach screenshots for UI-facing changes.
- Note any new env vars, migrations, or operational considerations in the PR description.

## Security & Configuration Tips
- Start from `.env.template`; never commit `.env`, secrets, or tokens.
- Use existing helpers for data access (e.g., `sqlite-cache*.cjs`); avoid ad-hoc SQL or leaking identifiers in logs.
- Ensure Helmet, CORS, and rate-limiting middleware remain enabled in new entrypoints or routes.
