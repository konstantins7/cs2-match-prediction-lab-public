# CS2 Match Prediction Lab

Локальный исследовательский MVP для объяснимого аналитического прогнозирования официальных матчей CS2.

Это не betting-сайт. В проекте нет odds, ставок, советов по ставкам или гарантий результата. Все выводы отображаются как вероятностная аналитика: вероятность, confidence, risk, факторы, evidence и warnings.

## Запуск локально

```bash
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

Основной package manager проекта - pnpm, что зафиксировано в `packageManager` и `pnpm-lock.yaml`.

Проверки:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Альтернатива через npm/npx, если pnpm недоступен:

```bash
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

## Что есть в MVP 0.8.5

- Next.js App Router, TypeScript, Tailwind CSS.
- Dark Esport Dashboard UX: тёмный graphite/slate интерфейс, cyan/violet/electric-blue accents, user/analyst/advanced modes, Data Depth Meter, Forecast Story и Confidence/Risk explanations.
- Private Normalized Extractor Pack: MVP 0.8.5 добавляет local-only tools в `tools/private-normalizers/`, которые превращают user-pasted table text или локальный CSV/text export в нормализованные `roster.csv`, `player_stats.csv`, `map_stats.csv` и `veto_history.csv` для `data/private-inbox/`. Tools не делают HTTP requests, scraping, browser automation, Apify, crawler/bypass code, DB mutations или direct Apply.
- Auto Data Gap Resolver + Connector Framework + Normalized Extractor Pipeline: MVP 0.8.4 заставляет `Полный анализ` не только показать missing blocks, но и пройти цепочку разрешённых коннекторов, проверить `data/private-inbox/`, записать resolver attempts в timeline и пересчитать анализ после validated records. `ENABLE_TRUSTED_LOCAL_IMPORTS=false` по умолчанию, поэтому private inbox работает как validation preview, пока trusted local mode явно не включён.
- Prediction Lifecycle + Full Analysis Jobs: MVP 0.8.3 сохраняет каждый запуск `Полный анализ` как `AnalysisJob`, пишет persistent timeline steps, может сохранить final `PredictionPick` только до старта матча и только при `Real Forecast Ready=true`, а затем через `resolve_prediction_results` связывает pick с outcome и post-match review.
- User Flow Simplification Phase 1: MVP 0.8.2 оставляет `Полный анализ` главным пользовательским путём, а старые/дублирующие concierge, autopilot, readiness и broad-refresh панели прячет в collapsed Advanced/Analyst sections.
- One-Click Full Match Analysis UX: MVP 0.8.1 упрощает главный путь до `Обновить список матчей` -> `Найти лучший матч для прогноза` -> `Полный анализ`. Страница матча показывает persistent timeline, прогноз или понятные blockers с одним главным следующим действием.
- Match Feed Cache + Diff: MVP 0.8.0 добавляет явную кнопку `Обновить список матчей`, которая обновляет live/upcoming feed только по запросу пользователя, сравнивает новый список с предыдущим и показывает `new / updated / unchanged / stale`.
- Roster/Data Coverage Foundation: MVP 0.7.7 исправляет выбор кандидатов так, чтобы `NEARLY_READY` с высоким coverage outrank low-coverage `BASIC_ONLY`, и показывает real-data foundation coverage: roster, player stats, map stats, veto и GRID mapping.
- Automated Legal Data Autopilot: MVP 0.7.6 добавляет coverage-first выбор лучшего upcoming матча для прогноза без HLTV scraping, browser crawler, Apify, fake data, betting/odds или изменения forecast gates.
- First Real Forecast Pack Workflow: MVP 0.7.5 добавляет строгий путь `manual_real_pack` для первого настоящего прогноза без fake data и без `analyst_sample` как real.
- Source Hunter + JSON-first import profiles: legal/free source suggestions, demo-tool JSON paths, Leetify placeholder, offline research datasets и future parser roadmap без новых парсеров.
- Forecast math, readiness gates, Real Forecast Ready logic, source sync, provider behavior и Prisma schema не меняются; изменения касаются workflow, strict pack validation, preview/reporting и real-vs-sample depth display.
- SQLite + Prisma schema с командами, игроками, матчами, картами, veto, новостями, roster/meta/chemistry и prediction audit моделями.
- Fictional seed data: реальные команды не используются.
- `/`, `/matches`, `/predictions`, `/match/[id]`, `/team/[id]`, `/player/[id]`.
- `/admin/model`, `/admin/backtesting`, `/admin/data-quality`, `/admin/imports`, `/admin/sources`.
- Все прогнозы в UI считаются live через `buildPredictionInput(matchId)` + `calculatePrediction(input)`.
- Automated Data Pipeline layer: source adapters, raw source records, source health, incremental hashes, entity matching, data windows, opponent matchup profiles.
- Free-first real data bring-up: Valve Rankings, Steam/CS Updates, PandaScore Free Fixtures Mode, Manual JSON/CSV import, Parsed Demo JSON import.
- Pro Focus Mode: главная, `/matches` и `/predictions` по умолчанию показывают топовые/значимые матчи, а lower-tier/academy/separate-circuit матчи остаются в БД и доступны через фильтры.
- Prediction Readiness + Research Queue: L0/L1/L2/L3/L4 readiness gate отделяет fixture/basic preview от аналитического прогноза.
- Analyst Data Pack Validation: dev-only sample analyst pack может доказать, что выбранный матч проходит путь L1 -> L3 через roster/player/map/veto/H2H/news enrichment.
- Manual Real Data Pack Workflow: `/admin/research-queue` позволяет собрать match-scoped `manual_real` pack с validation, preview/apply, reset/export, quality metadata и readiness before/after.
- Real Match Data Acquisition Pack: основной wizard для доведения одного реального матча до L2/L3 только через валидные `manual_real`, `parsed_demo` или будущие GRID-style данные. Sample-only L3 не считается real forecast.
- Human-Friendly Auto Research UX: на главной и `/matches` есть кнопка `Обновить всё доступное автоматически`; после обновления появляется Forecast Command Center с понятными статусами, лучшим следующим действием и честным разделением того, что удалось получить автоматически, а что требует data pack или provider access.
- Forecast Concierge: главная и страница матча показывают “что сайт смог получить автоматически”, “что не смог”, “почему”, “лучшее следующее действие” и “где взять недостающие данные”.
- Forecast Autopilot: Best Match Autopilot без `matchId` выбирает лучший upcoming official real candidate, Current Match Autopilot с `matchId` готовит только открытый матч и сравнивает его с global best.
- Full Match Analysis: `full_match_analysis` работает только для текущего `matchId`, не переключает target, не применяет CSV/manual data, использует existing legal refresh/check/prepare/autopilot paths и возвращает timeline: матч, рейтинг, roster, player stats, maps, veto, GRID, FACEIT/Leetify explicit IDs, H2H/news и prediction.
- Data Gap Resolver: `full_match_analysis` вызывает `resolveMatchDataGaps(matchId, mode)`, получает uniform `ConnectorResult` по каждому разрешённому resolver, показывает что уже было в БД, что пытались получить автоматически, что заблокировано и какое одно действие закроет главный gap.
- Provider Capability Probe: `/admin/sources` проверяет, что реально разблокировали PandaScore, Valve, Steam, GRID, Liquipedia, FACEIT и parsed demo.
- FACEIT Context Enrichment: FACEIT используется только server-side как optional context source для выбранного матча и только по явно подтверждённым FACEIT IDs. Manual FACEIT ID import создаёт `EntityAlias`, low-confidence совпадения уходят в `EntityMatchCandidate needs_review`, broad crawl/search отключены.
- GRID Open Access Integration: GRID работает как optional official provider через Central Data / Series State only. Series Events, File Download и Stats Feed отмечены как unavailable on OA и не вызываются.
- Data Onboarding: Kaggle CSV, Leetify, TheSportsDB, Steam auth-code guidance и CS Demo Manager workflow классифицированы как offline/optional/local-only paths, чтобы не смешивать calibration data с live forecast evidence.
- Data Acquisition Playbook: roster/player/map-veto/H2H/news/round-economy получают подсказки “где взять”; HLTV и Telegram остаются manual reference only, без scraping.
- Data Quality Coach: manual data pack wizard предупреждает про маленькую выборку, пустой sourceName, устаревшие данные, низкий confidence, отсутствие veto/map stats и L3 blockers.
- Persistent Feature Store: `MatchFeatureSnapshot` сохраняет ranking/form/player/map-veto/round-economy/context/quality features, `featureCutoffTime`, `featureSourcesJson`, `featureSchemaVersion` и `dataLeakageCheckPassed`.
- Model Lab: `/admin/model-lab` показывает feature snapshots, Source Coverage Matrix, calibration by readiness, data leakage summary и export training dataset CSV.
- News & Insider Intelligence Layer: official/media/manual insider news хранится отдельно через `NewsSource`, `NewsItem`, `NewsImpactSnapshot`; impact жёстко ограничен clamps, rumors в первую очередь повышают risk, а не probability.
- Sync в MVP 0.8.2 запускается только вручную через кнопки, `/admin/imports` или CLI scripts. Page-load sync запрещён; главная, `/matches` и `/predictions` читают сохранённый local cache.
- Source modes and badges: demo, valve rankings, Steam updates, PandaScore free, manual real, parsed demo, analyst sample, Liquipedia limited, FACEIT optional, GRID Open Access, mixed, partial, needs review.

## User Flow Simplification Phase 1

MVP 0.8.2 не меняет API, прогнозную математику, Real Forecast Ready gates, Prisma schema или источники. Это UI-only cleanup после 0.8.1.

Default user flow:

- `/` показывает короткий путь: обновить match feed, найти лучший матч и открыть `Полный анализ`;
- `/matches` показывает controlled `Обновить список матчей`, фильтры, coverage/tier и `Полный анализ`;
- `/predictions` ведёт карточки прогноза в `/match/[id]#full-analysis`;
- `/match/[id]` держит `Полный анализ` как единственный главный CTA/result surface.

Что спрятано в collapsed Advanced/Analyst:

- global one-click refresh / command-center style panels;
- dashboard readiness distribution;
- technical readiness/autopilot details;
- Forecast Concierge duplicate blockers/next-action copy;
- source/data-pack/debug diagnostics.

User-facing statuses остаются человеческими: `Готов к прогнозу`, `Почти готов`, `Только базовый прогноз`, `Недостаточно данных`, `Заблокирован`. Internal readiness labels `L0/L1/L2/L3/L4` остаются только в Advanced/Admin/debug context.

## Prediction Lifecycle + Full Analysis Jobs

MVP 0.8.3 добавляет историю анализа и предиктов поверх существующей прогнозной логики. Forecast math, Real Forecast Ready gates, источники и page-load policy не меняются.

Основной lifecycle:

- пользователь запускает `Полный анализ`;
- приложение создаёт `AnalysisJob` и persistent `AnalysisJobStep` timeline;
- если пользователь явно включил сохранение и `Real Forecast Ready=true`, до старта матча создаётся один final `PredictionPick`;
- повторный анализ не перезаписывает уже сохранённый final pick;
- после матча action `resolve_prediction_results` сравнивает predicted winner с actual winner и записывает `PredictionOutcome`;
- `PredictionErrorAnalysis` хранит reason tags для won/lost/void/unknown без автоматического retraining и без изменения весов.

Правила сохранения final pick:

- `savePrediction=true`;
- матч ещё не начался (`now < match.startTime`);
- `Real Forecast Ready=true`;
- для `matchId` ещё нет final pick.

Если матч live/finished, full analysis может сохранить job/timeline, но не создаёт pre-match final pick. Not-ready анализ сохраняет blockers и next action, но не сохраняет scored prediction.

`/predictions` теперь показывает lifecycle board: активные предикты, ожидающие результата, успешные, ошибочные и требующие ручной проверки результата.

Private extractor interface остаётся безопасным: core app принимает только нормализованные CSV/JSON через existing validation/preview/apply flow. В репозитории нет HLTV scraper, browser crawler, Apify, Telegram scraping, bypass code или crawler config.

## Private Normalized Extractor Pack

MVP 0.8.5 добавляет отдельный local-only слой `tools/private-normalizers/`. Это не provider integration и не scraper: scripts берут только user-pasted table text или local saved CSV/text files и создают normalized CSV для `data/private-inbox/`.

Поддерживаемые outputs:

- `roster.csv`;
- `player_stats.csv`;
- `map_stats.csv`;
- `veto_history.csv`.

`team_form.csv` в 0.8.5 остаётся schema/docs-only: private inbox уже принимает имя файла по contract, но core app пока не имеет standalone apply path для team form CSV.

File write policy:

- default: если target file существует, normalizer останавливается;
- `--append` добавляет rows без второго header;
- `--replace` перезаписывает file;
- `--out <filename>` пишет draft file, но app автоматически увидит только accepted private inbox basenames.

Пример:

```bash
tsx tools/private-normalizers/scripts/normalize_generic_table_paste.ts \
  --type player_stats \
  --matchId pandascore_match_1488973 \
  --teamName "Evo Novo" \
  --sourceName "HLTV copied table" \
  --sourceUrl "https://www.hltv.org/..." \
  --collectedAt "2026-05-17T10:00:00Z" \
  --period "last_3_months" \
  --confidence 65 \
  --input ./tmp/evo_players.txt \
  --out data/private-inbox/player_stats.csv
```

Validation:

```bash
tsx tools/private-normalizers/scripts/validate_normalized_file.ts \
  --type map_stats \
  --input data/private-inbox/map_stats.csv
```

Safety: tools do not make HTTP requests, do not automate browsers, do not call Apify, do not bypass login/captcha/protection, do not write DB records and do not call app Apply. The app continues to handle validation / preview / apply through the existing private inbox and `ENABLE_TRUSTED_LOCAL_IMPORTS=false` remains the default.

## Auto Data Gap Resolver + Normalized Extractor Pipeline

MVP 0.8.4 добавляет resolver поверх `Полный анализ`. Forecast math, Real Forecast Ready gates, source policy, Prisma schema и manual CSV apply-flow не меняются.

Режимы автоматизации:

- Safe mode: API/cache/existing records only. Это режим по умолчанию.
- Trusted local mode: `ENABLE_TRUSTED_LOCAL_IMPORTS=true`; normalized files из `data/private-inbox/` могут auto-apply только после existing validation/preview checks.
- Experimental/private extractors: future/outside core. Core app не хранит scraper code, crawler config или bypass logic.

Resolver output:

- `missingBlocks`;
- `attemptedResolvers`;
- `connectorResults`;
- `recordsCreated` / `recordsUpdated`;
- `stillMissing`;
- `confidenceWarnings`;
- `nextAction`;
- `canRecalculate`;
- `shouldSavePrediction`.

Каждый connector возвращает uniform `ConnectorResult`: `connectorId`, `label`, `dataTypes`, `status`, `recordsCreated`, `recordsUpdated`, `confidence`, `sourceName`, optional `sourceUrl`, `warnings`, `blockers`, `normalizedPayloadSummary`.

Allowed auto-run connector registry:

- PandaScore Free;
- Valve Rankings;
- Steam CS Updates;
- GRID Central Data;
- GRID Series State only with known `gridSeriesId`;
- FACEIT explicit IDs only;
- Leetify explicit IDs only;
- LiquipediaDB only if configured;
- local existing `manual_real` / `parsed_demo` / CSV records;
- private normalized inbox files that already exist and pass validation.

Forbidden in core:

- HLTV automatic scraper;
- Apify;
- browser crawler;
- Telegram scraping;
- unsupported GRID APIs;
- fake/imputed data;
- betting/odds;
- page-load sync.

Private normalized inbox:

- default path: `data/private-inbox/`;
- accepted files: `roster.csv`, `player_stats.csv`, `map_stats.csv`, `veto_history.csv`, `team_form.csv`, `h2h.csv`, `news_events.csv`, `manual_real_pack.json`, `parsed_demo_export.json`;
- `sourceName` required, `sourceUrl` recommended;
- raw HTML, scraper config, Apify tokens and crawler settings are ignored/not accepted as evidence.

Generic website table adapter remains disabled metadata only: no domain-specific selectors, no browser automation dependency, no auto-run in full analysis. Any future output must be draft normalized CSV and must pass validation before Apply.

## One-Click Full Match Analysis UX

MVP 0.8.1 делает default User Mode коротким и продуктовым: главная показывает только основные действия и матчевые блоки, а source/foundation/model/debug детали остаются в свёрнутом `Analyst / Advanced mode`.

Основной flow:

- пользователь открывает главную;
- при необходимости нажимает `Обновить список матчей`;
- выбирает матч из `Матчи сейчас`, `Сегодня`, `Ближайшие` или `Лучшие для прогноза`;
- нажимает `Полный анализ`;
- сайт показывает persistent progress timeline и итог: финальный прогноз или точные blockers.

`Полный анализ`:

- принимает только `matchId` и mode `fast | deep | max`;
- никогда не переключает target на другой матч;
- не применяет CSV/manual data и не вызывает manual apply;
- может использовать только existing legal refresh/check/prepare/autopilot paths;
- строит current match coverage, prediction summary, warnings, blockers и одно главное `primaryNextAction`.

Пользовательские статусы:

- `Готов к прогнозу`;
- `Почти готов`;
- `Только базовый прогноз`;
- `Недостаточно данных`;
- `Заблокирован`.

Технические readiness labels вроде `L0/L1/L2` остаются в advanced/debug details и не являются главным статусом для обычного пользователя.

Если `Real Forecast Ready = true`, результат показывает вероятности команд, confidence, risk, top-5 факторов, map/veto summary и warnings.

Если `Real Forecast Ready = false`, результат показывает `Финальный прогноз пока не готов`, лучший доступный preview, exact blockers, одно главное следующее действие и причину, почему final gates не дают финальный прогноз.

Ограничения неизменны:

- no forecast math changes;
- no Real Forecast Ready gate changes;
- no page-load sync;
- no seed;
- no HLTV/Telegram scraping;
- no browser crawler;
- no Apify;
- no unsupported GRID APIs;
- no fake/imputed data;
- no Kaggle/offline/personal Steam as live evidence.

## Dark Esport Dashboard UX

MVP 0.7.5 делает главный путь похожим на современный esport analytics dashboard, а не на dev/admin tool.

- `User mode` открыт по умолчанию: Матчи, Прогнозы, Задачи, Источники, Модель.
- `Analyst mode` свёрнут: data pack, source coverage, feature snapshot, news/risk, calibration.
- `Advanced mode` свёрнут: Backtesting, Data Quality, Raw diagnostics, Training export, Source jobs.
- На главной есть command center: главный CTA, one-click refresh, пять summary cards, top matches, source readiness strip и next best action.
- На карточках и странице матча показывается `Глубина данных 1–5`: fixture, ranking/basic history, roster/player stats, map/veto, demo/round/economy.
- На странице матча есть Forecast Story: что известно, чего не хватает, почему вероятность такая, что может изменить прогноз и лучшее следующее действие.
- Confidence/Risk теперь объясняются текстом: почему confidence низкий/средний/высокий, почему risk повышен и какие данные снизят risk.
- Visual style: graphite/near-black background, dark slate cards, subtle borders/glow, cyan/violet/electric-blue accents, green ready, yellow basic, orange/red risk, purple sample.
- В интерфейсе нет casino/bookmaker UI, betting flows, odds cards, stake language или обещаний результата.

## Match Feed Cache + Diff

MVP 0.8.0 добавляет controlled match-feed refresh поверх существующих PandaScore Free / source scheduler paths. Страницы не ходят во внешние источники при открытии: `/`, `/matches` и `/predictions` показывают live/upcoming матчи из локальной БД/cache.

Пользовательский flow:

- страница сразу показывает сохранённые live/upcoming матчи;
- пользователь нажимает `Обновить список матчей`;
- система запускает только explicit match-feed sync для live/upcoming;
- до sync и после sync снимается local snapshot;
- diff показывает `new`, `updated`, `unchanged`, `stale/removed`;
- stale/removed матчи не удаляются автоматически и не получают угаданный статус;
- после refresh можно запускать `Найти лучший матч для прогноза` или current-match autopilot.

MVP 0.8.0 переиспользует существующий raw hash guard: `ExternalSourceRecord.hash` и `shouldReconcileRawRecord`. Если provider payload не изменился, record считается unchanged, reconciliation не запускается повторно, а sync summary показывает skipped records.

Ограничения:

- no auto sync on page open;
- no background stale-refresh пока;
- no page-load sync;
- no scraping / Apify / browser crawler;
- no fake/imputed data;
- no forecast math / Real Forecast Ready gate changes;
- no seed.

## Automated Legal Data Autopilot

MVP 0.7.6 добавляет coverage-first autopilot поверх уже существующих legal sources, snapshots, predictions и Real Forecast Ready gates. Это orchestration/scoring/UI layer: он не добавляет новый provider, не меняет forecast math и не снижает readiness gates.

MVP 0.7.7 добавляет Roster/Data Coverage Foundation поверх Autopilot. Reality Check показал, что READY forecast пока нет, top-20 candidates системно упираются в missing roster/player stats/map stats/veto/GRID mapping, а `pandascore_match_1488973` Evo Novo vs WAZABI уже имеет высокий `coverageScore` и `NEARLY_READY`, но заблокирован `Evo Novo maps 4/7` и missing rank/basic context. Поэтому 0.7.7 меняет только ranking/visibility: прогнозная математика и Real Forecast Ready gates остаются прежними.

Два режима:

- `Best Match Autopilot`: вызывается без `matchId`, оценивает upcoming official real matches и выбирает лучший candidate по coverage.
- `Current Match Autopilot`: вызывается с `matchId`, готовит только открытый матч, не переключает цель молча и показывает сравнение с global best.

Coverage score `0..100`:

- fixture/future official real — 15;
- BO3 — 5;
- ranking/basic recent context — 12;
- roster — 12;
- player stats — 14;
- map stats с final gate `mapsPlayed >= 7` per team — 16;
- veto — 12;
- no leakage / no critical `needs_review` / freshness — 8;
- optional GRID/FACEIT/Leetify/H2H/news — 6.

Каждый пункт breakdown показывает `points`, `maxPoints`, `status`, explanation и blocker. Freshness дополнительно показывает `collectedAt`, `sourceDate`, `freshnessDays`, `dataPeriod` и `targetStartTime`. Если у manual source нет `sourceUrl`, это снижает source confidence и показывается как warning, но само по себе не делает candidate `BLOCKED`.

Forecastability tiers:

- `READY` — `Готов к реальному прогнозу`, existing `realForecast.isReady=true`;
- `NEARLY_READY` — `Почти готов`, высокий coverage и один-два конкретных blockers;
- `BASIC_ONLY` — `Только базовый прогноз`, есть fixture/ranking/basic context, но analytical coverage ещё не близко;
- `BLOCKED` — `Заблокирован`, stale/past, leakage, critical `needs_review`, invalid target, non-official или sample/demo/offline-only;
- `NOT_ENOUGH_DATA` — `Недостаточно данных`.

Autopilot selection order в MVP 0.7.7:

- Real Forecast Ready;
- forecastability tier priority: `READY > NEARLY_READY > BASIC_ONLY > NOT_ENOUGH_DATA > BLOCKED`;
- coverageScore;
- Real Data Depth;
- readiness rank;
- BO3;
- match priority;
- nearest valid start time.

Это значит, что `NEARLY_READY 74/100` теперь выбирается выше, чем `BASIC_ONLY 40/100`, не снижая gates и не меняя probability math.

Real-data foundation coverage:

- `/admin/sources` и `/admin/research-queue` показывают counts по READY / NEARLY_READY / BASIC_ONLY / NOT_ENOUGH_DATA / BLOCKED;
- показывают coverage counts: roster, player stats, map stats, veto, GRID mapped;
- показывают top blockers и blocker frequency;
- LiquipediaDB без ключа отображается как setup blocker: roster automation unavailable;
- helper read-only: он не делает sync, rebuild, apply, provider probes или DB writes.

Data completion recommendations:

- missing roster -> `roster.csv` / Liquipedia setup;
- missing player stats -> `player_stats.csv` / parsed demo / Leetify explicit ID;
- map sample `<7` -> `map_stats.csv` / parsed demo / real recent maps;
- missing veto -> `veto_history.csv`;
- no GRID mapping -> map GRID series only if named/confident;
- sourceUrl warning -> add sourceUrl/reference link, warning only.

Для `pandascore_match_1488973` Evo Novo vs WAZABI следующий минимальный шаг: добавить минимум 3 реальные Evo Novo active-pool карты в `map_stats.csv v3`, плюс basic recent/team-form context если он source-visible.

Sync modes:

- `Быстро`: existing DB + lightweight snapshots/predictions/research queue, no broad provider refresh.
- `Глубже`: PandaScore Free, Valve Rankings, Steam CS Updates и GRID Central Data через existing legal paths.
- `Максимум`: provider capability checks и mapped GRID/FACEIT context только если explicit IDs/mappings уже существуют.

Запрещено в Autopilot:

- HLTV scraping;
- browser screenshot crawler;
- Apify;
- Telegram scraping;
- unsupported GRID APIs: Series Events, File Download, Stats Feed;
- fake/imputed data;
- Kaggle/offline datasets или personal Steam demos как live evidence;
- page-load sync;
- betting/odds.

UI:

- на главной кнопка `Найти лучший матч для прогноза`;
- на `/matches` сортировка `лучшие для прогноза` и coverage/tier badges;
- на `/match/[id]` кнопка `Подготовить прогноз для этого матча`, secondary action `Найти матч с лучшими данными`, comparison текущего матча с global best и причина выбора/невыбора;
- на `/admin/sources` показано, как providers contribute to candidate scoring и какие legal-source ограничения действуют.

## First Real Forecast Pack Workflow

MVP 0.7.5 добавляет workflow `Собрать первый реальный прогноз` на странице матча и в `/admin/research-queue`.

- Без реального validated `manual_real`, `parsed_demo` или confirmed GRID payload финальный live status остаётся: `workflow ready = yes`, `first real forecast ready = no`.
- `analyst_sample` и sample-derived L3 не считаются реальным прогнозом.
- `Preview Data Depth` может показывать глубину с sample/dev данными, но `Real Data Depth` считает только non-sample `manual_real`, `parsed_demo`, confirmed GRID или valid provider evidence.
- Для past match, например `pandascore_match_1474573`, workflow является retrospective/backtest reconstruction. Pre-match evidence разрешён только если `sourceDate` / `collectedAt <= match.startTime`.
- Данные после `match.startTime` считаются `post_match_analysis` или `backtest_only` и не могут сделать pre-match `Real Forecast Ready = yes`.
- Пустой template, placeholder rows, `sampleSize=0`, `confidence=0`, invalid maps, team mismatch, future/leakage data и raw-only payload не применяются и не меняют readiness.

Минимальный `manual_real_pack` skeleton:

```json
{
  "type": "manual_real_pack",
  "matchId": "pandascore_match_1474573",
  "sourceName": "",
  "collectedAt": "",
  "period": "",
  "sampleSize": 0,
  "confidence": 0,
  "rosters": {},
  "playerStats": [],
  "mapStats": [],
  "vetoHistory": [],
  "h2h": [],
  "news": []
}
```

## Source Hunter + JSON-first Import Profiles

MVP 0.7.5 добавляет слой `Где взять недостающие данные`: пользователь видит не просто “данных нет”, а легальные пути получить roster, player stats, map/veto, H2H, news, round/economy и ranking.

- `Source Hunter` показывает лучший автоматический источник, лучший бесплатный upload/tool path, лучший ручной источник, нужен ли API key, сложность и ожидаемый эффект.
- Для roster основной маршрут: LiquipediaDB, official team page или manual source.
- Для player stats, map/veto и round/economy основной бесплатный маршрут: Parsed Demo JSON, CS Demo Manager JSON, Awpy JSON, demoparser JSON или demoinfocs JSON.
- Для ranking: Valve Rankings плюс Manual HLTV Top 50 reference. HLTV остаётся `manual_reference` only; Apify/HLTV scraping не подключается к приложению.
- Для news: только official/manual reference. Telegram остаётся manual/reference only, без scraping/private channel collection.

Import profiles в 0.7.5 являются JSON-first:

- Manual Real Pack JSON и Parsed Demo JSON используют существующий strict validate/preview/apply flow.
- CS Demo Manager export, Awpy output, demoparser output и demoinfocs output — instruction profiles only: пользователь нормализует JSON и загружает его в существующий intake.
- Leetify Public API показан как placeholder: explicit player/profile context only, attribution required, privacy dependent, no broad crawl, no automatic sync, not Tier-1/deep provider.
- FACEIT остаётся explicit ID context only и не делает Real Forecast Ready сам по себе.
- Liquipedia roster profile активируется только при configured API key и соблюдении limits.

Future parser roadmap:

- XLSX parser: future/inactive.
- SQL import: future/inactive.
- Raw `.dem` parser worker: future/inactive.
- Текущий MVP не добавляет heavy parser dependencies, не запускает parser worker и не делает broad crawl.

Offline research datasets на `/admin/model-lab` помечены как `training/calibration only`: Kaggle/CS:GO datasets требуют license check и не являются live forecast source.

## Data Onboarding

MVP 0.7.5 добавляет безопасный onboarding layer для новых данных и ключей без изменения prediction behavior.

- Kaggle CSV (`results.csv`, `players.csv`, `picks.csv`, `economy.csv`) используются только как offline calibration/training candidates. Они не пишут `Match`, `Team`, `Player`, scoped forecast records, prediction audit или source coverage и не могут поднять `Real Forecast Ready`.
- `/admin/model-lab` содержит inspect-only CSV metadata inspector: rows, columns, date range, top maps, top teams/events и warnings считаются динамически из загруженного/pasted CSV. Row counts/date ranges не хардкодятся как постоянная истина; текущие локальные значения можно рассматривать только как observed sample.
- Leetify показан как optional player/profile context: developer page `https://leetify.com/app/developer`, base URL `https://api-public.cs-prod.leetify.com`, `/api-key/validate`, server-side key header guidance, explicit `steam64_id` / Leetify ID only, attribution required, privacy dependent, no broad crawl.
- TheSportsDB остаётся disabled-by-default low-priority metadata fallback: free key хранится в `.env`, coverage probe проверяет только teams/events metadata и не используется для player stats, map/veto, round/economy или readiness.
- Steam auth code не добавляется в `.env.example` даже как placeholder. Это local-only доступ к personal match history/demo pipeline, не источник pro forecast. Если код был раскрыт, его нужно rotate/regenerate.
- CS Demo Manager path: анализируйте исторические демки текущего состава, экспортируйте JSON/CSV и загружайте через Parsed Demo Export Intake или CSV/TSV Analyst Sheet Import. Target match demo после старта не может быть pre-match evidence.
- GRID Match Mapping остаётся future/blocked для случаев, когда GRID Central Data отдаёт `TBD-1 vs TBD-2`: low-confidence mapping не auto-linked и не создаёт fake scoped records.

## Parsed Demo Export Intake

MVP 0.7.5 добавляет dedicated JSON-first intake для prepared demo/stat exports. Это не raw `.dem` parser worker: приложение принимает только JSON, который пользователь подготовил во внешнем tool или вручную нормализовал в canonical format.

Supported `sourceTool`:

- `cs_demo_manager`;
- `awpy`;
- `demoparser`;
- `demoinfocs`;
- `custom`.

Canonical input:

```json
{
  "type": "parsed_demo_export",
  "sourceTool": "custom",
  "matchId": "pandascore_match_1474573",
  "dataRole": "historical_team_form",
  "sourceName": "Analyst demo export",
  "collectedAt": "2026-05-01T10:00:00.000Z",
  "period": "last_30_days",
  "sampleSize": 6,
  "confidence": 0.74,
  "teams": [],
  "players": [],
  "maps": [],
  "rounds": [],
  "economy": [],
  "pistol": [],
  "overtime": [],
  "vetoHistory": [],
  "h2h": [],
  "teamForms": []
}
```

Required fields: `type="parsed_demo_export"`, `sourceTool`, `matchId`, `dataRole`, `sourceName`, `collectedAt`, `period`, `sampleSize > 0`, `confidence > 0`, `teams`, `players` and at least one useful stat block.

Validation rejects empty/template/raw-only payloads, placeholder teams/players, unknown map names, invalid numeric stats, team mismatch, future leakage, and target-match post-start data used as `pre_match_evidence`.

Data roles:

- `pre_match_evidence` and `historical_team_form` can contribute to pre-match prediction only when `sourceDate` / `collectedAt <= targetMatch.startTime`.
- `post_match_analysis` is stored for after-match review and backtesting, but not used as pre-match evidence.
- `backtest_only` is excluded from live forecast and used only for model checks.

Apply behavior: valid payloads create `ExternalSourceRecord` plus scoped `PlayerStatSnapshot`, `TeamMapStat`, `TeamFormSnapshot`, `VetoPattern` and `HeadToHead` rows where data exists. Forecast-affecting records include `matchId`, `sourceRecordId`, `importBatchId`, `sourceMode="parsed_demo"`, `dataRole`, `collectedAt`, `sourceDate`, `isActive` and `dataLeakageCheckPassed`.

Parser roadmap remains inactive in this MVP:

- XLSX parser: future/inactive.
- SQL import: future/inactive.
- Raw `.dem` parser worker: future/inactive.

## CSV/TSV Analyst Sheet Import

MVP 0.7.5 добавляет CSV-first import для `manual_real` данных. Это удобный табличный вход поверх существующего `manual_real_pack` flow: пользователь скачивает шаблон, заполняет его в Excel / Google Sheets / WPS, сохраняет как CSV/TSV или вставляет copy-paste table, затем запускает Validate -> Preview -> Apply.

Поддерживается:

- comma CSV;
- semicolon CSV;
- tab TSV;
- UTF-8 BOM;
- quoted values;
- copy-paste tables;
- decimal comma for semicolon CSV, например `1,12` -> `1.12`.

Sheet templates:

- `roster.csv`: `matchId,teamName,nickname,role,country,sourceName,collectedAt,period,sampleSize,confidence`
- `player_stats.csv`: `matchId,teamName,nickname,maps,kills,deaths,assists,kd,rating,adr,kast,impact,openingKills,openingDeaths,clutchesWon,clutchesAttempted,sourceName,collectedAt,period,sampleSize,confidence`
- `map_stats.csv`: `matchId,teamName,mapName,mapsPlayed,wins,losses,winRate,roundsWon,roundsLost,ctRoundWinRate,tRoundWinRate,pickRate,banRate,deciderRate,sourceName,collectedAt,period,sampleSize,confidence`
- `veto_history.csv`: `matchId,teamName,mapName,sampleSize,pickRate,banRate,deciderRate,sourceName,collectedAt,period,confidence`
- `h2h.csv`: `matchId,date,teamA,teamB,winner,format,mapName,scoreA,scoreB,rosterSimilarity,sourceName,collectedAt,period,sampleSize,confidence`
- `news_events.csv`: `matchId,sourceName,sourceType,title,summary,publishedAt,affectedTeam,affectedPlayer,eventType,reliability,impactScore,confidence`

Combined import session на странице матча и в `/admin/research-queue` хранится только в UI state: можно загрузить несколько sheets, увидеть covered/missing blocks, preview combined `manual_real_pack` и применить его только после valid validation. Шаблоны содержат placeholder values и не применяются как real data, пока пользователь не заменит их реальными значениями.

XLSX parser, SQL import и raw `.dem` worker остаются future/inactive. В MVP 0.7.5 нет новых heavy parser dependencies, нет scraping, нет page-load sync, и forecast math / Real Forecast Ready gates не меняются.

## First Real Data Attempt

MVP 0.7.5 фиксирует First Real Data Attempt: первый прикладной путь к real forecast через уже существующий CSV/TSV analyst sheet flow. Default target для проверки workflow:

- `matchId`: `pandascore_match_1488973`;
- команды: `Evo Novo` vs `WAZABI`;
- формат: `BO3`;
- startTime: `2026-05-21T18:00:00.000Z`;
- status/source: `upcoming` / `pandascore_free`.

Перед работой приложение проверяет, что target match всё ещё future относительно текущего времени, имеет `status=upcoming` и canonical team name `WAZABI`. Если матч перестал быть future/upcoming, live forecast flow останавливается и показываются ближайшие реальные future matches для выбора.

Для попытки получить `Real Forecast Ready = yes` нужны реальные CSV/TSV данные, минимум:

- `roster.csv`;
- `player_stats.csv`;
- `map_stats.csv`;
- `veto_history.csv`.

`h2h.csv` и `news_events.csv` остаются optional: они улучшают context/risk, но не заменяют roster/player/map/veto coverage. Если реальные sheets не загружены, workflow считается готовым технически, но live статус остаётся честным: `workflow ready = yes`, `Real Forecast Ready = no`, а UI показывает exact blockers.

В MVP 0.7.5 кнопки copy/download в analyst sheet UI умеют генерировать target-specific CSV templates для `pandascore_match_1488973`, `Evo Novo` и `WAZABI`. Эти templates специально оставляют placeholder players/source metadata, `sampleSize=0` и `confidence=0`, поэтому они не проходят validation как real evidence, пока пользователь не заменит строки настоящими данными.

Apply в MVP 0.7.5 не создаёт отдельный ingestion path. Валидные sheets конвертируются в existing `manual_real_pack`, затем используются existing validation/apply, scoped records, lineage, snapshots, feature snapshots, predictions и research queue refresh. CSV templates — только структура; placeholder rows не применяются как real data.

## Как пользоваться сайтом

Основной путь пользователя в MVP 0.7.5:

1. Откройте главную страницу `/` и нажмите `Обновить всё доступное автоматически`.
2. Если не хочется разбираться, нажмите `Получить лучший возможный прогноз сейчас`. Режим `Быстро` использует только free/basic источники; `Глубже` добавляет подключённые API; `Максимум` ведёт к wizard/manual/parsed demo без fake data.
3. Сайт server-side выполнит PandaScore Free Fixtures, Valve Rankings, Steam/CS Updates, snapshots, predictions и обновление research queue.
4. Выберите матч в `/matches` или `/predictions`.
5. На странице матча нажмите `Подготовить прогноз` или Autopilot.
6. Если статус остаётся `Не готов` или `Слабый сигнал`, нажмите `Создать data pack` и добавьте ручные реальные данные: состав, player stats, map stats, veto, H2H и новости.

Важно: “автоматически” означает только бесплатные/basic источники. Roster/player/map/veto deep data не выдумываются и не подтягиваются через запрещённый scraping. Для аналитического прогноза нужны `manual_real`, `parsed_demo` или будущий разрешённый provider data.

FACEIT в MVP 0.7.5:

- `FACEIT_API_KEY` хранится только в локальном `.env` и используется server-side.
- FACEIT enrichment запускается вручную на странице матча кнопкой `Обогатить FACEIT context`.
- Приложение не ищет игроков по nickname, не ищет команды по name и не делает mass crawl FACEIT players/teams/matches.
- Если FACEIT ID неизвестен, создаётся `needs_review` candidate; новые команды/игроки автоматически не создаются.
- FACEIT context может улучшить source coverage/confidence explanation, но не заменяет roster/map/veto/deep telemetry и не делает `Real Forecast Ready = yes` сам по себе.

GRID Open Access в MVP 0.7.5:

- `GRID_API_KEY` хранится только в локальном `.env` и используется server-side через `x-api-key`; ключ не выводится в UI, logs, SourceHealth, DataSyncJob, README или tests.
- Allowed endpoints:
  - Central Data API: `https://api-op.grid.gg/central-data/graphql`;
  - Series State API: `https://api-op.grid.gg/live-data-feed/series-state/graphql`.
- Unsupported on Open Access и не вызываются приложением: Series Events API, File Download API, Stats Feed и другие неподтверждённые paid/deep endpoints.
- Capability probe сначала проверяет Central Data через safe `allSeries`, берёт known series id из доступного окна и только потом проверяет Series State. Если series id нет, Series State получает статус `pending`, не `failed`.
- Central Data sync использует окно previous 7 days / next 7 days, сохраняет raw `ExternalSourceRecord`, пытается связать series с существующим Match по alias или team/tournament/time confidence и low-confidence совпадения отправляет в `EntityMatchCandidate needs_review`.
- Для ручного связывания используется existing alias mapping: `matchId -> gridSeriesId` через `EntityAlias` (`entityType="match"`, `source="grid"`).
- Series State enrichment запускается только вручную на выбранном матче и только при known GRID series id. Если target match уже started/finished, данные сохраняются как `post_match_analysis` или `backtest_only`, но не используются как pre-match evidence.
- GRID OA может улучшить source coverage, Real Data Depth и scoped team/player context, но не обходит Real Forecast Ready gates, не заменяет missing map/veto и не игнорирует leakage/needs_review/dataQuality thresholds.

Главное меню:

- `Матчи` — список матчей и фильтры Pro Focus / All real / Sample.
- `Прогнозы` — карточки прогнозов с readiness и Real Forecast Ready.
- `Задачи` — “Мои задачи по прогнозам” и data pack builder.
- `Источники` — состояние PandaScore, Valve, Steam/CS Updates и диагностика.
- `Модель` — Model Lab: feature store, source coverage, calibration и dataset export.

Backtesting, Data Quality и raw diagnostics остаются доступны, но не являются главным пользовательским маршрутом.

### Работа без дополнительных API

Если GRID, LiquipediaDB и FACEIT не подключены, это не ошибка. Сайт честно работает в basic/free режиме:

> Сайт работает в basic free mode. Автоматически доступны матчи, рейтинги, патчи и basic history. Для аналитического прогноза добавьте manual data pack или parsed demo.

Кнопка `Обновить всё доступное автоматически` не обещает полный аналитический прогноз. Она запускает только разрешённые и настроенные источники: PandaScore Free, Valve Rankings, Steam/CS Updates, existing manual/reference/parsed data, snapshots, feature snapshots, news snapshots, predictions и задачи по прогнозам.

После one-click обновления UI показывает:

- что автоматически удалось: получить матчи, обновить рейтинги, проверить патчи, пересчитать прогнозы;
- что автоматически недоступно: составы, player stats, map/veto, round/economy;
- почему: эти данные недоступны в текущих бесплатных источниках, поэтому нужны `manual_real` data pack, parsed demo или подключённые GRID/Liquipedia/FACEIT.

Forecast Command Center на главной группирует матчи как `Реальные прогнозы готовы`, `Базовые прогнозы`, `Нужно одно действие`, `Нужно подключить источник`, `Нужно загрузить demo`. Forecast Concierge дополнительно объясняет маршрут: что уже получено, что не получилось автоматически, где взять недостающие данные и какую кнопку нажать дальше. На странице матча показывается одно главное действие: добавить составы, загрузить parsed demo, подключить GRID, добавить map/veto или подтвердить рейтинг команды.

`/admin/sources` содержит Source Acquisition Playbook `Как получить больше данных`: GRID Open Access, LiquipediaDB, FACEIT API, Parsed Demo, Manual HLTV Top 50 и future providers. Для каждого источника показывается польза, статус, приоритет, действие пользователя, ограничения и forbidden actions. GRID/Liquipedia/FACEIT без ключей не считаются ошибкой.

GRID Open Access key хранится только локально в `.env`:

```env
GRID_API_KEY="<local key only>"
ENABLE_GRID_SYNC=true
LEETIFY_API_KEY="<local key only>"
ENABLE_LEETIFY_SYNC=false
THESPORTSDB_API_KEY="<local key only>"
ENABLE_THESPORTSDB_SYNC=false
```

`.env.example` остаётся placeholder-only:

```env
GRID_API_KEY=""
ENABLE_GRID_SYNC=false
LEETIFY_API_KEY=""
ENABLE_LEETIFY_SYNC=false
THESPORTSDB_API_KEY=""
ENABLE_THESPORTSDB_SYNC=false
```

Не вставляйте реальные ключи или Steam auth code в README, tests, source code или logs. `.env` не коммитится. Steam auth code не добавляется в `.env.example` даже как placeholder.

## Pro Focus Mode

MVP 0.7.5 сохраняет отдельный слой видимости и приоритизации матчей. Он не удаляет данные и не влияет на математическую уверенность прогноза: это только UI/filtering слой поверх сохранённых матчей.

Default UI показывает:

- команды с релевантным top-50/top-100 ranking signal;
- команды из Pro Team Watchlist, если это не academy/lower-tier вариант;
- известные турниры и LAN/playoff контекст;
- pinned матчи выше обычных, но без искусственного повышения `confidenceScore` или probability.

Default UI скрывает:

- `lower_tier`;
- `academy`;
- `separate_circuit`;
- `needs_review`;
- матчи без top-100 сигналов и без известного турнира.

Скрытые матчи остаются в SQLite и доступны через фильтры `All real`, `Низший тир / академки`, `Отдельный контур`, `Demo`, `Needs review`.

Новые модели данных:

- `TeamRankSnapshot` хранит ranking snapshots из `valve_rankings`, `hltv_manual_reference`, `manual` или `unknown` с `rankingDate`, `rankCategory`, `confidence` и freshness logic. Rankings старше 30 дней теряют priority/confidence, старше 60 дней помечаются как stale.
- `TournamentProfile` хранит tier, known/qualifier/academy/regional/separate-circuit flags и `importanceScore`.

HLTV ranking не скрейпится. Для HLTV есть только manual reference import через CSV/JSON:

```csv
rank,teamName,hltvReferenceUrl,rankingDate
1,Team Name,https://www.hltv.org/team/...,2026-05-12
```

```json
{
  "source": "hltv_manual_reference",
  "rankingDate": "2026-05-12",
  "teams": [
    {
      "rank": 1,
      "teamName": "Team Name",
      "hltvReferenceUrl": "https://www.hltv.org/team/..."
    }
  ]
}
```

Low-confidence matching создаёт `EntityMatchCandidate needs_review`; дубли команд автоматически не создаются.

Third-party HLTV scraper actors, including Apify HLTV Team Ranking actors, are not connected to the app under the current policy. If a user runs external tooling outside the app, only the resulting manually reviewed CSV/JSON may be pasted into the HLTV manual reference import; the app does not store Apify tokens and does not call Apify or HLTV for this source.

## Analyst Data Pack Validation

MVP 0.7.5 сохраняет controlled analyst workflow. Sample pack остаётся dev-only proof-flow, а manual real pack — отдельный путь для вручную проверенных реальных данных по одному выбранному матчу: research queue -> validate -> preview -> apply -> snapshots -> prediction audit -> readiness before/after.

Безопасный default:

```env
ENABLE_ANALYST_SAMPLE=false
```

В production/real-use режиме sample generator должен оставаться выключенным. Для локальной проверки pipeline можно стартовать dev server с `ENABLE_ANALYST_SAMPLE=true`.

Разделение sources:

- `analyst_sample` / `SAMPLE DATA` — dev-only validation pack. Скрыт из default `/`, `/matches`, `/predictions`, исключён из real actionable metrics и real backtesting. На `/match/[id]` показывается только с большим предупреждением.
- `manual_real` / `MANUAL REAL` — вручную внесённые реальные данные. Пользователь отвечает за проверку источника.
- `parsed_demo` — данные из parsed demo JSON.
- GRID/Liquipedia/PandaScore/Valve/Steam — внешние source layers.

Sample pack всегда match-scoped: записи, которые могут влиять на прогноз (`Player`, `PlayerStatSnapshot`, `TeamMapStat`, `VetoPattern`, `HeadToHead`, `NewsItem`), получают `matchId`, `importBatchId`, `sourceRecordId`, `source="analyst_sample"` и `isActive=true`. `buildPredictionInput(matchId)` использует `analyst_sample` только для того же `matchId`, поэтому sample данные одного матча не загрязняют другие матчи тех же команд.

Reset sample data:

- `/admin/research-queue` содержит кнопку `Reset sample data for selected match`;
- reset деактивирует только `analyst_sample` records для выбранного матча;
- `manual_real`, `parsed_demo`, PandaScore, Valve, Steam и другие реальные записи не удаляются.

Manual Real Data Pack:

- `/admin/research-queue` содержит основной Real Data Acquisition Pack Wizard: team identity/rank, roster, player stats, map stats, veto, H2H, news/events и final readiness recalculation.
- Каждый блок требует `sourceName`, `collectedAt`, `period`, `sampleSize`, `confidence`, `notes`; `sourceUrl` optional, но отсутствие URL снижает source confidence.
- Raw-only import не повышает readiness. Readiness меняется только после создания domain records: `Player`, `PlayerStatSnapshot`, `TeamMapStat`, `VetoPattern`, `HeadToHead`, `NewsItem`.
- `manual_real` records match-scoped через `matchId/importBatchId/sourceRecordId`; reset manual_real деактивирует только выбранный матч и не трогает sample или внешние источники.
- Export current data pack JSON выгружает текущие manual_real records для повторного редактирования и импорта.

## Real Match Data Acquisition Pack

MVP 0.7.5 не утверждает, что реальный прогноз получен, пока пользователь не внёс валидный `manual_real`, `parsed_demo` или confirmed GRID data pack. Workflow может быть полностью готов технически, но статус `First real forecast ready` остаётся `no`, если реальные данные не применялись.

Data roles для `parsed_demo` и `manual_real`:

- `pre_match_evidence` — данные, собранные до старта целевого матча и пригодные для pre-match forecast.
- `historical_team_form` — историческая форма/карты/игроки из прошлых матчей, пригодные только если `sourceDate <= targetMatch.startTime`.
- `post_match_analysis` — разбор уже сыгранного целевого матча; не используется для pre-match forecast этого же матча.
- `backtest_only` — данные только для post-match/backtesting, не для live real forecast.

Leakage rules:

- Для будущего матча используются только records с `collectedAt/sourceDate <= match.startTime`.
- Parsed demo самого целевого матча после `startTime` не может повышать readiness для pre-match forecast этого же матча.
- Нарушение cutoff ставит `dataLeakageCheckPassed=false` и исключает запись из real forecast и training export.
- Raw-only parsed/demo/manual imports не повышают readiness; нужны валидные domain records.

Manual Real Pack Quality считается по шкале `0..100`:

- roster coverage;
- player stats coverage;
- map stats coverage;
- veto coverage;
- H2H/news checked;
- freshness;
- source confidence;
- sample adequacy;
- metadata completeness.

Пороги:

- `<40` — не поднимать выше L1/L2;
- `40..64` — максимум L2 / L3 partial;
- `65+` — L3 analytical allowed;
- `80+` — L3 strong;
- L4 — только parsed demo / round / economy depth.

No-fake-data protection отклоняет apply, если payload похож на шаблон: `player1/player2/player3`, `Team Name`, `Example`, пустой `sourceName`, `sampleSize=0`, отсутствующий `confidence`, all-zero stats, placeholder rows или пустые массивы. Ошибка: `Похоже, что это шаблон, а не реальные данные.`

`Real Forecast Ready = yes` только если:

- readiness `>= L3`;
- источник не sample-only и содержит validated `manual_real`, `parsed_demo` или confirmed GRID-style data;
- нет critical `needs_review`/source conflict;
- есть player/map/veto coverage или проверенный parsed_demo/GRID substitute для veto;
- `dataQualityScore >= 50`;
- `Manual Real Pack Quality >= 65` или есть scoped deep real data;
- `dataLeakageCheckPassed=true` и cutoff соблюдён.

Если L3 достигнут только через `analyst_sample`, UI показывает: `Сейчас L3 достигнут только через SAMPLE DATA. Реальный прогноз не готов.`

## News & Insider Intelligence Layer

MVP 0.7.5 сохраняет отдельный слой новостей и событий, который влияет на `risk`, `confidence` и ограниченно на probability. Новости не перебивают математические факторы и не используются как betting/odds signal.
Manual news placeholder protection отклоняет шаблонные новости вроде `Roster update`, `Short official note`, `Official team site`, `Team Name`, `Example`, пустой `sourceName`, пустой `summary` или template URLs. Такие записи не становятся active real `NewsItem` и не используются в prediction.

Новые модели:

- `NewsSource` — источник новости: official team/player/tournament/Valve, media/reference, HLTV manual reference, Telegram insider manual, community rumor или manual note. По умолчанию manual-only, scraping disabled.
- `NewsItem` — конкретная новость или signal с `sourceTier`, `reliabilityScore/confidence`, `impactDirection`, `impactScore`, `riskScore`, `expiresAt`, `sourceMode` и raw JSON.
- `NewsImpactSnapshot` — match/team snapshot: `totalImpact`, `totalRisk`, `confirmedImpact`, `rumorImpact`, `confidence`, warnings и список использованных news ids.

Reliability tiers и clamps:

- Tier 1 Official: reliability `90..100`, max probability impact `±12`.
- Tier 2 Media/reference: reliability `70..90`, max `±8`.
- Tier 3 Insider: reliability `40..75`, max `±5`.
- Tier 4 Rumor/social: reliability `10..40`, max `±3`.
- Unknown: max `±2`.
- Total news impact per match/team clamp: `±12`.

Rumor/social signals в первую очередь повышают `riskScore`; expired news показываются как ignored/expired и не влияют на probability. Low reliability снижает confidence.

Manual imports:

- `/admin/research-queue` и `/admin/sources` имеют `Manual News Import`.
- HLTV разрешён только как ручной reference import (`sourceType=hltv_manual_reference`, `sourceMode=manual_reference`). Scraping HLTV запрещён.
- Telegram/newcsgo/OverDrive/insider signals разрешены только как manual note (`sourceType=telegram_insider_manual`, `sourceMode=manual_reference`). Массовый Telegram scraping и private channels запрещены.
- `ENABLE_TELEGRAM_NEWS_SYNC=false` по умолчанию. Adapter существует только как disabled skeleton для будущего official API/bot/user-approved flow; Telegram data не используется для ML training/fine-tuning.

Research Queue для матчей ниже L3 добавляет задачи: проверить official team news, roster/stand-in news, добавить insider signal при необходимости, HLTV manual reference и Telegram insider manual note.

## Data Source Expansion и Feature Store

MVP 0.7.5 сохраняет научный слой поверх rule-based prediction:

- `MatchFeatureSnapshot` — persistent feature store, не computed-only. Снимок хранит `modelVersion`, `featureSchemaVersion`, `readinessLevel`, `sourceMode`, `dataQualityScore`, `featureCutoffTime`, `dataLeakageCheckPassed`, `missingCriticalDataJson`, `sourceConfidence`, `sampleSizeScore` и feature diff-поля.
- `featureSourcesJson` — lineage для важных features: `sourceMode`, `sourceRecordId`, `sampleSize`, `confidence`, `freshnessDays`.
- `featureCutoffTime = match.startTime`. Для будущих матчей и backtesting генератор использует только данные `<= match.startTime`; записи после cutoff помечают snapshot как `dataLeakageCheckPassed=false` и не попадают в training export.
- `sourcePriorityByDataType` явно задаёт приоритеты для fixture, ranking, roster, player stats, map stats, veto, H2H, news, round/economy и patch/meta.

Приоритет источников по типам данных:

- fixture — PandaScore Free Fixtures, затем manual real, затем mock только для dev;
- ranking — Valve Rankings, затем manual HLTV reference import;
- roster — manual real, LiquipediaDB при доступе, PandaScore basic context, Valve roster hints только как hint;
- player/map/round/economy stats — GRID Open Access или parsed demo, затем manual real;
- patch/meta — Steam / Counter-Strike Updates, затем manual official update import.

Liquipedia:

- LiquipediaDB остаётся предпочтительным structured source при наличии доступа/key и ограничивается 60 requests/hour.
- MediaWiki API можно использовать без ключа только через `https://liquipedia.net/counterstrike/api.php`, с custom User-Agent `CS2MatchPredictionLab/0.4 (local research analytics; contact: saldinkostya97@gmail.com)`.
- MediaWiki API rate limits: 1 HTTP request / 2 seconds; `action=parse` не чаще 1 request / 30 seconds.
- Автоматизированный доступ к обычным HTML-страницам Liquipedia запрещён. Данные требуют attribution Liquipedia / CC-BY-SA 3.0.

FACEIT:

- FACEIT Data API v4 optional source. Без `FACEIT_API_KEY` adapter disabled и приложение не падает.
- Поддерживаемые documented routes для будущего ingestion: championships, championship matches, match details/stats, team details, player details.
- FACEIT не считается полноценным Tier-1 pro CS2 source и не заменяет PandaScore/Valve/manual/GRID data.

Parsed demo:

- В MVP 0.7.5 поддерживается `parsed_demo` JSON import для `PlayerStatSnapshot`, `TeamMapStat`, `TeamFormSnapshot` и round/economy proxies.
- Actual `.dem` parser worker переносится в будущий MVP. Рекомендуемый кандидат: AWPy (`pip install awpy`, Python >= 3.11), который умеет читать CS2 demo через `Demo(...).parse()` и отдавать rounds/kills/damages/shots/bomb/grenades/ticks. Загрузка demo должна быть ручной/локальной, без HLTV scraping.

Model layer:

- Internal Elo — реально пересчитывается после finished matches и обновляет `Team.internalElo`.
- Glicko-style uncertainty — эвристика для `ratingDeviation`/`volatility`, выше при low sample, new roster или stale activity.
- TrueSkill-style placeholder — только структура будущей модели (`playerSkill`, `teamSkill`, `uncertainty`), не production model.

Training dataset export:

- `/admin/model-lab` экспортирует CSV только по finished matches с `winnerTeamId`.
- `analyst_sample`, unfinished matches и snapshots с `dataLeakageCheckPassed=false` исключаются.
- CSV включает `readinessLevel`, `featureCutoffTime`, `modelVersion`, `featureSchemaVersion` и `dataLeakageCheckPassed`.

Calibration:

- Brier Score, Log Loss, reliability buckets и ECE placeholder считаются отдельно по readiness levels.
- Если sample пустой, UI пишет `Недостаточно матчей для оценки`, а не показывает `0% accuracy`.

Runtime log rule:

```bash
pnpm check:dev-log
```

Проверка падает, если fresh `dev-server.err.log` содержит critical runtime signatures: `PrismaClientValidationError`, `Unknown field ...`, `Cannot find module`, `GET ... 500`, unhandled runtime errors или stack trace. Plain `Fast Refresh had to perform a full reload` считается dev-only warning, а не failure, но его нужно отдельно упоминать в отчёте. Нельзя писать "dev log clean", если warning реально есть; корректная формулировка: "Fast Refresh warnings present, but no critical runtime errors."

## Prediction Engine

Главный entrypoint: `src/lib/predictionEngine.ts`.

`calculatePrediction(input)` возвращает:

- `teamAProbability`, `teamBProbability`;
- `predictedWinnerId`;
- `confidenceScore`;
- `riskLevel`;
- `dataQualityScore`;
- `factors[]`;
- `vetoScenarios[]`;
- `explanation`;
- `warnings[]`;
- `riskBreakdown`.

Каждый factor возвращает:

- `factorName`, `factorGroup`;
- `teamAValue`, `teamBValue`;
- `rawDifference`, `normalizedDifference`;
- `weight`, `impact`, `confidence`;
- `explanation`;
- `evidence[]`;
- `warnings[]`.

Формула MVP:

```text
base = 50/50
rawScore = sum(factorImpact * factorWeight * factorConfidence)
teamAProbability = clamp(50 + rawScore, 1, 99)
teamBProbability = 100 - teamAProbability
```

Ограничения:

- один фактор clamp `[-10, +10]`;
- probability clamp `1..99`;
- weak rumor max `±3%`;
- reliable rumor max `±5%`;
- confirmed insider max `±8%`;
- official event max `±12%`;
- total news impact max `±12%`;
- BO1 confidence cap `75`;
- low data quality confidence cap `65`;
- new roster confidence cap `70`.
- probability safety caps для partial/demo данных: demo max `75/25`, rankings-only max `70/30`, PandaScore fixtures-only без player/map/veto stats max `72/28`, manual match без player stats max `72/28`, source conflict max `68/32`, parsed demo с достаточной выборкой max `88/12`.

## Факторы модели

MVP реализует реальные упрощённые расчёты для:

Team Strength, Recent Form, Player Form, K/D Trend, Map Pool, Pick/Ban/Veto, Overtime, Closing Ability, Comeback Ability, Pistol/Force/Economy, Head-to-Head, Opponent Matchup, News Impact, Schedule Fatigue, LAN/Online, Format, Data Quality, Meta Shift, Data Relevance Decay, Transfer Adaptation, Communication/Language, Chemistry, Role Change, Position Change, Player-System Fit, Leadership, Honeymoon, Core Stability, Role Conflict.

Data relevance считается по идее:

```text
recencyScore
* patchRelevance
* mapVersionRelevance
* rosterSimilarity
* roleSimilarity
* positionSimilarity
* sampleSizeConfidence
```

Старые данные теряют вес после major patch, смены карты, состава, роли или позиции. Stable core повышает confidence. Honeymoon boost может слегка поднять форму, но повышает risk.

## Veto и map pool

Veto создаёт три сценария:

- likely scenario;
- best case Team A;
- best case Team B.

Map pool использует `sampleSizeConfidence`: 80% winrate на 5 картах не должен автоматически быть сильнее 62% на 35 картах.

## Backtesting

`/admin/backtesting` прогоняет finished mock matches через `calculatePrediction`, затем считает:

- accuracy;
- Brier Score;
- calibration buckets;
- BO1 errors;
- new roster errors;
- veto errors;
- news impact errors;
- favorite bias;
- underdog bias.

ROI не считается, потому что проект не про ставки.

## Веса модели

`/admin/model` показывает локальный редактор весов. Слайдеры пересчитывают выбранный match preview прямо на странице через `calculatePrediction`. Seed содержит несколько presets, которые можно развить в сохранение настроек.

## Источники данных

Автоматические источники вынесены в adapter layer. MVP 0.7.5 использует free-first priority:

1. Valve Rankings — free ranking/top-100/opponent strength from `ValveSoftware/counter-strike_regional_standings`.
2. Steam/CS Updates — free app `730` news for patch/meta signals.
3. PandaScore Free Fixtures Mode — schedule, matches, teams, players, tournaments and basic results only.
4. Manual JSON/CSV import — fallback/override for real matches without paid APIs.
5. Parsed Demo JSON import — local deep stats from parsed demos.
6. Liquipedia limited — rosters/tournaments/history with strict rate limits and optional access.
7. GRID Open Access — future detailed match/round/player/economy stats if access is granted.
8. FACEIT optional — not treated as a full Tier-1 pro source.
9. Mock — dev/demo only.

Постоянный source registry живёт в `src/lib/config/dataSourceRegistry.ts` и фиксирует для каждого источника `accessType`, `legalMode`, `priority`, `setupInstructions`, `limitations` и `forbiddenActions`. HLTV и Telegram помечены как `manual_reference`; Abios, GameScorekeeper и DataSportsGroup — `trial/paid_future` и не запускаются как default free sources.

PandaScore uses legacy `/csgo/` endpoints for CS2 Free Fixtures Mode:

- `/csgo/matches`;
- `/csgo/matches/upcoming`;
- `/csgo/matches/past`, если доступно текущему плану;
- `/csgo/series/upcoming`;
- `/csgo/tournaments`;
- `/csgo/teams`;
- `/csgo/players`.

Paid/historical/post-match/live-detailed/betting endpoints are not called. If PandaScore returns `403`, `paid_required`, or a plan block, the job is recorded as `blocked` or `partial`, `/admin/sources` shows "blocked by current plan", and the app falls back to Valve/Steam/manual/mock.

Реальные adapters по умолчанию отключены через env/config:

```env
ENABLE_MOCK_DATA=true
ENABLE_REAL_IMPORTS=false
PANDASCORE_API_KEY=""
GRID_API_KEY=""
LIQUIPEDIA_API_KEY=""
ENABLE_PANDASCORE_SYNC=false
ENABLE_GRID_SYNC=false
ENABLE_LIQUIPEDIA_SYNC=false
ENABLE_FACEIT_SYNC=false
ENABLE_VALVE_RANKINGS_SYNC=false
ENABLE_CS_UPDATES_SYNC=false
ENABLE_ANALYST_SAMPLE=false
AUTO_SYNC_ENABLED=false
SYNC_INTERVAL_MINUTES=180
PRE_MATCH_REFRESH_MINUTES=120
POST_MATCH_REFRESH_MINUTES=60
```

API keys must live only in local `.env`. Do not paste real keys into README, `.env.example`, tests, seed data, logs, screenshots, or commits. Source diagnostics redact key/token/authorization-like values before writing job errors or health notes.

HLTV не скрейпится напрямую. Поля `hltvReferenceUrl` могут использоваться только как reference/manual verification URL, потому что агрессивный scraping может нарушать Terms of Service.

### Automated sync

MVP 0.8.0 не запускает синхронизацию при открытии страниц. Это сделано специально: page-load sync может тормозить dashboard и быстро упереться в rate limits. Обновление запускается только кнопками или CLI. Для live/upcoming feed есть отдельная кнопка `Обновить список матчей`: она обновляет cache, считает diff с предыдущим состоянием и показывает `new / updated / unchanged / stale`.

Запуск через UI:

- `/` и `/matches` — кнопка `Обновить список матчей` для match-feed cache и отдельная кнопка `Обновить всё доступное автоматически` для более широкого research refresh.
- `/match/[id]` — кнопка `Подготовить прогноз` для выбранного матча без broad external sync.
- `/admin/imports` — Sync Valve Rankings, Sync Steam/CS Updates, Sync PandaScore Free Fixtures, Run All Free Sync, Manual JSON/CSV Import, Parsed Demo JSON Import, rebuild snapshots, recalculate upcoming predictions.
- `/admin/sources` — health/status, last endpoint/method/error, rate limit, endpoints available/blocked, raw record counts, created/updated/skipped, needs-review count and raw samples.

Запуск через CLI:

```bash
pnpm sync:all
pnpm sync:pandascore-free
pnpm sync:snapshots
pnpm sync:predictions
```

Если источник не настроен или недоступен, sync job записывает `disabled`, `partial`, `blocked` или `failed`, обновляет `SourceHealth` и не ломает сайт. Без PandaScore доступны Valve/Steam/manual/demo данные. Без GRID/Liquipedia detailed round/economy/player telemetry и deep roster context остаются partial/manual/parsed-demo.

### Entity matching и reconciliation

Реальные источники могут по-разному называть команды и игроков, поэтому MVP 0.3 добавляет:

- `EntityAlias` для подтверждённых соответствий;
- `EntityMatchCandidate` для fuzzy/сомнительных совпадений;
- exact match по `source + externalId`;
- fuzzy match по имени;
- roster overlap для команд;
- nickname + country + team context для игроков.

Если confidence низкий, запись получает `needs_review` и новый domain entity не создаётся автоматически. Raw данные всегда сохраняются в `ExternalSourceRecord` с hash. Если hash не изменился, domain reconciliation пропускается.

Если источники конфликтуют, система сохраняет raw JSON всех источников, выбирает источник по priority, добавляет `sourceConflict` warning, снижает `dataQualityScore` и показывает конфликт в `/admin/data-quality` и `/match/[id]`.

## Добавление нового фактора

1. Добавить key в `WeightKey` и `defaultWeights`.
2. Создать модуль в `src/lib/prediction/`.
3. Вернуть полный `PredictionFactorOutput` с evidence и warnings.
4. Подключить модуль в `calculatePrediction`.
5. Добавить unit tests для clamps/relevance/risk, если фактор влияет на probability или confidence.

