import Link from "next/link";
import type { CalculatedMatch } from "@/lib/data/matches";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ProbabilityBar } from "./ProbabilityBar";
import { RiskBadge } from "./RiskBadge";

export function PredictionCard({ row }: { row: CalculatedMatch }) {
  const { match, prediction } = row;
  const winner = prediction.predictedWinnerId === match.teamA.id ? match.teamA.name : match.teamB.name;
  const mainReasons = prediction.factors
    .filter((factor) => Math.abs(factor.impact) > 1)
    .sort((a, b) => Math.abs(b.impact * b.weight * b.confidence) - Math.abs(a.impact * a.weight * a.confidence))
    .slice(0, 3);
  return (
    <article className="rounded border border-lab-border bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-lab-muted">{match.eventName}</p>
          <h3 className="mt-1 text-xl font-semibold text-white">Модель склоняется к {winner}</h3>
          <p className="mt-1 text-sm text-lab-muted">
            {match.teamA.name} vs {match.teamB.name} · {match.format}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConfidenceBadge value={prediction.confidenceScore} />
          <RiskBadge value={prediction.riskLevel} />
        </div>
      </div>
      <div className="mt-4">
        <ProbabilityBar teamAName={match.teamA.name} teamBName={match.teamB.name} teamAProbability={prediction.teamAProbability} teamBProbability={prediction.teamBProbability} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-green">Главные причины</p>
          <ul className="mt-2 space-y-1 text-sm text-lab-muted">
            {mainReasons.map((factor) => (
              <li key={factor.factorName}>{factor.factorName}: {factor.explanation}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-amber">Что может сломать прогноз</p>
          <ul className="mt-2 space-y-1 text-sm text-lab-muted">
            {(prediction.warnings.length ? prediction.warnings : ["Veto, news и close-round variance нужно перепроверить перед матчем."]).slice(0, 3).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </div>
      <Link href={`/match/${match.id}`} className="mt-4 inline-flex rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black hover:bg-cyan-300">
        Полный разбор
      </Link>
    </article>
  );
}
