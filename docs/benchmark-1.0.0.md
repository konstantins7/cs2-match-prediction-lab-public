# MVP 1.0.0 Benchmark

**Date:** 2026-05-19
**Branch:** `release/v1.0.0-plan-b`
**Mode:** `max`, dry-run
**Matches analyzed:** 10

This benchmark is intentionally conservative. It uses the safe `data:auto-all` path for measured match coverage and mocked/dry-run extended checks for Apify behavior. No live paid Apify actor was run because any token pasted into chat must be treated as compromised and rotated first.

## Safe Auto-All Baseline

Command:

```bash
npm run data:benchmark-auto-all -- --limit 10 --mode max --dry-run --out data/reports/benchmark_1_0_0_safe.json
```

Observed summary:

| Metric | Count | Rate |
| --- | ---: | ---: |
| Matches checked | 10 | 100% |
| Real Forecast Ready before | 0 | 0% |
| Nearly Ready before | 1 | 10% |
| Manual fallback required | 10 | 100% |

Top blockers:

1. map stats sample below gate (10)
2. `map_stats.csv` (10)
3. `player_stats.csv` (10)
4. `veto_history.csv` (10)
5. missing player stats (9)

Source hit rates:

| Source | Success | Partial | Skipped | Failed |
| --- | ---: | ---: | ---: | ---: |
| csstats-auto-lookup | 0 | 0 | 10 | 0 |
| grid-enhanced | 0 | 10 | 0 | 0 |
| liquipedia | 0 | 0 | 10 | 0 |
| pandascore-enhanced | 0 | 0 | 10 | 0 |
| steam-web-api | 0 | 0 | 10 | 0 |

## Extended Dry-Run Smoke

Disabled extended sources:

```bash
ENABLE_RESEARCH_SOURCES=false npm run data:auto-all:extended -- \
  --matchId pandascore_match_1488973 \
  --teamA "Evo Novo" \
  --teamB "WAZABI" \
  --mode max \
  --dry-run
```

Observed result: safe auto-fill ran, `researchEnabled=false`, no research/Apify writes.

Extended sources enabled without Apify token:

```bash
ENABLE_RESEARCH_SOURCES=true ENABLE_APIFY_HLTV_ACTOR=false npm run data:auto-all:extended -- \
  --matchId pandascore_match_1488973 \
  --teamA "Evo Novo" \
  --teamB "WAZABI" \
  --mode max \
  --dry-run
```

Observed result: multi-source diagnostics ran, Apify reported `skipped`, and no private-inbox writes were made in dry-run.

## Apify Verification

Live Apify was not run for this release candidate. The integration is verified by mocked fixture tests:

- skipped without `ENABLE_RESEARCH_SOURCES=true`, `ENABLE_APIFY_HLTV_ACTOR=true`, and `APIFY_TOKEN`;
- dataset cache reuse within TTL;
- conservative normalization of roster/player/map/veto/H2H rows;
- no token leakage in errors or warnings.

Operators who want a paid coverage benchmark must rotate/create a fresh Apify token, store it only in `.env.local`, and run `data:auto-all:extended` against a small match set.

## Product Conclusion

- Safe `data:auto-all` remains stable, free, and honest, but without keys or private inbox evidence it does not unlock RFR for the sampled matches.
- Extended sources are wired and off by default. They improve diagnostics and can add rows when identifiers, archive snapshots, community datasets, or Apify are available.
- Apify is the intended paid HLTV fallback for higher coverage, but it is not exercised live in this benchmark.
