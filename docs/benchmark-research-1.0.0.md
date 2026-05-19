# Research Benchmark for MVP 1.0.0

**Date:** 2026-05-19
**Branch:** `research/fallback-archives`
**Mode:** `max`, dry-run
**Matches analyzed:** 16

This report records observed behavior after adding the non-Apify research fallback archives slice. It does not assume that research sources improve coverage until real access, explicit IDs, keys, archive snapshots, or local optional tools are available.

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
ENABLE_RESEARCH_SOURCES=true \
ENABLE_WAYBACK_FALLBACK=true \
ENABLE_SITEMAP_EXPORT_DISCOVERY=true \
ENABLE_RSS_METADATA_DISCOVERY=true \
ENABLE_COMMUNITY_DATASETS=true \
npm run data:benchmark-auto-all -- --limit 50 --mode max --dry-run
```

Observed summary from the production-safe benchmark runner with research flags present. This runner still measures the production safe auto-fill path, so research fallback archive gains are validated separately in smoke tests below.

| Metric | Count | Rate |
|--------|-------|------|
| Real Forecast Ready before | 0 | 0% |
| Nearly Ready before | 1 | 6% |
| Manual fallback required | 16 | 100% |
| Average elapsed time | 220 ms | - |

## Top Blockers

1. map stats sample below gate (16 matches)
2. map_stats.csv (16 matches)
3. player_stats.csv (16 matches)
4. veto_history.csv (16 matches)
5. missing player stats (15 matches)

## Source Hit Rates

| Source | Success | Partial | Skipped | Failed |
|--------|---------|---------|---------|--------|
| csstats-auto-lookup | 0 | 0 | 16 | 0 |
| grid-enhanced | 0 | 16 | 0 | 0 |
| liquipedia | 0 | 0 | 16 | 0 |
| pandascore-enhanced | 0 | 0 | 16 | 0 |
| steam-web-api | 0 | 0 | 16 | 0 |

## Research Source Smoke

Command:

```bash
ENABLE_RESEARCH_SOURCES=true ENABLE_HLTV_AUTOMATION=true \
npm run data:auto-all:extended -- \
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
npm run data:auto-all:extended -- \
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

## Fallback Archives Smoke

Command:

```bash
ENABLE_RESEARCH_SOURCES=true \
ENABLE_HLTV_AUTOMATION=false \
ENABLE_WAYBACK_FALLBACK=true \
ENABLE_SITEMAP_EXPORT_DISCOVERY=false \
ENABLE_RSS_METADATA_DISCOVERY=false \
ENABLE_COMMUNITY_DATASETS=false \
npm run data:auto-all:extended -- \
  --matchId pandascore_match_1488973 \
  --teamA "Evo Novo" \
  --teamB "WAZABI" \
  --hltv-match-id 1 \
  --mode fast \
  --dry-run
```

Observed result:

| Source | Status | Notes |
|--------|--------|-------|
| wayback_hltv_match_veto | failed | Archive.org had no usable snapshot for the test match URL; no rows were fabricated. |
| wayback_hltv_match_h2h | not reached | The missing block set did not request H2H in this smoke. |
| community-datasets-auto-fetch | skipped | Empty local registry with dry-run produced no writes. |

The fallback archive layer is therefore implemented and fail-closed, but this local smoke did not observe archive-backed RFR evidence. It requires a source URL with an actual Wayback snapshot and enough explicit IDs to reach the relevant descriptor.

## Community Dataset Smoke

Command:

```bash
ENABLE_COMMUNITY_DATASETS=true npm run data:sync-community-datasets -- --dry-run
```

Observed result:

| Metric | Value |
|--------|-------|
| Registry entries checked | 0 |
| Writes | 0 |
| Status | skipped |

The committed registry is intentionally empty. Operators can add explicit, reviewed dataset URLs locally or in a future research commit; rows are still validated against accepted private-inbox schemas before merge.

## Product Conclusion

- Non-Apify research infrastructure, including the adaptive multi-source fetcher and fallback archive layer, is implemented and safe, but the current local environment still has no automatic RFR lift.
- HLTV remains blocked with HTTP 403, so access must be requested rather than bypassed.
- The adaptive layer is now resilient and transparent: descriptors skip when identifiers are missing, paths are checked against robots.txt, and failures are reported per source.
- Wayback, RSS metadata, sitemap/export discovery, and community datasets are gated and fail closed. The latest smoke did not find usable archived evidence for the sample URL.
- BO3/cs2api is ready as optional local tooling, but it must be installed and enabled before it can contribute rows.
- Esport.is remains fail-closed: malformed, unavailable, or shape-mismatched responses do not create fake data.
- Manual CSV/paste and private-inbox validation remain the reliable fallback for 1.0.0 until real provider access is available.
