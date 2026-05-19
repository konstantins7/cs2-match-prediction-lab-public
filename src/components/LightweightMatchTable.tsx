import Link from "next/link";
import { SourceModeBadge } from "@/components/SourceModeBadge";
import { StatusPill } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { LightweightMatchSummary } from "@/lib/data/matchSummaries";

export function LightweightMatchTable({ rows }: { rows: LightweightMatchSummary[] }) {
  return (
    <div className="overflow-x-auto rounded border border-lab-border bg-lab-panel">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-lab-panel2 text-xs uppercase text-lab-muted">
          <tr>
            <th className="px-3 py-3">Дата</th>
            <th className="px-3 py-3">Турнир</th>
            <th className="px-3 py-3">Формат</th>
            <th className="px-3 py-3">Матч</th>
            <th className="px-3 py-3">Источник</th>
            <th className="px-3 py-3">Priority</th>
            <th className="px-3 py-3">Cached readiness</th>
            <th className="px-3 py-3">Обновлено</th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-lab-border">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-lab-panel2/60">
              <td className="px-3 py-3 text-lab-muted">{formatDateTime(row.startTime)}</td>
              <td className="px-3 py-3">{row.eventName}</td>
              <td className="px-3 py-3">{row.format}</td>
              <td className="px-3 py-3">
                {row.teamA.name} <span className="text-lab-muted">vs</span> {row.teamB.name}
                <div className="text-xs text-lab-muted">Rank {row.teamA.valveRank ?? row.teamA.hltvRank ?? "-"} / {row.teamB.valveRank ?? row.teamB.hltvRank ?? "-"}</div>
              </td>
              <td className="px-3 py-3"><SourceModeBadge sourceMode={row.sourceMode} needsReview={row.needsReview} /></td>
              <td className="px-3 py-3">
                <div className="text-white">{row.priority.priorityLabel}</div>
                <div className="text-xs text-lab-muted">{row.priority.visibilityTier} · {row.priority.priorityScore}</div>
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  <StatusPill label={row.cachedForecastabilityLabel} tone={row.cachedForecastabilityTier === "READY" ? "green" : row.cachedForecastabilityTier === "NEARLY_READY" ? "amber" : row.cachedForecastabilityTier === "BLOCKED" ? "red" : "cyan"} />
                  <span className="rounded border border-lab-cyan/50 bg-lab-cyan/10 px-2 py-1 text-xs text-lab-cyan">{row.cachedCoverageScore ?? "n/a"}/100</span>
                </div>
                <div className="mt-2 text-xs text-lab-muted">
                  Cache: {row.cachedForecastabilityAt ? formatDateTime(row.cachedForecastabilityAt) : "not calculated"}
                </div>
              </td>
              <td className="px-3 py-3 text-xs text-lab-muted">{formatDateTime(row.updatedAt)}</td>
              <td className="px-3 py-3">
                <Link href={`/match/${row.id}#full-analysis`} className="text-lab-cyan hover:text-cyan-200">Полный анализ</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
