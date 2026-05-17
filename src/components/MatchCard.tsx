import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { CalculatedMatch } from "@/lib/data/matches";
import { scoreForecastAutopilotCandidate } from "@/lib/autoResearch/candidateSelector";
import { StatusPill } from "@/components/ui";

export function MatchCard({ row }: { row: CalculatedMatch }) {
  const { match, prediction } = row;
  const autopilot = scoreForecastAutopilotCandidate({ input: row.input, prediction, priority: row.priority });
  return (
    <article className="rounded border border-lab-border bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-cyan">{match.eventName}</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{match.teamA.name} vs {match.teamB.name}</h3>
          <p className="mt-1 text-sm text-lab-muted">
            {formatDateTime(match.startTime)} · {match.format} · {match.status} · {match.isLan ? "LAN" : "Online"}
          </p>
        </div>
        <StatusPill label={autopilot.forecastabilityLabel} tone={prediction.realForecast.isReady ? "green" : autopilot.forecastabilityTier === "BLOCKED" ? "red" : autopilot.forecastabilityTier === "NEARLY_READY" ? "amber" : "cyan"} />
      </div>
      <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-xs uppercase text-lab-muted">Coverage</p>
          <p className="mt-1 font-semibold text-white">{autopilot.coverageScore}/100</p>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-xs uppercase text-lab-muted">Confidence / risk</p>
          <p className="mt-1 text-white">{prediction.confidenceScore}/100 · {prediction.riskLevel}</p>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-xs uppercase text-lab-muted">Не хватает</p>
          <p className="mt-1 text-lab-muted">{autopilot.blockers[0] ?? autopilot.missingBlocks[0] ?? "Критичных blockers нет"}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/match/${match.id}#full-analysis`} className="rounded bg-lab-cyan px-3 py-1.5 text-sm font-semibold text-black">
          Полный анализ
        </Link>
        <Link href={`/match/${match.id}`} className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-cyan hover:border-lab-cyan">
          Открыть
        </Link>
      </div>
    </article>
  );
}
