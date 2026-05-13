import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { CalculatedMatch } from "@/lib/data/matches";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ProbabilityBar } from "./ProbabilityBar";
import { ReadinessBadge } from "./ReadinessBadge";
import { RiskBadge } from "./RiskBadge";
import { SourceModeBadge } from "./SourceModeBadge";

export function MatchCard({ row }: { row: CalculatedMatch }) {
  const { match, prediction } = row;
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
    </article>
  );
}
