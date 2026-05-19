# Research Benchmark for MVP 1.0.0

**Date:** 2026-05-19
**Branch:** `research/policy-exception-hltv`
**Mode:** `deeper`, dry-run
**Matches analyzed:** 21

This report records observed behavior after adding the non-Apify research slice. It does not assume that research sources improve coverage until real access, keys, or local optional tools are available.

## HLTV Diagnostics

Command:

```bash
ENABLE_RESEARCH_SOURCES=true ENABLE_HLTV_AUTOMATION=true \
npm run data:hltv-diagnostics -- \
  --teamA "Evo Novo" \
  --teamB "WAZABI" \
  --hltvMatchId 12345
```

Observed result:

| Target | Status | Notes |
|--------|--------|-------|
| HLTV search | failed | HTTP 403 Forbidden |
| HLTV match page | failed | HTTP 403 Forbidden |

Conclusion: the research client behaves correctly and fails closed. No browser User-Agent spoofing, cookies, flaresolverr, Cloudflare bypass, parsing, or fake rows were used. The next legal path is to send the access request in `docs/hltv-access-request.md`.

## Auto-All Benchmark Baseline

Command:

```bash
npm run data:benchmark-auto-all -- --limit 50 --mode deeper --dry-run
```

Observed summary from the production-safe benchmark runner with research flags present:

| Metric | Count | Rate |
|--------|-------|------|
| Real Forecast Ready before | 0 | 0% |
| Nearly Ready before | 1 | 5% |
| Manual fallback required | 21 | 100% |
| Average elapsed time | 190 ms | - |

## Top Blockers

1. map stats sample below gate (21 matches)
2. map_stats.csv (21 matches)
3. player_stats.csv (21 matches)
4. veto_history.csv (21 matches)
5. missing player stats (20 matches)

## Source Hit Rates

| Source | Success | Partial | Skipped | Failed |
|--------|---------|---------|---------|--------|
| csstats-auto-lookup | 0 | 0 | 21 | 0 |
| grid-enhanced | 0 | 21 | 0 | 0 |
| liquipedia | 0 | 0 | 21 | 0 |
| pandascore-enhanced | 0 | 0 | 21 | 0 |
| steam-web-api | 0 | 0 | 21 | 0 |

## Research Source Smoke

Command:

```bash
ENABLE_RESEARCH_SOURCES=true ENABLE_HLTV_AUTOMATION=true \
npm run data:auto-all:research -- \
  --matchId pandascore_match_1488973 \
  --teamA "Evo Novo" \
  --teamB "WAZABI" \
  --hltv-match-id 12345 \
  --dry-run
```

Observed source reports before the adaptive multi-source layer:

| Source | Status | Notes |
|--------|--------|-------|
| esport.is-research | skipped/partial | Optional API route is present; no schema-safe rows observed in this environment. |
| bo3-cs2api-research | skipped | Requires local Python `cs2api` and `ENABLE_BO3_CS2API_SYNC=true`. |
| hltv-match-id | success | Explicit match id accepted. |
| hltv-match-page | partial | HTTP 403 Forbidden; no veto/H2H rows. |
| hltv-team ids | missing | No team ids available after blocked match page. |

## Adaptive Multi-Source Smoke

Command:

```bash
ENABLE_RESEARCH_SOURCES=true ENABLE_HLTV_AUTOMATION=true \
npm run data:auto-all:research -- \
  --matchId pandascore_match_1488973 \
  --teamA "Evo Novo" \
  --teamB "WAZABI" \
  --hltv-match-id 12345 \
  --include-h2h \
  --mode max \
  --dry-run
```

Observed result:

| Data type | Status | Primary reasons |
|-----------|--------|-----------------|
| player_stats | failed | All useful descriptors required missing explicit IDs (`hltvTeam`, `csstatsTeam`, `steamId`, player ids). |
| map_stats | failed | Missing team IDs for HLTV/CSStats/FACEIT/Dust2/ESL/BLAST/GosuGamers; Liquipedia API path was skipped by robots; Pley returned HTTP 404. |
| veto | failed | HLTV robots fetch returned HTTP 403; other match-page descriptors required missing explicit match IDs. |
| h2h | failed | HLTV robots fetch returned HTTP 403; Liquipedia API path was skipped by robots; other descriptors were missing IDs or returned HTTP 404. |

Multi-source behavior was still useful diagnostically: it produced source-level reasons (`missing_identifier`, robots disallowed/fetch failed, HTTP blocked, parse empty) without writing files in dry-run and without fabricating rows.

## Product Conclusion

- Non-Apify research infrastructure, including the adaptive multi-source fetcher, is implemented and safe, but the current local environment still has no automatic RFR lift.
- HLTV remains blocked with HTTP 403, so access must be requested rather than bypassed.
- The adaptive layer is now resilient and transparent: descriptors skip when identifiers are missing, paths are checked against robots.txt, and failures are reported per source.
- BO3/cs2api is ready as optional local tooling, but it must be installed and enabled before it can contribute rows.
- Esport.is remains fail-closed: malformed, unavailable, or shape-mismatched responses do not create fake data.
- Manual CSV/paste and private-inbox validation remain the reliable fallback for 1.0.0 until real provider access is available.
