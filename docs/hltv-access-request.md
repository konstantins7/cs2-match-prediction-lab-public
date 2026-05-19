# HLTV Research Access Request

Subject: Request for permission to use limited CS2 statistics access for a research forecasting tool

Hello HLTV team,

My name is Konstantin Saldin, and I am building a local research tool called CS2 Match Prediction Lab. The project helps analysts understand whether a CS2 match forecast is supported by enough real evidence before any prediction is saved. It is a local, non-betting analytics project that focuses on data quality, source transparency, and reproducible feature snapshots.

I am writing to ask whether HLTV can provide permission, guidance, or an approved access path for limited research use of public CS2 statistics. The current project does not try to bypass HLTV protections, does not use browser automation, does not rotate identities, and does not attempt Cloudflare or login/captcha bypasses. Direct automated access currently fails closed when HLTV blocks the request.

The data we would like to use, only with permission, is:

- Match page context: map veto and recent head-to-head context for one explicitly selected match.
- Team map statistics: active-map sample size, wins/losses, win rate, and round context.
- Player statistics: maps played, rating, ADR, KAST, impact, and related public performance fields.
- Team and match identifiers needed to connect those rows to a specific match.

The proposed access pattern is intentionally narrow:

- One request per page and no broad crawling or pagination.
- 24-hour local cache in `data/research-cache/`.
- Rate limit of at least one request every five seconds.
- User-Agent: `CS2MatchPredictionLab/1.0-research (contact: saldinkostya97@gmail.com)`.
- No browser automation, no Cloudflare bypass attempts, no captcha/login bypass.
- Fail closed on blocked or malformed responses; no inferred or fake rows.
- Data would be written only as local normalized CSV for analyst review before import.

If HLTV has an official API, partner data feed, licensing path, attribution requirement, stricter rate limit, or preferred contact for statistics access, I would be grateful for the correct process. I am also happy to provide details about the tool, sample request volume, cache policy, or remove HLTV automation entirely if it is not permitted.

Thank you for your time and for maintaining the CS statistics ecosystem.

Best regards,

Konstantin Saldin
saldinkostya97@gmail.com
