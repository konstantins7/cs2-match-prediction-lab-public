# MVP 1.1.0 Release Notes

MVP 1.1.0 adds optional extended data coverage and a read-only scientific analysis layer while keeping the production-safe forecast path unchanged.

## What is new

- `data:auto-all:extended` can use opt-in research sources: Archive.today, Wayback snapshots, RSS/Atom metadata, sitemap/export discovery, GraphQL discovery, Google CSE identifier fallback, Jina Reader fallback, and community datasets.
- `/api/match-analysis/[matchId]?mode=deep&v=1` returns local-only scientific metrics from normalized private-inbox files.
- The match page includes a `Научный анализ` tab with player-map efficiency, synergy, Elo-style signals, Bayesian map probabilities, quality warnings, model-weight controls, trend views, and CSV export.
- Analysis results are cached under ignored `data/analysis-cache/` and invalidated by analysis version, parameters, and private-inbox file fingerprints.

## How to enable extended sources

Extended sources are off by default. Use `.env.local` and enable only the sources you accept:

```env
ENABLE_RESEARCH_SOURCES=true
ENABLE_ARCHIVE_TODAY_FALLBACK=true
ENABLE_RSS_METADATA_DISCOVERY=true
ENABLE_SITEMAP_EXPORT_DISCOVERY=true
ENABLE_GRAPHQL_DISCOVERY=true
ENABLE_GOOGLE_CSE_FALLBACK=false
GOOGLE_CSE_API_KEY=""
GOOGLE_CSE_CX=""
ENABLE_JINA_PROXY_FALLBACK=false
ENABLE_COMMUNITY_DATASETS=false
```

Example dry-run:

```bash
npm run data:auto-all:extended -- --matchId pandascore_match_1488973 --teamA "Evo Novo" --teamB "WAZABI" --mode max --dry-run
```

Google CSE is quota-limited and should be used only for legal identifier discovery. If the API returns `quotaExceeded`, the tool records a redacted warning and continues.

Jina Reader is strict opt-in, capped at 2 MB, and can return incomplete text for large pages.

## What did not change

- `data:auto-all` remains the safe free/default path.
- `data:pipeline` remains unchanged.
- `/admin/imports` remains the only Apply path.
- No forecast math, Real Forecast Ready gates, Prisma writes, seed data, or page-load sync behavior changed.
- Apify is not included in this non-Apify release path; any paid Apify work remains separate and requires fresh local tokens.

## Known limitations

- Extended non-Apify coverage depends on public identifiers, archived pages, RSS metadata, and community datasets being available.
- Scientific analysis is advisory and cannot make a match Real Forecast Ready by itself.
- Reliable map analysis needs meaningful samples; small samples produce warnings rather than fake confidence.
- Without parsed-demo exports, round-level CT/T and pistol analysis is limited.
