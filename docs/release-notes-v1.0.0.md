# Release Notes: v1.0.0

MVP 1.0.0 is the production release for the CS2 Match Prediction Lab.

## Highlights

- Production prediction engine with existing Real Forecast Ready gates.
- Safe Auto-All data collection through API-style/free sources and normalized private-inbox files.
- Auto-All UI with polling progress and source lineage.
- CSV templates, paste normalizer, AWPy JSON normalizer, and `/admin/imports` validation/apply flow.
- Optional extended sources through `data:auto-all:extended`.

## Optional Extended Coverage

Extended sources are off by default and require explicit env flags:

- `ENABLE_RESEARCH_SOURCES=true`
- `ENABLE_WAYBACK_FALLBACK=true` for Archive.org snapshots.
- `ENABLE_SITEMAP_EXPORT_DISCOVERY=true` for allowlisted export discovery.
- `ENABLE_RSS_METADATA_DISCOVERY=true` for metadata only.
- `ENABLE_COMMUNITY_DATASETS=true` for explicit GitHub raw/gist datasets.
- `ENABLE_APIFY_HLTV_ACTOR=true` plus `APIFY_TOKEN` for the paid Apify HLTV actor fallback.

Apify can incur costs. Keep tokens only in `.env.local`. If a token was pasted into chat, logs, docs, screenshots, or tickets, revoke it and create a new one before running live benchmarks.

## Known Limits

- Without API keys, private-inbox evidence, or Apify, many matches still require manual map/player/veto data.
- RSS metadata does not count as Real Forecast Ready evidence by itself.
- Wayback snapshots can be stale or unavailable.
- Extended sources never call Apply and never save predictions directly.
- Forecast math and RFR gates are unchanged from the stabilized 0.9.x line.
