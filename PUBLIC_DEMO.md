# Public Demo For FACEIT API Review

## Purpose

CS2 Match Prediction Lab is a non-betting research analytics MVP for explainable Counter-Strike 2 match analysis. This public branch is a clean review snapshot with no private Git history, no local database, no runtime logs, no generated build artifacts, and no API keys.

## What Works Without API Keys

- Basic UI and match pages.
- Local demo/seed data.
- Prediction readiness gates.
- Forecast Autopilot UI.
- Provider Capability Probe UI.
- Research Queue.
- Manual real data pack wizard.
- Parsed demo JSON intake.
- Model Lab and feature store views.

## Optional API Keys

- FACEIT: optional public player/team/competition/statistics context.
- GRID: optional deep telemetry if access is approved.
- LiquipediaDB: optional roster/tournament/history context if access is approved.
- PandaScore: optional real fixtures/basic provider data.

All keys must be stored only in a local `.env` file. The public branch includes only placeholder variable names in `.env.example`.

## FACEIT Integration Purpose

FACEIT integration is intended only as an optional public data source for player, team, competition, and statistics context. FACEIT API calls are server-side only. The application does not use FACEIT data for odds, betting advice, staking recommendations, or guaranteed outcomes.

## Security And Compliance

- No betting or odds.
- No HLTV scraping.
- No Telegram scraping.
- No page-load sync.
- No fake real data.
- No sample data counted as real forecast.
- No API keys in source code, README, tests, logs, build artifacts, or committed files.

## How To Run Locally

```bash
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

If pnpm is unavailable, npm can be used:

```bash
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Seeding creates a local SQLite database under `prisma/dev.db`. That database is intentionally ignored and must not be committed.

## What Is Intentionally Excluded From Public Branch

- `.env` and environment-specific files.
- Local SQLite databases such as `prisma/dev.db`.
- `.next/`, build output, traces, and runtime manifests.
- `node_modules/`.
- Runtime logs such as `dev-server.log` and `dev-server.err.log`.
- `tsconfig.tsbuildinfo`.
- API keys, bearer tokens, authorization headers, JWT-like tokens, and other secrets.
