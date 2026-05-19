# Optional Extended Sources: Research Branch Policy

**Branch:** `research/fallback-archives`
**Status:** Experimental, off by default, not part of the safe production auto-all path

The default `data:auto-all` and `data:pipeline` commands stay on the safe free-source path. Extended sources are available only through `data:auto-all:extended` and only when `ENABLE_RESEARCH_SOURCES=true` plus the source-specific flag is set.

## Allowed HLTV Operations

Allowed only when both `ENABLE_RESEARCH_SOURCES=true` and `ENABLE_HLTV_AUTOMATION=true`:

1. Match ID resolution
   - `GET https://www.hltv.org/search?query={teamA}+{teamB}`.
   - Parse the first confident match result.
   - Cache for 24 hours in `data/research-cache/`.
   - Rate limit: 1 request per 5 seconds.

2. Match page parsing
   - `GET https://www.hltv.org/matches/{id}/{teamA}-vs-{teamB}`.
   - Parse veto/pick-ban and recent encounter context only.
   - Output normalized `veto_history.csv` and `h2h.csv`.

3. Team map stats
   - `GET https://www.hltv.org/stats/teams/maps/{teamId}/{teamName}`.
   - Parse map win rates and round counts.
   - Output normalized `map_stats.csv`.

4. Team player stats
   - `GET https://www.hltv.org/stats/players?team={teamId}`.
   - Parse rating, ADR, KAST, impact and sample maps.
   - Output normalized `player_stats.csv`.

## Archive and Open-Data Fallbacks

Allowed only behind explicit flags:

- `ENABLE_WAYBACK_FALLBACK=true` permits Wayback Machine lookup through `archive.org/wayback/available` and cached `web.archive.org` snapshots. It is used only for original URLs already declared in source allowlists and caches archived bodies for 7 days.
- `ENABLE_ARCHIVE_TODAY_FALLBACK=true` permits Archive.today lookup for allowlisted source URLs after existing direct/Wayback options are unavailable. It caches archived bodies for 7 days and fails closed on empty or malformed responses.
- `ENABLE_RSS_METADATA_DISCOVERY=true` permits RSS/Atom metadata discovery. RSS items can provide match links/IDs but do not count as Real Forecast Ready evidence unless a later normalized source validates rows.
- `ENABLE_SITEMAP_EXPORT_DISCOVERY=true` permits one cached `/sitemap.xml` or `/sitemap_index.xml` request per allowlisted domain to discover export-like CSV/JSON URLs. Pagination and broad crawling remain forbidden.
- `ENABLE_GRAPHQL_DISCOVERY=true` permits explicit open GraphQL endpoint checks for known hosts. Unknown schemas, errors, or auth requirements produce skipped reports rather than fake rows.
- `ENABLE_GOOGLE_CSE_FALLBACK=true` permits Google Custom Search based identifier discovery when `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_CX` are configured. Quota errors are reported and redacted.
- `ENABLE_JINA_PROXY_FALLBACK=true` permits Jina Reader fallback only after a direct source fails, only for allowlisted URLs, and only with a 2 MB response cap. It is unsuitable for complex large tables and remains strict opt-in.
- `ENABLE_COMMUNITY_DATASETS=true` permits fetching explicit GitHub raw/gist dataset URLs declared in `tools/community-datasets/registry.json`; rows must validate against accepted private-inbox schemas before merge.

## Scientific Analysis

`/api/match-analysis/[matchId]?mode=deep&v=1` is read-only. It analyzes normalized files already present in `data/private-inbox/` plus optional `parsed_demo_export.json`.

- It performs no network requests.
- It writes only local cache files under ignored `data/analysis-cache/`.
- It never changes Real Forecast Ready gates, forecast math, PredictionPick saves, Prisma data, or Apply behavior.

## Safety Rules

- One request per page; no pagination and no broad crawling.
- Cache all HTTP responses according to each source TTL.
- User-Agent: `CS2MatchPredictionLab/1.0-research (contact: saldinkostya97@gmail.com)`.
- Research fetchers check cached `robots.txt` before public-page requests and skip disallowed paths.
- The research branch does not impersonate Googlebot, Bingbot, AhrefsBot, browser clients, or any other third-party identity.
- Google Cache and Bing Cache fallbacks are intentionally not implemented.
- Fail closed: parse errors return empty results and warnings, never fake data.
- No local browser automation, Puppeteer, Playwright, Selenium, Telegram scraping, captcha/login/protection bypass, or Cloudflare bypass attempts.
- No Apify dependency or Apify actor calls on this branch. Apify remains isolated to the separate `research/apify-integration` path.
- No direct Prisma writes and no Apply calls from research tools.

## Adaptive Multi-Source Fetching

`tools/research/multi-source-fetcher.ts` is research-only. It may try multiple public source descriptors for `roster`, `player_stats`, `map_stats`, `veto`, and `h2h`, but each descriptor must declare:

- Required identifiers. Missing IDs cause a clean `skipped` result; the fetcher does not guess broad searches.
- Allowed hosts and path patterns.
- A parser that returns normalized private-inbox rows only when useful real fields are present.

The fetcher stops at the first source that produces schema-valid rows. Partial rows are reported honestly, and writes go only to `data/private-inbox/` through the existing normalized CSV merge helper. `/admin/imports` remains the only Apply path.
