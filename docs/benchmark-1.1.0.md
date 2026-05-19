# Benchmark Baseline for MVP 1.1.0

**Date:** 2026-05-19
**Branch:** `release/1.1.0` from `research/fallback-archives`
**Mode:** dry-run

This document records measured coverage only. Extended sources are opt-in, and scientific analysis is advisory; it does not change Real Forecast Ready gates.

## Planned Measurement

| Run | Command | Purpose |
|-----|---------|---------|
| Safe baseline | `npm run data:auto-all -- --limit 30 --mode max --dry-run` | Safe production coverage without extended sources |
| Extended non-Apify | `ENABLE_RESEARCH_SOURCES=true ENABLE_ARCHIVE_TODAY_FALLBACK=true ENABLE_RSS_METADATA_DISCOVERY=true ENABLE_SITEMAP_EXPORT_DISCOVERY=true npm run data:auto-all:extended -- --mode max --dry-run` | Optional public fallbacks without paid actors |
| Scientific analysis | `/api/match-analysis/[matchId]?mode=deep&v=1` | Local-only math coverage and performance |

## Acceptance Metrics

| Metric | Safe baseline | Extended non-Apify | Notes |
|--------|---------------|--------------------|-------|
| Roster coverage | measured | measured | Count matches with usable `roster.csv` rows |
| Player stats coverage | measured | measured | Count matches with usable `player_stats.csv` rows |
| Map stats coverage | measured | measured | Count matches with usable `map_stats.csv` rows |
| Veto coverage | measured | measured | Count matches with usable `veto_history.csv` rows |
| H2H coverage | measured | measured | Optional evidence block |
| RFR-ready rate | measured | measured | Reported honestly; no assumed lift |
| Manual fallback required | measured | measured | CSV/paste remains fallback |
| Average runtime per match | measured | measured | dry-run elapsed time |
| Max runtime per match | measured | measured | dry-run elapsed time |

## Current Local Smoke

Command:

```bash
npm run data:benchmark-auto-all -- --limit 30 --mode max --dry-run
```

Observed safe baseline:

| Metric | Count | Rate |
|--------|-------|------|
| Matches analyzed | 16 | - |
| Real Forecast Ready before | 0 | 0% |
| Nearly ready before | 1 | 6% |
| Manual fallback required | 16 | 100% |
| Average runtime per match | 203 ms | - |
| Max runtime per match | 893 ms | - |

Top blockers:

1. map stats sample below gate (16)
2. `map_stats.csv` (16)
3. `player_stats.csv` (16)
4. `veto_history.csv` (16)
5. missing player stats (15)

Extended non-Apify smoke:

```bash
ENABLE_RESEARCH_SOURCES=true ENABLE_ARCHIVE_TODAY_FALLBACK=true ENABLE_RSS_METADATA_DISCOVERY=true ENABLE_SITEMAP_EXPORT_DISCOVERY=true npm run data:auto-all:extended -- --matchId pandascore_match_1488973 --teamA "Evo Novo" --teamB "WAZABI" --mode max --dry-run
```

Observed result:

| Metric | Result |
|--------|--------|
| Safe files before | `roster.csv` |
| Potential writes | 0 |
| Still missing | `map_stats.csv`, `player_stats.csv`, `veto_history.csv` |
| Extended write behavior | dry-run, no private-inbox writes |
| Main reasons | missing source identifiers, robots disallow/403, missing Google CSE key |
| Next action | manual CSV/paste fallback or provide API keys/explicit IDs/community datasets |

The expected non-Apify target remains a realistic 30-40% RFR only when identifiers, snapshots, RSS metadata, or community datasets are available. Without those inputs, the correct behavior is skipped/failed source reports with no fake rows.

## Notes

- Apify is not part of this branch and is not included in this benchmark.
- Google CSE is opt-in and quota-limited; quota errors must be redacted and counted as skipped/fallback.
- Jina Reader is strict opt-in and capped at 2 MB.
- Scientific analysis reads only local normalized files and caches under ignored `data/analysis-cache/`.
