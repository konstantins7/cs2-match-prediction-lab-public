# Policy Exception: HLTV + Demo Automation (Research Branch)

**Branch:** `research/policy-exception-hltv`
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

## Safety Rules

- One request per page; no pagination and no broad crawling.
- Cache all HTTP responses for 24 hours.
- User-Agent: `CS2MatchPredictionLab/1.0-research (contact: saldinkostya97@gmail.com)`.
- Fail closed: parse errors return empty results and warnings, never fake data.
- No browser automation, Puppeteer, Playwright, Selenium, Apify, Telegram scraping, captcha/login/protection bypass, or Cloudflare bypass attempts.
- No direct Prisma writes and no Apply calls from research tools.
