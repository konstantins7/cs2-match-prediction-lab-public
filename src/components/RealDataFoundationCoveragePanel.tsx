import Link from "next/link";
import type { RealDataFoundationCoverage } from "@/lib/autoResearchShared";

export function RealDataFoundationCoveragePanel({ coverage, compact = false }: { coverage: RealDataFoundationCoverage; compact?: boolean }) {
  const tierRows = [
    ["READY", "Готов"],
    ["NEARLY_READY", "Почти готов"],
    ["BASIC_ONLY", "Basic only"],
    ["NOT_ENOUGH_DATA", "Недостаточно"],
    ["BLOCKED", "Заблокирован"]
  ] as const;
  const coverageRows = [
    ["Roster", coverage.coverageCounts.roster],
    ["Player stats", coverage.coverageCounts.playerStats],
    ["Map stats", coverage.coverageCounts.mapStats],
    ["Veto", coverage.coverageCounts.veto],
    ["GRID mapped", coverage.coverageCounts.gridMapped]
  ] as const;

  return (
    <section className="rounded-2xl border border-lab-cyan/35 bg-lab-panel/85 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Real-data foundation coverage</h2>
          <p className="mt-1 text-sm text-lab-muted">
            Read-only срез upcoming матчей: где есть roster/player/map/veto foundation и что чаще всего мешает READY.
          </p>
        </div>
        <span className="rounded-full border border-lab-cyan/35 bg-lab-cyan/10 px-3 py-1 text-xs font-medium text-lab-cyan">
          {coverage.checkedCandidates} candidates
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        {tierRows.map(([key, label]) => (
          <div key={key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-lab-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{coverage.tierCounts[key]}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-white/10 bg-lab-panel/80 p-3">
          <p className="text-xs uppercase text-lab-muted">Foundation blocks</p>
          <div className="mt-3 grid gap-2 md:grid-cols-5">
            {coverageRows.map(([label, value]) => (
              <div key={label} className="rounded border border-lab-border bg-lab-panel2 p-2">
                <p className="text-xs text-lab-muted">{label}</p>
                <p className="mt-1 text-lg font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-lab-amber">{coverage.liquipediaSetup.message}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-lab-panel/80 p-3">
          <p className="text-xs uppercase text-lab-muted">Top blockers</p>
          <div className="mt-2 space-y-2 text-sm text-lab-muted">
            {coverage.blockerFrequency.slice(0, compact ? 4 : 6).map((item) => (
              <div key={item.blocker} className="flex items-center justify-between gap-3 rounded border border-lab-border bg-lab-panel2 px-3 py-2">
                <span>{item.blocker}</span>
                <span className="font-semibold text-white">{item.count}</span>
              </div>
            ))}
            {coverage.blockerFrequency.length === 0 ? <p>Критичных blockers не найдено.</p> : null}
          </div>
        </div>
      </div>

      {!compact ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-lab-panel/80 p-3">
          <p className="text-xs uppercase text-lab-muted">Top candidates and one action</p>
          <div className="mt-2 grid gap-2">
            {coverage.topCandidates.map((candidate, index) => (
              <div key={candidate.matchId} className="flex flex-wrap items-center justify-between gap-3 rounded border border-lab-border bg-lab-panel2 p-3 text-sm">
                <div>
                  <p className="font-medium text-white">{index + 1}. {candidate.teamAName} vs {candidate.teamBName}</p>
                  <p className="mt-1 text-xs text-lab-muted">{candidate.coverageScore}/100 · {candidate.forecastabilityLabel} · {candidate.selectionReason}</p>
                  {candidate.nextDataActions[0] ? (
                    <p className="mt-1 text-xs text-lab-amber">Одно действие до готовности: {candidate.nextDataActions[0].label}</p>
                  ) : null}
                </div>
                <Link href={candidate.href} className="rounded border border-lab-cyan/50 px-2 py-1 text-xs text-lab-cyan hover:bg-lab-cyan/10">
                  Открыть
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
