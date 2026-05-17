import { DashboardStatusStrip } from "@/components/DashboardStatusStrip";
import { MatchFeedRefreshButton } from "@/components/MatchFeedRefreshButton";
import { PredictionCard } from "@/components/PredictionCard";
import { PageHeader } from "@/components/ui";
import { getDashboardDataStatus } from "@/lib/data/dataCoverage";
import { getCalculatedMatches, type MatchFocusFilter } from "@/lib/data/matches";
import { getReadinessDistribution } from "@/lib/data/readinessDistribution";
import { getMatchFeedStatus } from "@/lib/matchFeedCache";
import { getPredictionLifecycleBoard } from "@/lib/predictionLifecycle";

export const dynamic = "force-dynamic";

type Search = { sourceMode?: string; focus?: MatchFocusFilter };

export default async function PredictionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const [rows, status, readinessDistribution, matchFeedStatus, lifecycleBoard] = await Promise.all([
    getCalculatedMatches({ status: "upcoming", limit: 20, sourceMode: params.sourceMode, focus: params.focus ?? "pro" }),
    getDashboardDataStatus(),
    getReadinessDistribution(),
    getMatchFeedStatus(),
    getPredictionLifecycleBoard()
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Forecast board"
        title="Прогнозы"
        description="Карточки показывают readiness, глубину данных, risk/confidence и одно главное действие. Lower-tier матчи скрыты из основного фокуса, но доступны фильтрами."
      />
      <DashboardStatusStrip status={{ ...status, readinessDistribution }} />
      <MatchFeedRefreshButton status={matchFeedStatus} compact />
      <PredictionLifecycleBoard board={lifecycleBoard} />
      <div className="flex flex-wrap gap-2">
        {[
          ["Топовые матчи", "/predictions"],
          ["Top 50", "/predictions?focus=top50"],
          ["Top 100", "/predictions?focus=top100"],
          ["Watchlist", "/predictions?focus=watchlist"],
          ["Известные турниры", "/predictions?focus=known"],
          ["All real", "/predictions?focus=all_real"],
          ["Низший тир / академки", "/predictions?focus=lower_tier"],
          ["Отдельный контур", "/predictions?focus=separate_circuit"],
          ["Sample / Dev only", "/predictions?focus=sample"],
          ["Demo", "/predictions?focus=demo"],
          ["Needs review", "/predictions?focus=needs_review"]
        ].map(([label, href]) => (
          <a key={href} href={href} className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan hover:text-white">
            {label}
          </a>
        ))}
      </div>
      <div className="grid gap-4">
        {rows.map((row) => <PredictionCard key={row.match.id} row={row} />)}
      </div>
    </div>
  );
}

type LifecycleBoard = Awaited<ReturnType<typeof getPredictionLifecycleBoard>>;
type LifecyclePick = LifecycleBoard["all"][number];

function PredictionLifecycleBoard({ board }: { board: LifecycleBoard }) {
  const sections = [
    { title: "Активные предикты", rows: board.active },
    { title: "Ожидают результата", rows: board.awaitingResult },
    { title: "Успешные", rows: board.successful },
    { title: "Ошибочные", rows: board.missed },
    { title: "Нужна проверка результата", rows: board.needsReview }
  ];
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-cyan">Prediction lifecycle</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Сохранённые предикты</h2>
          <p className="mt-1 text-sm text-lab-muted">Final picks сохраняются только до старта матча и только когда Real Forecast Ready=true.</p>
        </div>
        <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">{board.all.length} total</span>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-5">
        {sections.map((section) => (
          <div key={section.title} className="rounded border border-lab-border bg-lab-panel2 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-white">{section.title}</h3>
              <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-lab-muted">{section.rows.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {section.rows.slice(0, 3).map((pick) => <LifecyclePickCard key={`${section.title}-${pick.id}`} pick={pick} />)}
              {section.rows.length === 0 ? <p className="text-sm text-lab-muted">Пока пусто.</p> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LifecyclePickCard({ pick }: { pick: LifecyclePick }) {
  const predictedName =
    pick.predictedWinnerTeamId === pick.match.teamAId ? pick.match.teamA.name :
      pick.predictedWinnerTeamId === pick.match.teamBId ? pick.match.teamB.name :
        "не выбран";
  const statusTone =
    pick.status === "won" ? "text-lab-green" :
      pick.status === "lost" ? "text-lab-red" :
        pick.status === "pending" ? "text-lab-cyan" : "text-lab-amber";
  return (
    <article className="rounded border border-lab-border bg-lab-panel p-3 text-sm">
      <p className="font-medium text-white">{pick.match.teamA.name} vs {pick.match.teamB.name}</p>
      <p className="mt-1 text-lab-muted">Pick: {predictedName} · {pick.teamAProbability}% / {pick.teamBProbability}%</p>
      <p className="mt-1 text-lab-muted">Confidence {pick.confidence}/100 · risk {pick.risk}</p>
      <p className={`mt-1 font-medium ${statusTone}`}>{pick.status}</p>
      <a className="mt-2 inline-flex text-lab-cyan hover:text-white" href={`/match/${pick.matchId}#full-analysis`}>Post-match review</a>
    </article>
  );
}
