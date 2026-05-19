# Policy Exception: HLTV + Demo Automation (Research Branch)

**Branch:** `research/policy-exception-hltv` / `research/apify-integration`
**Status:** Experimental, NOT for production

This branch explores whether tightly scoped public-page collection can improve CS2 data coverage. It is not part of the production Plan A release and must not be merged without a later explicit policy review.

## Allowed HLTV Operations

Allowed only when both `ENABLE_RESEARCH_SOURCES=true` and `ENABLE_HLTV_AUTOMATION=true`:

1. Match ID resolution
   - `GET https://www.hltv.org/search?query={teamA}+{teamB}`
   - Parse the first confident match result.
   - Cache for 24 hours in `data/research-cache/`.
   - Rate limit: 1 request per 5 seconds.

2. Match page parsing
   - `GET https://www.hltv.org/matches/{id}/{teamA}-vs-{teamB}`
   - Parse veto/pick-ban and recent encounter context only.
   - Output normalized `veto_history.csv` and `h2h.csv`.

3. Team map stats
   - `GET https://www.hltv.org/stats/teams/maps/{teamId}/{teamName}`
   - Parse map win rates and round counts.
   - Output normalized `map_stats.csv`.

4. Team player stats
   - `GET https://www.hltv.org/stats/players?team={teamId}`
   - Parse rating, ADR, KAST, impact and sample maps.
   - Output normalized `player_stats.csv`.

## CSStats Demo Download

Allowed only when `ENABLE_RESEARCH_SOURCES=true` and `ENABLE_CSSTATS_DEMO_FETCH=true`:

- Download at most one `.dem` file per team per match.
- Store raw files only in ignored `data/demos/`.
- Parsed output must go through normalized `parsed_demo_export.json`.

## Apify HLTV Actor

Allowed only on the separate `research/apify-integration` branch and only when `ENABLE_RESEARCH_SOURCES=true`, `ENABLE_APIFY_HLTV_ACTOR=true`, and `APIFY_TOKEN` is configured locally:

- Uses a user-selected paid Apify actor such as `lukas-kremser/hltv-scraper`.
- Actor id is configurable through `APIFY_HLTV_ACTOR_ID`.
- Recent dataset ids are cached for `APIFY_DATASET_TTL_HOURS` in `data/research-cache/apify/` to avoid unnecessary paid runs.
- Apify output is treated as untrusted flexible JSON and must pass the same normalized CSV validation before any private-inbox merge.
- Tokens must never be committed, logged, cached, or pasted into issue text, docs, or screenshots.

## Safety Rules

- One request per page; no pagination and no broad crawling.
- Cache all HTTP responses for 24 hours.
- User-Agent: `CS2MatchPredictionLab/1.0-research (contact: saldinkostya97@gmail.com)`.
- Research fetchers check cached `robots.txt` before public-page requests and skip disallowed paths.
- The research branch does not impersonate Googlebot, Bingbot, AhrefsBot, browser clients, or any other third-party identity.
- Google Cache fallback is intentionally not implemented. The public cache endpoint has been discontinued/unreliable and is not a dependable or appropriate access path for this project.
- Fail closed: parse errors return empty results and warnings, never fake data.
- No local browser automation, Puppeteer, Playwright, Selenium, Telegram scraping, captcha/login/protection bypass, or Cloudflare bypass attempts.
- Apify is allowed only through the explicit paid actor integration above and remains off by default.
- No direct Prisma writes and no Apply calls from research tools.

## Adaptive Multi-Source Fetching

`tools/research/multi-source-fetcher.ts` is research-only. It may try multiple public source descriptors for `roster`, `player_stats`, `map_stats`, `veto`, and `h2h`, but each descriptor must declare:

- Required identifiers. Missing IDs cause a clean `skipped` result; the fetcher does not guess broad searches.
- Allowed hosts and path patterns.
- A parser that returns normalized private-inbox rows only when useful real fields are present.

The fetcher stops at the first source that produces schema-valid rows. Partial rows are reported honestly, and writes go only to `data/private-inbox/` through the existing normalized CSV merge helper. `/admin/imports` remains the only Apply path.

## Archive and Open-Data Fallbacks

Allowed only on `research/fallback-archives` and only behind explicit flags:

- `ENABLE_WAYBACK_FALLBACK=true` permits Wayback Machine lookup through `archive.org/wayback/available` and cached `web.archive.org` snapshots. It is used only for original URLs already declared in source allowlists and caches archived bodies for 7 days.
- `ENABLE_RSS_METADATA_DISCOVERY=true` permits RSS/Atom metadata discovery. RSS items can provide match links/IDs but do not count as Real Forecast Ready evidence unless a later normalized source validates rows.
- `ENABLE_SITEMAP_EXPORT_DISCOVERY=true` permits one cached `/sitemap.xml` request per allowlisted domain to discover export-like CSV/JSON URLs. Pagination and broad crawling remain forbidden.
- `ENABLE_COMMUNITY_DATASETS=true` permits fetching explicit GitHub raw/gist dataset URLs declared in `tools/community-datasets/registry.json`; rows must validate against accepted private-inbox schemas before they are merged.

Still explicitly not implemented: Bing Cache, public proxy fallbacks such as r.jina.ai/Textise, browser or bot User-Agent impersonation, and any Cloudflare/captcha bypass.
