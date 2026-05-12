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

## Что есть в MVP 0.2

- Next.js App Router, TypeScript, Tailwind CSS.
- SQLite + Prisma schema с командами, игроками, матчами, картами, veto, новостями, roster/meta/chemistry и prediction audit моделями.
- Fictional seed data: реальные команды не используются.
- `/`, `/matches`, `/predictions`, `/match/[id]`, `/team/[id]`, `/player/[id]`.
- `/admin/model`, `/admin/backtesting`, `/admin/data-quality`, `/admin/imports`, `/admin/sources`.
- Все прогнозы в UI считаются live через `buildPredictionInput(matchId)` + `calculatePrediction(input)`.

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

## Факторы модели

MVP реализует реальные упрощённые расчёты для:

Team Strength, Recent Form, Player Form, K/D Trend, Map Pool, Pick/Ban/Veto, Overtime, Closing Ability, Comeback Ability, Pistol/Force/Economy, Head-to-Head, News Impact, Schedule Fatigue, LAN/Online, Format, Data Quality, Meta Shift, Data Relevance Decay, Transfer Adaptation, Communication/Language, Chemistry, Role Change, Position Change, Player-System Fit, Leadership, Honeymoon, Core Stability, Role Conflict.

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

Автоматические источники вынесены в adapter layer:

- `mockAdapter`;
- `pandascoreAdapter`;
- `gridAdapter`;
- `liquipediaAdapter`;
- `manualImportAdapter`;
- future official source can be added using `SourceAdapter`.

Реальные adapters по умолчанию отключены через env/config:

```env
ENABLE_MOCK_DATA=true
ENABLE_REAL_IMPORTS=false
PANDASCORE_API_KEY=""
GRID_API_KEY=""
LIQUIPEDIA_API_KEY=""
```

HLTV не скрейпится напрямую. Поля `hltvReferenceUrl` могут использоваться только как reference/manual verification URL, потому что агрессивный scraping может нарушать Terms of Service.

## Добавление нового фактора

1. Добавить key в `WeightKey` и `defaultWeights`.
2. Создать модуль в `src/lib/prediction/`.
3. Вернуть полный `PredictionFactorOutput` с evidence и warnings.
4. Подключить модуль в `calculatePrediction`.
5. Добавить unit tests для clamps/relevance/risk, если фактор влияет на probability или confidence.
