# Changelog

## v1.7.0 - Full Local Automation

- Added safe zero-touch setup, update, doctor, cleanup, scheduler, dependency, and local release helper scripts.
- Added `/admin/health` plus admin APIs for health, automation status, run-once automation, and cleanup.
- Added a local automation runner for extended Auto-All preparation, forecastability cache refresh, match-feature sync, dataset prep, and cleanup without hidden Apply.
- Added guided-safe Ollama setup posture and automation documentation.

## v1.6.0 - Smart Match Analytics

- Added advisory smart analysis fields for similar matches, anomaly detection, model comparison, and data-quality recommendations.
- Added `MatchFeatureHistory` plus `sync:match-features` for explicit finished-match feature caching; no page-load writes are introduced.
- Added `/api/match/[matchId]/similar` and extended `/api/match-analysis/[matchId]?mode=deep&v=2`.
- Added scientific UI blocks for similar matches, anomalies, advisory model comparison, recommendations, and print-friendly HTML report export.
- Added advisory model comparison to `/admin/backtesting` with accuracy, Brier score, log loss, and CSV export.
- Kept `calculatePrediction`, Apply, Real Forecast Ready gates, and production prediction storage unchanged.

## v1.5.0 - AI Dashboard, History, Diagnostics, and Research Merge

- Added `/admin/ai-dashboard` for local Ollama status, model visibility, AI cache stats, extraction usage, and guided fine-tuning actions.
- Added `/admin/ai-history` with paginated local extraction history, redacted/truncated input previews, raw output inspection, CSV export, and bad-example marking.
- Added structured AI extraction diagnostics for disabled Ollama, timeouts, connection failures, invalid JSON, empty sheets, low confidence, and validation errors.
- Added focused research gap-fill support for `data:auto-all:extended` and AI merge/apply preview controls.
- Added AI evidence provenance to scientific analysis so users can see which blocks came from Local AI extraction.

## v1.4.0 - Local AI OCR, Batch Import, and Fine-Tuning Prep

- Added browser-local OCR for screenshots through lazy `tesseract.js`; screenshots stay in the browser and only recognized text is sent to the local AI extraction API.
- Added source detection and adaptive prompt metadata for HLTV, Liquipedia, ESL, BLAST, and unknown copied text.
- Added opt-in timed-confirm Apply for high-confidence extractions; it uses the existing `/api/ai/apply-local` path after a visible cancel window.
- Added `/admin/ai-batch` with client-side ZIP parsing through JSZip, batch progress, cancellation, concurrency limits, and selected Apply.
- Added `ai:prepare-dataset`, `ai:finetune`, and `ocr:local` helpers for local fine-tuning preparation and optional local OCR fallback.
- Added optional accepted-example capture for fine-tuning; no cloud AI SDKs or hosted endpoints are introduced.

## v1.3.0 - Local AI Import Assistant

- Added opt-in local AI extraction through Ollama on `127.0.0.1`, disabled by default behind `ENABLE_LOCAL_AI`.
- Added `Быстрый AI импорт` on match pages for pasted text/HTML/Markdown, editable sheet previews, and explicit analyst-sheet Apply.
- Added local AI cache, technical metrics logs, setup helper, and confirmed-example export script.
- Documented text-first scope and deferred screenshot/OCR support to v1.4.0.

## v1.2.0 - Coverage Push, Research Diagnostics, and Model Calibration

- Added `feat/1.2.0` research coverage plan implementation: HLTV fail-fast 403 cache, capped player-stat pagination, mapstats fallback, shared ID cache, CSE quota guard, and extended diagnostics.
- Added user action loading/logging primitives: reusable async-action hook, disabled/loading buttons for major long-running actions, redacted server JSONL logs, and `user:log:tail`.
- Added one-click extended Auto-All SSE flow on match pages through `/api/auto-all-extended`, with private-inbox-only writes and explicit Apply still required.
- Added community dataset leakage guards: target rows require `sourceDate`/`collectedAt <= match.startTime`; violating datasets are skipped instead of partially merged.
- Added optional external demo parser handling through `RESEARCH_DEMO_PARSER_CMD` without adding parser dependencies to the app.
- Added offline calibration scripts: `model:calibrate` and `model:optimize-params`, plus `/admin/model` reset controls for calibrated weights.
- Added `/lab/explorer` for paginated historical review, reliability bins, and training CSV export.
- Extended scientific factors with map-specific Elo proxy, player-form trend, roster-change risk, H2H last-meeting signal, and first pick/ban tendencies.

## v1.1.0 - Extended Sources and Scientific Analysis

- Added optional `data:auto-all:extended` research flow with Archive.today, Wayback, RSS/Atom metadata, sitemap/export discovery, GraphQL discovery, Google CSE identifier fallback, Jina Reader fallback, and community dataset sync behind explicit env flags.
- Added read-only scientific analysis through `/api/match-analysis/[matchId]?mode=deep&v=1`, including player-map efficiency, team synergy, Elo-style signals, Bayesian map probability, outlier warnings, and weighted model controls.
- Added the `Научный анализ` match-page tab with quality indicators, model-weight controls, heatmap/trend views, parsed-demo round analytics when available, and CSV export.
- Added cache invalidation for analysis results based on analysis version, parameters, and private-inbox fingerprints.
- Documented Google CSE quota handling, Jina response limits, Archive.today/Wayback limits, and realistic non-Apify coverage expectations.
- Kept safe `data:auto-all`, `data:pipeline`, Apply flow, Prisma writes, forecast math, Real Forecast Ready gates, seed behavior, and page-load sync unchanged.

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
