# Full Local Automation

CS2 Match Prediction Lab automation is local-first and conservative. It helps install, diagnose, collect data, refresh caches, clean local artifacts and prepare releases, but it never silently applies analyst sheets or changes prediction gates.

## Quickstart

```bash
pnpm setup:all -- --skip-server
pnpm doctor
pnpm dev
```

`setup:all` is idempotent. It checks Node and pnpm, optionally installs dependencies, runs Prisma setup, creates or merges `.env.local`, checks Ollama, and can pull the configured local model when `--pull-model` is passed.

Ollama is guided-safe by default. If Ollama is missing, the script prints platform commands:

- Windows: `irm https://ollama.com/install.ps1 | iex`
- macOS: `brew install ollama`
- Linux: `curl -fsSL https://ollama.com/install.sh | sh`

Use `--install-ollama` only when you explicitly want the script to try the OS installer.

## Scheduler

```bash
pnpm automation:start
pnpm automation:run-once -- --dry-run
pnpm automation:install-scheduler
```

The scheduler writes state to `data/runtime/automation-state.json` and logs to `data/logs/automation-runner.log`. It can:

- run extended Auto-All for upcoming matches;
- refresh forecastability cache as an explicit automation action;
- rebuild finished-match feature history;
- prepare fine-tuning datasets;
- run cleanup.

It does not call Apply. Files prepared in `data/private-inbox/` still require manual review and confirmation.

## Environment

```env
ENABLE_AUTO_PIPELINE=false
AUTO_PIPELINE_INTERVAL_HOURS=6
AUTO_PIPELINE_MODE=max
AUTO_PIPELINE_DRY_RUN=false
AUTO_PIPELINE_MATCH_LIMIT=10
ENABLE_AUTO_SOURCE_SYNC=false
ENABLE_AUTO_FINETUNE=false
AUTO_CLEANUP_WRITE=false
ENABLE_NOTIFICATIONS=false
```

All automation flags default to safe/off. Research sources still require their existing explicit flags.

## Admin Health

Open `/admin/health` to inspect Node memory, database/log/cache sizes, Ollama status, AI queue stats, last scheduler heartbeat, recent job results, and doctor checks.

API endpoints:

- `GET /api/admin/health`
- `GET /api/admin/automation/status`
- `POST /api/admin/automation/run-once`
- `POST /api/admin/cleanup`

## Cleanup

```bash
pnpm cleanup -- --dry-run
pnpm cleanup -- --write
```

Dry-run is the default. Cleanup targets old logs, expired AI response cache, old AI history archives and stale runtime state.

## Releases

```bash
pnpm release:prepare -- --dry-run --minor
pnpm release:prepare -- --minor
```

The helper verifies the tree, drafts changelog text from recent Conventional Commit messages, bumps `package.json`, commits and tags locally. It only pushes or creates a GitHub release when `--push` or `--github-release` is passed.

## Boundaries

- No hidden Apply.
- No cloud AI SDKs or endpoints.
- No browser automation or scraping bypass.
- No page-load data collection.
- No forecast math or Real Forecast Ready gate changes.
