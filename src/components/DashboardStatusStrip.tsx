import { formatDateTime } from "@/lib/format";
import type { ReadinessDistribution } from "@/lib/data/readinessDistribution";

export type DashboardStatus = {
  lastPandaScoreSyncAt?: Date | string | null;
  lastValveSyncAt?: Date | string | null;
  lastCsUpdatesSyncAt?: Date | string | null;
  lastPredictionRecalculationAt?: Date | string | null;
  realMatchesCount: number;
  proFocusCount: number;
  averageDataQuality: number;
  fixtureOnlyCount: number;
  readinessDistribution?: ReadinessDistribution;
};

export function DashboardStatusStrip({ status }: { status: DashboardStatus }) {
  const items = [
    ["Last PandaScore sync", formatMaybeDate(status.lastPandaScoreSyncAt)],
    ["Last Valve sync", formatMaybeDate(status.lastValveSyncAt)],
    ["Last CS Updates sync", formatMaybeDate(status.lastCsUpdatesSyncAt)],
    ["Last prediction recalculation", formatMaybeDate(status.lastPredictionRecalculationAt)],
    ["Real matches", String(status.realMatchesCount)],
    ["Pro Focus", String(status.proFocusCount)],
    ["Avg data quality", `${Math.round(status.averageDataQuality)}/100`],
    ["Fixture-only", String(status.fixtureOnlyCount)],
    ...(status.readinessDistribution
      ? [
          ["Readiness L0/L1", `${status.readinessDistribution.L0_FIXTURE_ONLY}/${status.readinessDistribution.L1_BASIC_CONTEXT}`],
          ["Readiness L2/L3/L4", `${status.readinessDistribution.L2_BASIC_PREDICTION}/${status.readinessDistribution.L3_ANALYTICAL}/${status.readinessDistribution.L4_DEEP}`],
          ["Actionable previews", `${status.readinessDistribution.actionable}/${status.readinessDistribution.nonActionable}`],
          ["Real actionable", String(status.readinessDistribution.realActionable)],
          ["Sample actionable", String(status.readinessDistribution.sampleActionable)]
        ]
      : [])
  ];

  return (
    <section className="grid gap-2 rounded border border-lab-border bg-lab-panel p-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded border border-lab-border bg-lab-panel2 px-3 py-2">
          <p className="text-xs uppercase text-lab-muted">{label}</p>
          <p className="mt-1 text-sm text-white">{value}</p>
        </div>
      ))}
    </section>
  );
}

function formatMaybeDate(value?: Date | string | null) {
  return value ? formatDateTime(value) : "never";
}
