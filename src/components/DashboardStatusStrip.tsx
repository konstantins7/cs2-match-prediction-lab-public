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
    ["Последний sync PandaScore", formatMaybeDate(status.lastPandaScoreSyncAt)],
    ["Последний sync рейтингов", formatMaybeDate(status.lastValveSyncAt)],
    ["Последний sync CS2 updates", formatMaybeDate(status.lastCsUpdatesSyncAt)],
    ["Прогноз пересчитан", formatMaybeDate(status.lastPredictionRecalculationAt)],
    ["Реальные матчи", String(status.realMatchesCount)],
    ["Топовые матчи", String(status.proFocusCount)],
    ["Качество данных", `${Math.round(status.averageDataQuality)}/100`],
    ["Только базовые данные", String(status.fixtureOnlyCount)],
    ...(status.readinessDistribution
      ? [
          ["Готовность L0/L1", `${status.readinessDistribution.L0_FIXTURE_ONLY}/${status.readinessDistribution.L1_BASIC_CONTEXT}`],
          ["Готовность L2/L3/L4", `${status.readinessDistribution.L2_BASIC_PREDICTION}/${status.readinessDistribution.L3_ANALYTICAL}/${status.readinessDistribution.L4_DEEP}`],
          ["Actionable / preview", `${status.readinessDistribution.actionable}/${status.readinessDistribution.nonActionable}`],
          ["Реальные готовые", String(status.readinessDistribution.realActionable)],
          ["Тестовые готовые", String(status.readinessDistribution.sampleActionable)]
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
