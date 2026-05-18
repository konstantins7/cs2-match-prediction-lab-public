# Safe Data Harvesters

Local tools in this folder orchestrate policy-compliant API-style fetchers and write only normalized CSV files to `data/private-inbox/`.

Allowed in MVP 0.9.2:

- Liquipedia MediaWiki API (`action=parse&prop=text`) with User-Agent and rate limit.
- GRID Open Access Central Data / mapped Series State context only.
- PandaScore Free endpoints when configured.
- Valve Rankings through the public Valve/GitHub rankings source.

Forbidden here and in core:

- HLTV automation or direct site requests.
- Telegram scraping.
- Apify.
- Browser automation/crawler packages.
- Captcha/login/protection bypass.
- Unsupported GRID endpoints.
- Fake/imputed data.

Example:

```bash
npm run harvest -- --matchId pandascore_match_1488973 --teams "Evo Novo,WAZABI" --mode fast --dry-run
```
