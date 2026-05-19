# Changelog

## v1.0.0 - Production Release

- Added Auto-All UI with polling progress and source lineage.
- Added safe zero-touch data acquisition through PandaScore, GRID, CSStats/csgostats explicit CSV, Steam explicit IDs, Liquipedia MediaWiki, and private inbox evidence.
- Added optional extended data coverage through `data:auto-all:extended`, gated by `ENABLE_RESEARCH_SOURCES`.
- Added optional paid Apify HLTV actor fallback, disabled by default and requiring a local `APIFY_TOKEN`.
- Added Wayback fallback, RSS metadata discovery, sitemap/export discovery, JSON-LD parsing improvements, and community dataset sync, all opt-in.
- Added benchmark and release documentation.
- Kept forecast math, Real Forecast Ready gates, Apply flow, seed behavior, and page-load sync unchanged.

## v0.9.5

- Added `data:auto-all` unified safe auto-fill command.
- Added CSStats/csgostats public team-ID lookup with cache and rate limit.
- Added GRID enhanced matching and Steam supplemental explicit-ID fetcher.

## v0.9.4

- Added `data:auto-fill` with user-provided CSStats/csgostats CSV import.
- Added `data:pipeline --auto-fill`.
- Added PandaScore enhanced wrapper and AWPy batch JSON normalizer.

## v0.9.3

- Added real data completion helpers: CSV templates, reality check, and AWPy JSON normalization.
- Documented the 5-minute private-inbox path to Real Forecast Ready.

## v0.9.2

- Added Policy-Compliant Data Maximizer with safe API-style sources.
- Added Liquipedia MediaWiki roster fallback, GRID series matching, PandaScore optional fetcher, and safe harvester integration.

## v0.9.1

- Added extended analytics and ML preparation.
- Added map pool depth, individual skill factors, feature snapshots, and expanded prediction diagnostics.
