import Link from "next/link";
import { AutoAllButton } from "@/components/AutoAllButton";
import { StatusPill } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { LightweightMatchSummary } from "@/lib/data/matchSummaries";

export function LightweightMatchCard({ row }: { row: LightweightMatchSummary }) {
  const tone =
    row.cachedForecastabilityTier === "READY" ? "green" :
      row.cachedForecastabilityTier === "NEARLY_READY" ? "amber" :
        row.cachedForecastabilityTier === "BLOCKED" ? "red" : "cyan";
  return (
    <article className="rounded border border-lab-border bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-cyan">{row.eventName}</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{row.teamA.name} vs {row.teamB.name}</h3>
          <p className="mt-1 text-sm text-lab-muted">
            {formatDateTime(row.startTime)} · {row.format} · {row.status} · {row.isLan ? "LAN" : "Online"}
          </p>
        </div>
        <StatusPill label={row.cachedForecastabilityLabel} tone={tone} />
      </div>
      <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-xs uppercase text-lab-muted">Coverage cache</p>
          <p className="mt-1 font-semibold text-white">{row.cachedCoverageScore ?? "n/a"}/100</p>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-xs uppercase text-lab-muted">Priority</p>
          <p className="mt-1 text-white">{row.priority.priorityLabel} · {row.priority.priorityScore}</p>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-xs uppercase text-lab-muted">Ranks</p>
          <p className="mt-1 text-lab-muted">{row.teamA.valveRank ?? row.teamA.hltvRank ?? "-"} / {row.teamB.valveRank ?? row.teamB.hltvRank ?? "-"}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/match/${row.id}#full-analysis`} className="rounded bg-lab-cyan px-3 py-1.5 text-sm font-semibold text-black">
          Полный анализ
        </Link>
        <Link href={`/match/${row.id}`} className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-cyan hover:border-lab-cyan">
          Открыть
        </Link>
      </div>
      {row.status === "upcoming" ? (
        <div className="mt-4">
          <AutoAllButton matchId={row.id} teamA={row.teamA.name} teamB={row.teamB.name} compact />
        </div>
      ) : null}
    </article>
  );
}
