import { prisma } from "@/lib/prisma";
import { RankMatchingPanel } from "@/components/RankMatchingPanel";
import { ProviderCapabilityProbePanel } from "@/components/ProviderCapabilityProbePanel";
import { SourceSyncPanel } from "@/components/SourceSyncPanel";
import { SourceCoverageMatrix } from "@/components/SourceCoverageMatrix";
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

export default async function SourcesPage() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [statuses, jobs, jobsLastHour, rawRecords, coverage, dataStatus, rankCandidates, readinessDistribution] = await Promise.all([
    getSourceStatuses(),
    prisma.dataSyncJob.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    prisma.dataSyncJob.groupBy({ by: ["source"], where: { startedAt: { gte: oneHourAgo } }, _count: { source: true } }),
    prisma.externalSourceRecord.groupBy({ by: ["source"], _count: { source: true } }),
    getProFocusCoverage(),
    getDashboardDataStatus(),
    getRankMatchingCandidates(),
    getReadinessDistribution()
  ]);
  const rawCounts = new Map(rawRecords.map((record) => [record.source, record._count.source]));
  const requestsUsed = new Map(jobsLastHour.map((record) => [record.source, record._count.source]));
  const coverageMatrix = buildSourceCoverageMatrix(undefined, statuses);
  const sourceSetup = buildSourceSetupChecklist(coverage.hltvManualMatchedTeams > 0, dataStatus.teamsWithPlayerRoster > 0 || dataStatus.matchesEnoughForBasicPrediction > 0);
  const noExtraApiMode = isNoExtraApiMode(sourceSetup);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Источники данных</h1>
        <p className="mt-1 text-sm text-lab-muted">Health/status источников, приоритет reconciliation и graceful fallback. HLTV остаётся только reference/manual verification.</p>
      </div>

      {noExtraApiMode ? (
        <section className="rounded border border-lab-cyan/40 bg-lab-panel p-4">
          <h2 className="font-semibold text-white">Сайт работает в basic free mode</h2>
          <p className="mt-2 text-sm text-lab-muted">
            Сайт работает в basic free mode. Это нормально. Для аналитического прогноза добавьте data pack, parsed demo или подключите API.
          </p>
        </section>
      ) : null}

      <section id="source-playbook" className="rounded border border-lab-cyan/40 bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Как получить больше данных</h2>
        <p className="mt-1 text-sm text-lab-muted">Подключайте только разрешённые источники. HLTV и Telegram — manual reference only, без scraping.</p>
        <p className="mt-2 rounded border border-lab-amber/40 bg-lab-panel2 p-3 text-sm text-lab-amber">
          HLTV ranking: manual import only. Automated HLTV scraping disabled by policy. Apify HLTV scraper actors are not connected to this app.
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
          <summary className="cursor-pointer text-sm font-medium text-lab-cyan">Advanced/future providers</summary>
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

      <ProviderCapabilityProbePanel />

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Provider roadmap</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <RoadmapGroup title="Работает сейчас" items={["PandaScore", "Valve", "Steam", "manual_real", "parsed_demo JSON"]} />
          <RoadmapGroup title="Можно подключить бесплатно/с ключом" items={["GRID Open Access", "LiquipediaDB", "FACEIT"]} />
          <RoadmapGroup title="Ручной ввод" items={["Manual HLTV Top 50", "Manual news/insider"]} />
          <RoadmapGroup title="Future/trial/paid" items={["Abios", "GameScorekeeper", "DataSportsGroup"]} />
        </div>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Source Budget Manager</h2>
        <p className="mt-1 text-sm text-lab-muted">Если источник пропущен по лимиту или без ключа, сайт продолжит работать и покажет понятную причину.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statuses.filter((status) => ["pandascore", "grid", "liquipedia", "faceit"].includes(status.source)).map((status) => (
            <article key={status.source} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <h3 className="font-medium text-white">{status.label}</h3>
              <dl className="mt-3 space-y-1 text-xs text-lab-muted">
                <div><dt className="inline">requests used: </dt><dd className="inline text-white">{requestsUsed.get(status.source) ?? 0}</dd></div>
                <div><dt className="inline">requests remaining: </dt><dd className="inline text-white">{status.rateLimitRemaining ?? "n/a"}</dd></div>
                <div><dt className="inline">next allowed sync: </dt><dd className="inline text-white">{status.nextAllowedSyncAt ?? "now"}</dd></div>
                <div><dt className="inline">source status: </dt><dd className="inline text-white">{sourceStatusLabel(status.status)}</dd></div>
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

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Покрытие Pro Focus</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Stat label="Real matches total" value={coverage.realMatchesTotal} />
          <Stat label="Pro Focus matches" value={coverage.proFocusMatches} />
          <Stat label="Top-50 matches" value={coverage.top50Matches} />
          <Stat label="Top-100 matches" value={coverage.top100Matches} />
          <Stat label="Watchlist matches" value={coverage.watchlistMatches} />
          <Stat label="Known tournaments" value={coverage.knownTournamentMatches} />
          <Stat label="Hidden lower-tier" value={coverage.hiddenLowerTier} />
          <Stat label="Academy detected" value={coverage.academyDetected} />
          <Stat label="Separate circuit" value={coverage.separateCircuit} />
          <Stat label="Unranked teams" value={coverage.unrankedTeams} />
          <Stat label="Stale rankings" value={coverage.staleRankings} />
          <Stat label="Needs review" value={coverage.needsReview} />
          <Stat label="Valve matched" value={coverage.valveMatchedTeams} />
          <Stat label="HLTV manual matched" value={coverage.hltvManualMatchedTeams} />
          <Stat label="Teams with rank" value={dataStatus.teamsWithRank} />
          <Stat label="Basic result history" value={dataStatus.teamsWithBasicResultHistory} />
          <Stat label="Teams with roster" value={dataStatus.teamsWithPlayerRoster} />
          <Stat label="Fixture-only matches" value={dataStatus.fixtureOnlyCount} />
          <Stat label="Enough for basic prediction" value={dataStatus.matchesEnoughForBasicPrediction} />
          <Stat label="Readiness L0/L1/L2" value={`${readinessDistribution.L0_FIXTURE_ONLY}/${readinessDistribution.L1_BASIC_CONTEXT}/${readinessDistribution.L2_BASIC_PREDICTION}`} />
          <Stat label="Readiness L3/L4" value={`${readinessDistribution.L3_ANALYTICAL}/${readinessDistribution.L4_DEEP}`} />
          <Stat label="Real actionable" value={readinessDistribution.realActionable} />
          <Stat label="Sample actionable" value={readinessDistribution.sampleActionable} />
          <Stat label="Sample data matches" value={readinessDistribution.sampleDataCount} />
        </div>
      </section>

      <RankMatchingPanel candidates={rankCandidates} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {statuses.map((status) => (
          <article key={status.source} className="rounded border border-lab-border bg-lab-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-lab-cyan">Priority {status.priority}</p>
                <h2 className="mt-1 font-semibold text-white">{status.label}</h2>
              </div>
              <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">{status.status}</span>
            </div>
            <p className="mt-2 text-sm text-lab-muted">{status.message}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-lab-muted">
              <div><dt>Enabled</dt><dd className="text-white">{status.enabled ? "yes" : "no"}</dd></div>
              <div><dt>Raw records</dt><dd className="text-white">{status.rawRecordsCount ?? rawCounts.get(status.source) ?? 0}</dd></div>
              <div><dt>Fetched</dt><dd className="text-white">{status.recordsFetched ?? 0}</dd></div>
              <div><dt>Created/Updated</dt><dd className="text-white">{status.recordsCreated ?? 0}/{status.recordsUpdated ?? 0}</dd></div>
              <div><dt>Skipped</dt><dd className="text-white">{status.recordsSkipped ?? 0}</dd></div>
              <div><dt>Needs review</dt><dd className="text-white">{status.needsReviewCount ?? 0}</dd></div>
              <div><dt>Rate limit</dt><dd className="text-white">{status.rateLimitRemaining ?? "n/a"}</dd></div>
              <div><dt>Failures</dt><dd className="text-white">{status.failureCount ?? 0}</dd></div>
              <div className="col-span-2"><dt>Last endpoint</dt><dd className="break-all text-white">{status.lastEndpoint ?? "n/a"}</dd></div>
              <div className="col-span-2"><dt>Last method</dt><dd className="text-white">{status.lastMethod ?? "n/a"}</dd></div>
              <div className="col-span-2"><dt>Last error</dt><dd className="break-all text-lab-amber">{status.lastError ?? "none"}</dd></div>
              <div className="col-span-2"><dt>Last sync</dt><dd className="text-white">{status.lastSyncedAt ?? "never"}</dd></div>
              <div className="col-span-2"><dt>Next allowed</dt><dd className="text-white">{status.nextAllowedSyncAt ?? "now"}</dd></div>
            </dl>
            {status.endpointsAvailable?.length ? (
              <details className="mt-3 text-xs text-lab-muted">
                <summary className="cursor-pointer text-lab-cyan">Endpoints available</summary>
                <ul className="mt-2 space-y-1">{status.endpointsAvailable.map((endpoint) => <li key={endpoint}>{endpoint}</li>)}</ul>
              </details>
            ) : null}
            {status.endpointsBlocked?.length ? (
              <details className="mt-3 text-xs text-lab-muted">
                <summary className="cursor-pointer text-lab-amber">Endpoints blocked by current plan</summary>
                <ul className="mt-2 space-y-1">{status.endpointsBlocked.map((endpoint) => <li key={endpoint}>{endpoint}</li>)}</ul>
              </details>
            ) : null}
            {status.lastRawSampleJson ? (
              <details className="mt-3 text-xs text-lab-muted">
                <summary className="cursor-pointer text-lab-cyan">View raw sample</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-lab-panel2 p-2 text-[11px]">{status.lastRawSampleJson}</pre>
              </details>
            ) : null}
          </article>
        ))}
      </div>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Recent jobs</h2>
        <div className="mt-3 space-y-2 text-sm text-lab-muted">
          {jobs.map((job) => (
            <p key={job.id}>{job.source} · {job.jobType} · {job.status} · fetched {job.recordsFetched} · {job.notes}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel2 p-3">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
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

function sourceSetupStatusLabel(status: string) {
  const labels: Record<string, string> = {
    configured: "подключён",
    available: "доступно",
    missing: "не подключён",
    future: "будущее"
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
