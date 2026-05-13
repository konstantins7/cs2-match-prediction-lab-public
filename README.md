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

## Что есть в MVP 0.3.5

- Next.js App Router, TypeScript, Tailwind CSS.
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
- Sync в MVP 0.3.5 запускается только вручную через `/admin/imports` или CLI scripts. Page-load sync запрещён.
- Source modes and badges: demo, valve rankings, Steam updates, PandaScore free, manual real, parsed demo, analyst sample, mixed, partial, needs review.

## Pro Focus Mode

MVP 0.3.5 сохраняет отдельный слой видимости и приоритизации матчей. Он не удаляет данные и не влияет на математическую уверенность прогноза: это только UI/filtering слой поверх сохранённых матчей.

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

## Analyst Data Pack Validation

MVP 0.3.5 добавляет controlled proof-flow для analyst workflow. Цель не в том, чтобы выдать sample за реальные данные, а в том, чтобы проверить весь pipeline на одном выбранном матче: research queue -> sample/manual enrichment -> snapshots -> prediction audit -> readiness before/after.

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

Runtime log rule:

```bash
pnpm check:dev-log
```

Проверка падает, если fresh `dev-server.err.log` содержит Fast Refresh/runtime/Prisma unknown-field ошибки. Перед финальной smoke-проверкой старый log нужно очистить или rotate, затем fresh-start dev server, пройти страницы и только потом запускать checker. Нельзя писать "dev log clean", если проверялся старый log или в fresh log остались ошибки.

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

Автоматические источники вынесены в adapter layer. MVP 0.3.5 использует free-first priority:

1. Valve Rankings — free ranking/top-100/opponent strength from `ValveSoftware/counter-strike_regional_standings`.
2. Steam/CS Updates — free app `730` news for patch/meta signals.
3. PandaScore Free Fixtures Mode — schedule, matches, teams, players, tournaments and basic results only.
4. Manual JSON/CSV import — fallback/override for real matches without paid APIs.
5. Parsed Demo JSON import — local deep stats from parsed demos.
6. Liquipedia limited — rosters/tournaments/history with strict rate limits and optional access.
7. GRID Open Access — future detailed match/round/player/economy stats if access is granted.
8. FACEIT optional — not treated as a full Tier-1 pro source.
9. Mock — dev/demo only.

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

MVP 0.3.5 не запускает синхронизацию при открытии страниц. Это сделано специально: page-load sync может тормозить dashboard и быстро упереться в rate limits. Полноценный scheduler/cron запланирован на MVP 0.4.

Запуск через UI:

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
