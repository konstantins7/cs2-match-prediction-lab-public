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

export function MatchCard({ row }: { row: CalculatedMatch }) {
  const { match, prediction } = row;
  const updatedAt = new Date(match.updatedAt);
  const stale = Number.isFinite(updatedAt.getTime()) ? Date.now() - updatedAt.getTime() > 7 * 24 * 60 * 60 * 1000 : true;
  const recalculatedAt = match.audits?.[0]?.createdAt;
  const humanStatus = humanForecastStatus(prediction);
  const nextAction = getBestNextAction(prediction);
  return (
    <article className="rounded border border-lab-border bg-lab-panel p-4">
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
          <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-cyan">{humanStatus}</span>
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
        <Link href={`/match/${match.id}`} className="rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black hover:bg-cyan-300">
          Разбор
        </Link>
      </div>
      <div className="mt-3 rounded border border-lab-border bg-lab-panel2 p-3">
        <p className="text-xs uppercase text-lab-muted">Главное действие</p>
        <Link href={actionHref(nextAction.primaryAction.href, match.id)} className="mt-1 inline-flex text-sm font-medium text-lab-cyan hover:text-cyan-200">
          {nextAction.primaryAction.label}
        </Link>
        <p className="mt-1 text-xs text-lab-muted">{nextAction.primaryAction.reason}</p>
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
