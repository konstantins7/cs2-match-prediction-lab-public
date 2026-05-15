import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { CalculatedMatch } from "@/lib/data/matches";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ProbabilityBar } from "./ProbabilityBar";
import { ReadinessBadge } from "./ReadinessBadge";
import { RiskBadge } from "./RiskBadge";
import { SourceModeBadge } from "./SourceModeBadge";
import { RealForecastBadge, SourceLevelBadge } from "./RealForecastBadge";
import { getBestNextAction, humanForecastStatus } from "@/lib/bestNextAction";
import { ActionButton, DataDepthMeter, StatusPill } from "@/components/ui";
import { deriveDataDepth, deriveRealDataDepth } from "@/lib/ui/forecastUx";

export function MatchCard({ row }: { row: CalculatedMatch }) {
  const { match, prediction } = row;
  const updatedAt = new Date(match.updatedAt);
  const stale = Number.isFinite(updatedAt.getTime()) ? Date.now() - updatedAt.getTime() > 7 * 24 * 60 * 60 * 1000 : true;
  const recalculatedAt = match.audits?.[0]?.createdAt;
  const humanStatus = humanForecastStatus(prediction);
  const nextAction = getBestNextAction(prediction);
  const depth = deriveDataDepth(row.input, prediction);
  const realDepth = deriveRealDataDepth(row.input, prediction);
  const missingBlocks = prediction.readiness.missingCriticalData.length
    ? prediction.readiness.missingCriticalData.slice(0, 2)
    : ["Критичных пропусков нет"];
  return (
    <article className="rounded-2xl border border-white/10 bg-lab-panel/85 p-4 shadow-[0_0_34px_rgba(8,13,22,0.38)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-cyan">{match.eventName}</p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {match.teamA.name} vs {match.teamB.name}
          </h3>
          <p className="mt-1 text-sm text-lab-muted">
            {match.stage} · {formatDateTime(match.startTime)} · {match.format} · {match.isLan ? "LAN" : "Online"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SourceModeBadge sourceMode={match.sourceMode} needsReview={match.needsReview} />
          <ReadinessBadge level={prediction.readiness.level} />
          <RealForecastBadge isReady={prediction.realForecast.isReady} />
          <StatusPill label={humanStatus} tone={prediction.realForecast.isReady ? "green" : prediction.sourceLevel === "Sample only" ? "purple" : "cyan"} />
          <SourceLevelBadge sourceLevel={prediction.sourceLevel} />
          {prediction.sourceLevel === "Sample only" && <span className="rounded border border-violet-400/70 px-2 py-1 text-xs text-violet-300">SAMPLE ONLY</span>}
          {match.isPinned && <span className="rounded border border-lab-green/60 px-2 py-1 text-xs text-lab-green">PINNED</span>}
          <span className="rounded border border-lab-border px-2 py-1 text-xs uppercase text-lab-muted">{row.priority.priorityLabel}</span>
          <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">{row.priority.visibilityTier}</span>
          <span className="rounded border border-lab-border px-2 py-1 text-xs uppercase text-lab-muted">{match.status}</span>
        </div>
      </div>

      <div className="mt-4">
        <ProbabilityBar
          teamAName={match.teamA.name}
          teamBName={match.teamB.name}
          teamAProbability={prediction.teamAProbability}
          teamBProbability={prediction.teamBProbability}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ConfidenceBadge value={prediction.confidenceScore} />
          <RiskBadge value={prediction.riskLevel} />
          <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">DQ {prediction.dataQualityScore}/100</span>
          {prediction.probabilityCap && <span className="rounded border border-lab-amber/60 px-2 py-1 text-xs text-lab-amber">Cap {prediction.probabilityCap.cap}/100</span>}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[0.75fr_0.75fr_1fr]">
        <DataDepthMeter depth={depth} title="Preview Data Depth" />
        <DataDepthMeter depth={realDepth} title="Real Data Depth" />
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs uppercase text-lab-muted">Чего не хватает</p>
          <ul className="mt-2 space-y-1 text-sm text-lab-muted">
            {missingBlocks.map((item) => <li key={`${match.id}-${item}`}>{item}</li>)}
          </ul>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-lab-cyan/30 bg-lab-cyan/10 p-3">
        <p className="text-xs uppercase text-lab-muted">Главное действие</p>
        <Link href={actionHref(nextAction.primaryAction.href, match.id)} className="mt-1 inline-flex text-sm font-medium text-white hover:text-lab-cyan">
          {nextAction.primaryAction.label}
        </Link>
        <p className="mt-1 text-xs text-lab-muted">{nextAction.primaryAction.reason}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton href={`/match/${match.id}`}>Разбор</ActionButton>
          <ActionButton href={actionHref(nextAction.primaryAction.href, match.id)} tone="ghost">Добавить данные</ActionButton>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-lab-muted md:grid-cols-3">
        <span>Матч обновлён: {formatDateTime(match.updatedAt)}</span>
        <span>Прогноз пересчитан: {recalculatedAt ? formatDateTime(recalculatedAt) : "нет"}</span>
        <span>Данные устарели: {stale ? "да" : "нет"}</span>
      </div>
    </article>
  );
}

function actionHref(href: string, matchId: string) {
  if (!href.startsWith("/admin/research-queue")) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}matchId=${encodeURIComponent(matchId)}`;
}
