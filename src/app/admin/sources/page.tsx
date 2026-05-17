import { prisma } from "@/lib/prisma";
import { RankMatchingPanel } from "@/components/RankMatchingPanel";
import { ProviderCapabilityProbePanel } from "@/components/ProviderCapabilityProbePanel";
import { FaceitManualIdImportPanel } from "@/components/FaceitManualIdImportPanel";
import { ImportProfilesPanel } from "@/components/ImportProfilesPanel";
import { SourceSyncPanel } from "@/components/SourceSyncPanel";
import { SourceCoverageMatrix } from "@/components/SourceCoverageMatrix";
import { SourceHunterPanel } from "@/components/SourceHunterPanel";
import { RealDataFoundationCoveragePanel } from "@/components/RealDataFoundationCoveragePanel";
import { PageHeader, SourceStatusCard, StatCard } from "@/components/ui";
import { buildRealDataFoundationCoverage } from "@/lib/autoResearch/foundationCoverage";
import { getDashboardDataStatus } from "@/lib/data/dataCoverage";
import { getRankMatchingCandidates } from "@/lib/data/rankMatching";
import { getReadinessDistribution } from "@/lib/data/readinessDistribution";
import { getProFocusCoverage } from "@/lib/proFocusCoverage";
import { getSourceStatuses } from "@/lib/sources/sourceHealth";
import { buildSourceCoverageMatrix } from "@/lib/sourceCoverageMatrix";
import { buildSourceSetupChecklist, isNoExtraApiMode } from "@/lib/sourceSetup";

export const dynamic = "force-dynamic";

const priorityNotes = [
  "Valve Rankings: free ranking/top-100/opponent strength.",
  "Steam/CS Updates: free patches/meta.",
  "PandaScore Free Fixtures Mode: schedule, matches, teams, players, tournaments, basic results.",
  "Manual import: fallback/override.",
  "Manual News/HLTV/Telegram reference: manual-only news intelligence, no scraping.",
  "Parsed Demo JSON: local deep stats from parsed demos.",
  "Liquipedia limited: rosters/tournaments/history with rate limits.",
  "GRID Open Access: future detailed match/round/player/economy stats.",
  "Mock: dev only."
];

const autopilotProviderCards = [
  {
    title: "PandaScore Free",
    status: "fixture/basic",
    body: "Даёт official upcoming fixture, формат, команды, турнир и basic match context для candidate scoring.",
    limit: "Free/basic plan не заменяет player/map/veto deep layer."
  },
  {
    title: "Valve + Steam CS Updates",
    status: "ranking/meta",
    body: "Valve ranking/basic strength и Steam patch/meta могут поднять coverage, если данные свежие и cutoff-safe.",
    limit: "Не создают roster/player/map/veto records."
  },
  {
    title: "GRID Open Access",
    status: "official partial",
    body: "Central Data учитывается как official context. Series State используется только когда known gridSeriesId уже связан.",
    limit: "Series Events, File Download и Stats Feed недоступны на OA и не вызываются."
  },
  {
    title: "Manual / Parsed",
    status: "validated evidence",
    body: "Validated CSV/TSV manual_real и parsed_demo records дают основной вклад в roster/player/map/veto coverage.",
    limit: "Templates, fake data, Kaggle/offline и personal Steam не live evidence."
  },
  {
    title: "FACEIT / Leetify",
    status: "explicit IDs only",
    body: "Optional context учитывается только при существующих подтверждённых IDs или сохранённых records.",
    limit: "No broad crawl, no nickname search, no Real Forecast Ready alone."
  },
  {
    title: "LiquipediaDB / TheSportsDB",
    status: "conditional",
    body: "LiquipediaDB может помочь roster/history, если key есть. TheSportsDB остаётся disabled metadata fallback.",
    limit: "No player/map/veto/round/economy impact from TheSportsDB."
  }
];

export default async function SourcesPage() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [statuses, jobs, jobsLastHour, rawRecords, coverage, dataStatus, rankCandidates, readinessDistribution, foundationCoverage] = await Promise.all([
    getSourceStatuses(),
    prisma.dataSyncJob.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    prisma.dataSyncJob.groupBy({ by: ["source"], where: { startedAt: { gte: oneHourAgo } }, _count: { source: true } }),
    prisma.externalSourceRecord.groupBy({ by: ["source"], _count: { source: true } }),
    getProFocusCoverage(),
    getDashboardDataStatus(),
    getRankMatchingCandidates(),
    getReadinessDistribution(),
    buildRealDataFoundationCoverage(new Date(), 40)
  ]);
  const rawCounts = new Map(rawRecords.map((record) => [record.source, record._count.source]));
  const requestsUsed = new Map(jobsLastHour.map((record) => [record.source, record._count.source]));
  const coverageMatrix = buildSourceCoverageMatrix(undefined, statuses);
  const sourceSetup = buildSourceSetupChecklist(coverage.hltvManualMatchedTeams > 0, dataStatus.teamsWithPlayerRoster > 0 || dataStatus.matchesEnoughForBasicPrediction > 0);
  const noExtraApiMode = isNoExtraApiMode(sourceSetup);
  const faceitStatus = statuses.find((status) => status.source === "faceit");
  const gridStatus = statuses.find((status) => status.source === "grid");
  const sourceCards = buildProviderCards(sourceSetup, statuses);
  const sourceNextActions = buildSourceNextActions(sourceSetup, statuses);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Source setup"
        title="Источники данных"
        description="Подключайте только разрешённые источники. Страница показывает, что даст каждый источник, что уже подключено и что остаётся недоступным."
      />

      {noExtraApiMode ? (
        <section className="rounded border border-lab-cyan/40 bg-lab-panel p-4">
          <h2 className="font-semibold text-white">Сайт работает в basic free mode</h2>
          <p className="mt-2 text-sm text-lab-muted">
            Сайт работает в basic free mode. Это нормально. Для аналитического прогноза добавьте data pack, parsed demo или подключите API.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-lab-cyan/35 bg-lab-panel/85 p-4 shadow-[0_0_36px_rgba(56,189,248,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Что подключить дальше</h2>
            <p className="mt-1 text-sm text-lab-muted">Самые полезные следующие шаги для роста качества данных без broad crawl и без scraping.</p>
          </div>
          <span className="rounded-full border border-lab-cyan/35 bg-lab-cyan/10 px-3 py-1 text-xs font-medium text-lab-cyan">UX-подсказка</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {sourceNextActions.map((item) => (
            <article key={item.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lab-cyan">{item.status}</p>
              <h3 className="mt-2 font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-lab-muted">{item.description}</p>
              <a href={item.href} className="mt-3 inline-flex rounded-lg border border-lab-cyan/45 bg-lab-cyan/10 px-3 py-2 text-sm font-medium text-lab-cyan hover:bg-lab-cyan/15">
                {item.actionLabel}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section id="source-playbook" className="rounded-2xl border border-lab-cyan/35 bg-lab-panel/85 p-4">
        <h2 className="font-semibold text-white">Карты источников</h2>
        <p className="mt-1 text-sm text-lab-muted">Основной путь без raw diagnostics: статус, польза, ограничения и следующее действие.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sourceCards.map((card) => (
            <SourceStatusCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section id="data-onboarding" className="rounded-2xl border border-lab-violet/35 bg-lab-panel/85 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Data Onboarding</h2>
            <p className="mt-1 text-sm text-lab-muted">Что можно подключать сейчас, а что остаётся только training/local guidance. Никакие ключи или personal auth codes здесь не показываются.</p>
          </div>
          <span className="rounded-full border border-lab-violet/35 bg-lab-violet/10 px-3 py-1 text-xs font-medium text-lab-violet">MVP 0.7.5</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <OnboardingCard
            title="Kaggle CSV"
            label="training/calibration only"
            body="results.csv, players.csv, picks.csv и economy.csv проверяются в Model Lab inspector. Они не являются live forecast source и не могут поднять Real Forecast Ready."
            href="/admin/model-lab"
            action="Открыть inspector"
          />
          <OnboardingCard
            title="Leetify"
            label="optional context"
            body="Developer page: https://leetify.com/app/developer. Base URL: https://api-public.cs-prod.leetify.com. Только explicit steam64_id / Leetify ID, attribution required, privacy dependent."
            href="#source-playbook"
            action="Смотреть правила"
          />
          <OnboardingCard
            title="TheSportsDB"
            label="low-priority fallback"
            body="Disabled by default. Можно делать coverage probe для teams/events metadata, но не player stats, map/veto, round/economy и не Real Forecast Ready."
            href="#source-playbook"
            action="Проверить статус"
          />
          <OnboardingCard
            title="Steam auth code"
            label="local-only guidance"
            body="Только personal match history/demo pipeline. Не нужен для pro forecast. Не добавлять в .env.example; если код раскрыт, rotate/regenerate."
            href="/admin/model-lab"
            action="Смотреть demo path"
          />
          <OnboardingCard
            title="CS Demo Manager"
            label="historical demos"
            body="Берите прошлые демки текущего состава, экспортируйте JSON/CSV и загружайте через Parsed Demo Export Intake или CSV/TSV Analyst Sheet Import. Target post-start demo не pre-match evidence."
            href="/admin/research-queue"
            action="Открыть импорт"
          />
          <OnboardingCard
            title="GRID Mapping"
            label="future / blocked by TBD"
            body="GRID Open Access работает, но когда Central Data отдаёт TBD-1 vs TBD-2, match mapping остаётся needs_review/future и не создаёт fake scoped records."
            href="#grid-open-access"
            action="Открыть GRID"
          />
        </div>
      </section>

      <SourceHunterPanel />

      <RealDataFoundationCoveragePanel coverage={foundationCoverage} />

      <section id="autopilot-provider-contribution" className="rounded-2xl border border-lab-cyan/35 bg-lab-panel/85 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Autopilot provider contribution</h2>
            <p className="mt-1 text-sm text-lab-muted">
              Automated Legal Data Autopilot считает coverage только из разрешённых источников и уже сохранённых records. Он не скрейпит сайты, не запускает browser crawler и не создаёт fake evidence.
            </p>
          </div>
          <span className="rounded-full border border-lab-cyan/35 bg-lab-cyan/10 px-3 py-1 text-xs font-medium text-lab-cyan">MVP 0.7.6</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {autopilotProviderCards.map((card) => (
            <article key={card.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lab-cyan">{card.status}</p>
              <h3 className="mt-2 font-semibold text-white">{card.title}</h3>
              <p className="mt-2 text-sm text-lab-muted">{card.body}</p>
              <p className="mt-2 text-xs text-lab-amber">{card.limit}</p>
            </article>
          ))}
        </div>
      </section>

      <ImportProfilesPanel />

      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Режим аналитика: детальная карта подключения</summary>
      <section className="mt-4 rounded border border-lab-cyan/40 bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Как получить больше данных</h2>
        <p className="mt-1 text-sm text-lab-muted">Подключайте только разрешённые источники. HLTV и Telegram — manual reference only, без scraping.</p>
        <p className="mt-2 rounded border border-lab-amber/40 bg-lab-panel2 p-3 text-sm text-lab-amber">
          HLTV ranking: только ручной импорт. Автоматический HLTV scraping отключён политикой проекта. Apify HLTV scraper actors не подключены к приложению.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sourceSetup.filter((item) => !item.advancedOnly).map((item) => (
            <article key={item.id} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-white">{item.label}</h3>
                <span className={item.status === "configured" || item.status === "available" ? "text-xs uppercase text-lab-green" : "text-xs uppercase text-lab-amber"}>{sourceSetupStatusLabel(item.status)}</span>
              </div>
              <p className="mt-2 text-sm text-lab-muted">{item.value}</p>
              <dl className="mt-3 space-y-1 text-xs text-lab-muted">
                <div><dt className="inline">Приоритет: </dt><dd className="inline text-white">{item.priority}</dd></div>
                <div><dt className="inline">Действие: </dt><dd className="inline text-white">{item.action}</dd></div>
                <div><dt className="inline">Ограничения: </dt><dd className="inline text-white">{item.limitations}</dd></div>
              </dl>
              <a href={item.actionHref} className="mt-3 inline-flex rounded border border-lab-border px-3 py-1.5 text-sm text-lab-cyan hover:border-lab-cyan">
                {item.actionLabel}
              </a>
            </article>
          ))}
        </div>
        <details className="mt-4 rounded border border-lab-border bg-lab-panel2 p-3">
          <summary className="cursor-pointer text-sm font-medium text-lab-cyan">Расширенно: future providers</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {sourceSetup.filter((item) => item.advancedOnly).map((item) => (
              <article key={item.id} className="rounded border border-lab-border p-3 text-sm text-lab-muted">
                <h3 className="font-medium text-white">{item.label}</h3>
                <p className="mt-2">{item.value}</p>
                <p className="mt-2 text-xs text-lab-amber">{item.action}</p>
              </article>
            ))}
          </div>
        </details>
      </section>
      </details>

      <ProviderCapabilityProbePanel />

      <section id="grid-open-access" className="rounded border border-lab-cyan/40 bg-lab-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">GRID Open Access</h2>
            <p className="mt-1 text-sm text-lab-muted">
              GRID используется как официальный optional provider: сначала capability probe, затем Central Data sync, затем Series State только по known series id. Unsupported APIs не вызываются.
            </p>
          </div>
          <a href="#provider-capability-probe" className="rounded border border-lab-cyan/50 px-3 py-2 text-sm text-lab-cyan hover:bg-lab-cyan/10">Проверить GRID</a>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
            <p className="text-white">Подключение</p>
            <p>ключ добавлен: {gridStatus?.configured ? "да" : "нет"}</p>
            <p>синхронизация включена: {gridStatus?.enabled ? "да" : "нет"}</p>
            <p>статус: {sourceStatusLabel(gridStatus?.status ?? "idle")}</p>
          </div>
          <div className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
            <p className="text-white">Open Access endpoints</p>
            <p>Central Data: {gridStatus?.enabled ? "доступно после probe" : "нет"}</p>
            <p>Series State: pending до known series id</p>
            <p>last sync: {gridStatus?.lastSyncedAt ?? "ещё не запускался"}</p>
          </div>
          <div className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
            <p className="text-white">Недоступно на OA</p>
            <p>Series Events unavailable on OA</p>
            <p>File Download unavailable on OA</p>
            <p>Stats Feed unavailable on OA</p>
          </div>
        </div>
        <div className="mt-3 rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
          <p>записей получено: <span className="text-white">{gridStatus?.recordsFetched ?? 0}</span> · создано/обновлено: <span className="text-white">{gridStatus?.recordsCreated ?? 0}/{gridStatus?.recordsUpdated ?? 0}</span> · нужно проверить: <span className="text-white">{gridStatus?.needsReviewCount ?? 0}</span></p>
          <p className="mt-2 text-lab-amber">GRID данные могут поднять coverage/depth, но Real Forecast Ready всё равно требует existing gates, достаточный sample, map/veto или deep substitutes, no leakage и no critical needs_review.</p>
        </div>
      </section>

      <section id="faceit-context" className="rounded border border-lab-cyan/40 bg-lab-panel p-4">
        <h2 className="font-semibold text-white">FACEIT Context Enrichment</h2>
        <p className="mt-1 text-sm text-lab-muted">
          FACEIT работает только server-side и только как optional player/team/competition context. Обогащение выбранного матча использует только подтверждённые FACEIT IDs/context; массовый crawl и поиск по nickname/name отключены.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
            <p className="text-white">Возможности</p>
            <p>ключ добавлен: {faceitStatus?.configured ? "да" : "нет"}</p>
            <p>синхронизация включена: {faceitStatus?.enabled ? "да" : "нет"}</p>
            <p>доступность/status: {sourceStatusLabel(faceitStatus?.status ?? "idle")}</p>
          </div>
          <div className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
            <p className="text-white">Что доступно</p>
            <p>команды: только по подтверждённому team context</p>
            <p>игроки: только по подтверждённым FACEIT IDs</p>
            <p>stats: только по подтверждённому player context</p>
          </div>
          <div className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
            <p className="text-white">Последнее обогащение</p>
            <p>последний sync: {faceitStatus?.lastSyncedAt ?? "ещё не запускался"}</p>
            <p>записей получено: {faceitStatus?.recordsFetched ?? 0}</p>
            <p>нужно проверить: {faceitStatus?.needsReviewCount ?? 0}</p>
          </div>
        </div>
        <div className="mt-4">
          <FaceitManualIdImportPanel compact />
        </div>
      </section>

      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Расширенно: roadmap источников</summary>
      <section className="mt-4 rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Карта источников</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <RoadmapGroup title="Работает сейчас" items={["PandaScore", "Valve", "Steam", "manual_real JSON", "parsed_demo JSON"]} />
          <RoadmapGroup title="Можно подключить бесплатно/с ключом" items={["GRID Open Access", "LiquipediaDB", "FACEIT", "Leetify placeholder"]} />
          <RoadmapGroup title="Бесплатные upload/tool paths" items={["CS Demo Manager JSON", "Awpy JSON", "demoparser JSON", "demoinfocs JSON"]} />
          <RoadmapGroup title="Ручной ввод" items={["Manual HLTV Top 50", "Manual news/insider"]} />
          <RoadmapGroup title="Offline research" items={["Kaggle datasets: training/calibration only", "ByMykel static metadata", "CS2Leaderboard context"]} />
          <RoadmapGroup title="Будущее / trial / paid" items={["Abios", "TheSports", "GameScorekeeper", "DataSportsGroup", "Sportradar", "LSports"]} />
        </div>
      </section>
      </details>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Лимиты источников</h2>
        <p className="mt-1 text-sm text-lab-muted">Если источник пропущен по лимиту или без ключа, сайт продолжит работать и покажет понятную причину.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statuses.filter((status) => ["pandascore", "grid", "liquipedia", "faceit"].includes(status.source)).map((status) => (
            <article key={status.source} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <h3 className="font-medium text-white">{status.label}</h3>
              <dl className="mt-3 space-y-1 text-xs text-lab-muted">
                <div><dt className="inline">запросов использовано: </dt><dd className="inline text-white">{requestsUsed.get(status.source) ?? 0}</dd></div>
                <div><dt className="inline">осталось запросов: </dt><dd className="inline text-white">{status.rateLimitRemaining ?? "n/a"}</dd></div>
                <div><dt className="inline">следующий sync: </dt><dd className="inline text-white">{status.nextAllowedSyncAt ?? "сейчас"}</dd></div>
                <div><dt className="inline">статус источника: </dt><dd className="inline text-white">{sourceStatusLabel(status.status)}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-lab-muted">{status.enabled ? status.message : "Источник не подключён. Добавьте API key в .env."}</p>
            </article>
          ))}
        </div>
      </section>

      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Расширенно: sync/import действия</summary>
        <div className="mt-4">
          <SourceSyncPanel statuses={statuses} />
        </div>
      </details>

      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Расширенно: SourceCoverageMatrix и diagnostics</summary>
        <div className="mt-4 space-y-4">
          <section className="rounded border border-lab-border bg-lab-panel2 p-4">
            <h2 className="font-semibold text-white">Приоритет источников</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {priorityNotes.map((note, index) => (
                <p key={note} className="rounded border border-lab-border bg-lab-panel p-3 text-sm text-lab-muted">
                  {index + 1}. {note}
                </p>
              ))}
            </div>
          </section>
          <SourceCoverageMatrix rows={coverageMatrix} />
        </div>
      </details>

      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Расширенно: покрытие Pro Focus</summary>
      <section className="mt-4 rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Покрытие Pro Focus</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <StatCard label="Real matches total" value={coverage.realMatchesTotal} />
          <StatCard label="Pro Focus matches" value={coverage.proFocusMatches} />
          <StatCard label="Top-50 matches" value={coverage.top50Matches} />
          <StatCard label="Top-100 matches" value={coverage.top100Matches} />
          <StatCard label="Watchlist matches" value={coverage.watchlistMatches} />
          <StatCard label="Known tournaments" value={coverage.knownTournamentMatches} />
          <StatCard label="Hidden lower-tier" value={coverage.hiddenLowerTier} />
          <StatCard label="Academy detected" value={coverage.academyDetected} />
          <StatCard label="Separate circuit" value={coverage.separateCircuit} />
          <StatCard label="Unranked teams" value={coverage.unrankedTeams} />
          <StatCard label="Stale rankings" value={coverage.staleRankings} />
          <StatCard label="Нужно проверить" value={coverage.needsReview} />
          <StatCard label="Valve matched" value={coverage.valveMatchedTeams} />
          <StatCard label="HLTV manual matched" value={coverage.hltvManualMatchedTeams} />
          <StatCard label="Teams with rank" value={dataStatus.teamsWithRank} />
          <StatCard label="Basic result history" value={dataStatus.teamsWithBasicResultHistory} />
          <StatCard label="Teams with roster" value={dataStatus.teamsWithPlayerRoster} />
          <StatCard label="Fixture-only matches" value={dataStatus.fixtureOnlyCount} />
          <StatCard label="Enough for basic prediction" value={dataStatus.matchesEnoughForBasicPrediction} />
          <StatCard label="Readiness L0/L1/L2" value={`${readinessDistribution.L0_FIXTURE_ONLY}/${readinessDistribution.L1_BASIC_CONTEXT}/${readinessDistribution.L2_BASIC_PREDICTION}`} />
          <StatCard label="Readiness L3/L4" value={`${readinessDistribution.L3_ANALYTICAL}/${readinessDistribution.L4_DEEP}`} />
          <StatCard label="Real actionable" value={readinessDistribution.realActionable} />
          <StatCard label="Sample actionable" value={readinessDistribution.sampleActionable} />
          <StatCard label="Sample data matches" value={readinessDistribution.sampleDataCount} />
        </div>
      </section>
      </details>

      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Режим аналитика: кандидаты rank matching</summary>
        <div className="mt-4">
          <RankMatchingPanel candidates={rankCandidates} />
        </div>
      </details>

      <details id="source-jobs" className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Расширенно: карточки source health</summary>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {statuses.map((status) => (
          <article key={status.source} className="rounded border border-lab-border bg-lab-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-lab-cyan">Приоритет {status.priority}</p>
                <h2 className="mt-1 font-semibold text-white">{status.label}</h2>
              </div>
              <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">{sourceStatusLabel(status.status)}</span>
            </div>
            <p className="mt-2 text-sm text-lab-muted">{status.message}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-lab-muted">
              <div><dt>Включён</dt><dd className="text-white">{status.enabled ? "да" : "нет"}</dd></div>
              <div><dt>Raw records</dt><dd className="text-white">{status.rawRecordsCount ?? rawCounts.get(status.source) ?? 0}</dd></div>
              <div><dt>Получено</dt><dd className="text-white">{status.recordsFetched ?? 0}</dd></div>
              <div><dt>Создано/обновлено</dt><dd className="text-white">{status.recordsCreated ?? 0}/{status.recordsUpdated ?? 0}</dd></div>
              <div><dt>Пропущено</dt><dd className="text-white">{status.recordsSkipped ?? 0}</dd></div>
              <div><dt>Нужно проверить</dt><dd className="text-white">{status.needsReviewCount ?? 0}</dd></div>
              <div><dt>Rate limit</dt><dd className="text-white">{status.rateLimitRemaining ?? "n/a"}</dd></div>
              <div><dt>Ошибки</dt><dd className="text-white">{status.failureCount ?? 0}</dd></div>
              <div className="col-span-2"><dt>Последний endpoint</dt><dd className="break-all text-white">{status.lastEndpoint ?? "n/a"}</dd></div>
              <div className="col-span-2"><dt>Последний method</dt><dd className="text-white">{status.lastMethod ?? "n/a"}</dd></div>
              <div className="col-span-2"><dt>Последняя ошибка</dt><dd className="break-all text-lab-amber">{status.lastError ?? "нет"}</dd></div>
              <div className="col-span-2"><dt>Последний sync</dt><dd className="text-white">{status.lastSyncedAt ?? "ещё не запускался"}</dd></div>
              <div className="col-span-2"><dt>Следующий запуск</dt><dd className="text-white">{status.nextAllowedSyncAt ?? "сейчас"}</dd></div>
            </dl>
            {status.endpointsAvailable?.length ? (
              <details className="mt-3 text-xs text-lab-muted">
                <summary className="cursor-pointer text-lab-cyan">Что доступно</summary>
                <ul className="mt-2 space-y-1">{status.endpointsAvailable.map((endpoint) => <li key={endpoint}>{endpoint}</li>)}</ul>
              </details>
            ) : null}
            {status.endpointsBlocked?.length ? (
              <details className="mt-3 text-xs text-lab-muted">
                <summary className="cursor-pointer text-lab-amber">Что недоступно / требует доступа</summary>
                <ul className="mt-2 space-y-1">{status.endpointsBlocked.map((endpoint) => <li key={endpoint}>{endpoint}</li>)}</ul>
              </details>
            ) : null}
            {status.lastRawSampleJson ? (
              <details className="mt-3 text-xs text-lab-muted">
                <summary className="cursor-pointer text-lab-cyan">Показать raw sample</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-lab-panel2 p-2 text-[11px]">{status.lastRawSampleJson}</pre>
              </details>
            ) : null}
          </article>
        ))}
      </div>
      </details>

      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Расширенно: последние source jobs</summary>
      <section className="mt-4 rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Recent jobs</h2>
        <div className="mt-3 space-y-2 text-sm text-lab-muted">
          {jobs.map((job) => (
            <p key={job.id}>{job.source} · {job.jobType} · {job.status} · fetched {job.recordsFetched} · {job.notes}</p>
          ))}
        </div>
      </section>
      </details>
    </div>
  );
}

function RoadmapGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="rounded border border-lab-border bg-lab-panel2 p-3">
      <h3 className="font-medium text-white">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-lab-muted">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

function OnboardingCard({ title, label, body, href, action }: { title: string; label: string; body: string; href: string; action: string }) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lab-violet">{label}</p>
      <h3 className="mt-2 font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-lab-muted">{body}</p>
      <a href={href} className="mt-3 inline-flex rounded-lg border border-lab-violet/45 bg-lab-violet/10 px-3 py-2 text-sm font-medium text-lab-violet hover:bg-lab-violet/15">
        {action}
      </a>
    </article>
  );
}

function buildSourceNextActions(sourceSetup: ReturnType<typeof buildSourceSetupChecklist>, statuses: Awaited<ReturnType<typeof getSourceStatuses>>) {
  const setup = new Map(sourceSetup.map((item) => [item.id, item]));
  const status = new Map<string, (typeof statuses)[number]>(statuses.map((item) => [item.source, item]));
  const liquipedia = setup.get("liquipedia");
  const grid = status.get("grid");
  const faceit = status.get("faceit");
  const hltv = setup.get("hltv_manual_top50");
  return [
    {
      title: "LiquipediaDB",
      status: liquipedia?.status === "configured" ? "Подключено" : "Не подключено",
      description: "Главный источник для составов, турниров и истории. Поможет закрывать roster blocker без ручного хаоса.",
      actionLabel: "Получить LiquipediaDB",
      href: "#source-playbook"
    },
    {
      title: "Parsed Demo",
      status: "Что доступно: JSON import",
      description: "Лучший бесплатный путь к глубокой статистике: player/map/round/economy данные из локального parsed_demo JSON.",
      actionLabel: "Загрузить parsed demo",
      href: "/admin/research-queue?template=parsed_demo"
    },
    {
      title: "FACEIT",
      status: faceit?.configured ? "Подключено: ключ добавлен" : "Не подключено",
      description: "Подтвердите FACEIT IDs, чтобы использовать player/team context. Массовый FACEIT crawl отключён.",
      actionLabel: "Подтвердить FACEIT IDs",
      href: "#faceit-context"
    },
    {
      title: "GRID",
      status: grid?.configured ? "Ключ добавлен; OA endpoints нужно проверить" : "Не подключено",
      description: "GRID Open Access даёт Central Data и Series State. Series Events, File Download и Stats Feed недоступны на OA.",
      actionLabel: "Проверить GRID",
      href: "#grid-open-access"
    },
    {
      title: "Manual HLTV Top 50",
      status: hltv?.status === "configured" ? "Подключено" : "Ручной импорт",
      description: "Ручной импорт без scraping улучшит ranking/pro focus. Apify/HLTV scraping не подключается к приложению.",
      actionLabel: "Импортировать HLTV Top 50",
      href: "#source-playbook"
    }
  ];
}

function buildProviderCards(sourceSetup: ReturnType<typeof buildSourceSetupChecklist>, statuses: Awaited<ReturnType<typeof getSourceStatuses>>) {
  const setup = new Map(sourceSetup.map((item) => [item.id, item]));
  const status = new Map<string, (typeof statuses)[number]>(statuses.map((item) => [item.source, item]));
  const row = (id: string, title: string, gives: string, unavailable: string, actionFallback: string, limitationsFallback: string) => {
    const setupItem = setup.get(id);
    const statusItem = status.get(id) ?? status.get(id === "steam" ? "cs-updates" : id === "valve" ? "valve-rankings" : id);
    const configured = statusItem?.configured ?? (setupItem?.status === "configured" || id === "news_manual");
    return {
      title,
      status: configured ? "Подключено" : setupItem?.status === "available" ? "Что доступно" : setupItem?.status === "future" ? "Что недоступно / требует доступа" : "Не подключено",
      gives,
      configured: configured ? "ключ добавлен / источник настроен" : "пока не подключено",
      unavailable,
      action: setupItem?.action ?? actionFallback,
      limitations: setupItem?.limitations ?? limitationsFallback
    };
  };
  return [
    row("pandascore", "PandaScore", "Матчи, команды, турниры и basic results.", "Deep stats недоступны на free/basic plan.", "Добавить API key в .env.", "Fixture/basic only."),
    row("valve", "Valve", "Рейтинги, top-100 signal и roster hints.", "Не даёт player/map/veto deep layer.", "Использовать public rankings.", "Ranking source only."),
    row("steam", "Steam", "CS2 patch/meta context.", "Не даёт match telemetry.", "Оставить public updates enabled.", "Patch/meta only."),
    row("grid", "GRID", "Official series context через Central Data и Series State.", "Series Events, File Download и Stats Feed недоступны на Open Access.", "Проверить Open Access capabilities.", "Только подтверждённые OA endpoints; known series id required."),
    row("liquipedia", "LiquipediaDB", "Составы, турниры, история, roster changes.", "Нужен approved API access.", "Запросить key.", "Rate limits and approved access."),
    row("faceit", "FACEIT", "Optional player/team/competition context.", "Не заменяет map/veto/deep telemetry.", "Добавить manual FACEIT IDs.", "Нужны явные IDs/context; массовый FACEIT crawl отключён."),
    row("leetify", "Leetify", "Optional player/profile context по explicit steam64_id / Leetify ID.", "Не Tier-1/deep pro source и не broad crawl.", "Создать key на developer page и хранить только в .env.", "Attribution required; privacy dependent; no automatic sync."),
    row("cs_demo_manager", "CS Demo Manager", "Исторические демки -> JSON/CSV export -> existing intake.", "Не даёт будущую демку target match; raw parser не встроен.", "Экспортировать прошлые матчи текущего состава.", "Target post-start demo не pre-match evidence."),
    row("parsed_demo", "Parsed Demo", "Player/map/round/economy stats без платных API.", ".dem parser worker пока не включён.", "Загрузить parsed_demo JSON.", "Только validated local JSON."),
    row("hltv_manual_top50", "Manual HLTV", "Ranking reference и Pro Focus matching.", "Автоматический scraping отключён.", "Импортировать CSV/JSON вручную.", "Только manual reference."),
    row("news_manual", "News/Insider manual", "Official/reference/insider risk context.", "Telegram/HLTV не скрейпятся.", "Добавить manual news note.", "Manual only, no training usage."),
    row("kaggle_csgo_datasets", "Kaggle offline", "Training/calibration metadata in Model Lab inspector.", "Not live forecast source; cannot raise Real Forecast Ready.", "Inspect CSV locally.", "License check required; no live records."),
    row("thesportsdb", "TheSportsDB", "Low-priority teams/events metadata fallback if coverage exists.", "No player/map/veto/round/economy use.", "Keep disabled until coverage probe.", "No readiness impact.")
  ];
}

function sourceSetupStatusLabel(status: string) {
  const labels: Record<string, string> = {
    configured: "Подключено",
    available: "Что доступно",
    missing: "Не подключено",
    future: "Что недоступно / требует доступа"
  };
  return labels[status] ?? status;
}

function sourceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    success: "обновлён",
    partial: "частично",
    failed: "ошибка",
    blocked: "заблокирован",
    disabled: "отключён",
    idle: "ожидает"
  };
  return labels[status] ?? status;
}
