# Data Coverage Playbook

This guide explains how to raise Real Forecast Ready coverage without changing Apply, prediction gates, or forecast math.

## 1. Start With Safe Sources

Run:

```bash
pnpm data:auto-all -- --matchId pandascore_match_1488973 --teamA "Evo Novo" --teamB "WAZABI" --mode deeper --dry-run
```

If files are produced, review them in `/admin/imports` and Apply only after validation.

## 2. Enable Extended Research Sources

Use `.env.local`, never commit keys:

```env
ENABLE_RESEARCH_SOURCES=true
ENABLE_HLTV_AUTOMATION=true
ENABLE_RSS_METADATA_DISCOVERY=true
ENABLE_SITEMAP_EXPORT_DISCOVERY=true
ENABLE_GOOGLE_CSE_FALLBACK=true
GOOGLE_CSE_API_KEY=""
GOOGLE_CSE_CX=""
ENABLE_COMMUNITY_DATASETS=true
```

Run:

```bash
pnpm data:auto-all:extended -- --matchId pandascore_match_1488973 --teamA "Evo Novo" --teamB "WAZABI" --mode max --dry-run
```

The diagnostic table shows each data type, source, status, reason, rows and next action.

## 3. HLTV Behavior

Direct HLTV research requests use the honest project User-Agent, robots checks, rate limits and cache.

- `403` is cached for 6 hours.
- No browser User-Agent retry is attempted.
- Use Jina Reader, Apify, or manual CSV when direct HLTV is blocked.

## 4. Community Datasets

Only explicit URLs in `tools/community-datasets/registry.json` are fetched. For pre-match evidence, every target row must include `sourceDate` or `collectedAt` at or before the match start. If any target row violates this, the dataset is skipped.

## 5. Demo Exports

Demo downloads are optional and only for completed historical matches. The app does not bundle AWPy, demoinfocs, Python or parser wrappers. Set `RESEARCH_DEMO_PARSER_CMD` to a local command in `PATH` if you want automatic conversion.

## 6. Calibration

Use:

```bash
pnpm model:calibrate
pnpm model:optimize-params
```

The outputs under `data/model/` are ignored local artifacts. They improve backtesting workflows only and do not change production defaults unless an admin explicitly opts into them later.

## 7. Local AI Import Tools

When public sources cannot fill enough blocks, use the local AI assistant as an operator-guided fallback:

- Match pages include `Быстрый AI импорт` for pasted text, OCR text, and editable sheet preview.
- `/admin/ai-batch` processes multiple local text files or ZIP jobs.
- `/admin/ai-dashboard` shows Ollama status, cache stats, usage, and fine-tuning helpers.
- `/admin/ai-history` keeps a redacted extraction history for diagnostics.

See `docs/local-ai-import.md` for setup, privacy limits, and the Apply-only confirmation flow.
