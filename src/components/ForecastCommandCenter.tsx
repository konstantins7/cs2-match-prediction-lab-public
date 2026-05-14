import Link from "next/link";
import type { AutoResearchMetrics } from "@/lib/autoResearchShared";

type Props = {
  metrics: AutoResearchMetrics;
  compact?: boolean;
};

export function ForecastCommandCenter({ metrics, compact = false }: Props) {
  const cards = [
    {
      label: "Реальные прогнозы готовы",
      value: metrics.readyForecasts,
      color: "text-lab-green",
      matchesHref: "/predictions?forecast=ready",
      actionHref: "/predictions?forecast=ready",
      setupHref: "/admin/sources"
    },
    {
      label: "Базовые прогнозы",
      value: metrics.basicPreview,
      color: "text-lab-cyan",
      matchesHref: "/predictions?readiness=L2_BASIC_PREDICTION",
      actionHref: "/admin/research-queue?group=needs_l3",
      setupHref: "/admin/sources"
    },
    {
      label: "Нужно одно действие",
      value: metrics.needsManualData,
      color: "text-lab-amber",
      matchesHref: "/predictions?readiness=L1_BASIC_CONTEXT",
      actionHref: "/admin/research-queue?group=primary_action",
      setupHref: "/admin/sources"
    },
    {
      label: "Нужно подключить источник",
      value: metrics.sourceSetupNeeded,
      color: "text-lab-amber",
      matchesHref: "/matches?focus=needs_data",
      actionHref: "/admin/sources#source-playbook",
      setupHref: "/admin/sources#source-playbook"
    },
    {
      label: "Нужно загрузить demo",
      value: Math.max(0, metrics.needsManualData - metrics.matchesWithMapVeto),
      color: "text-lab-green",
      matchesHref: "/matches?focus=needs_data",
      actionHref: "/admin/research-queue?template=parsed_demo",
      setupHref: "/admin/research-queue?template=parsed_demo"
    }
  ] as const;

  return (
    <section className={compact ? "rounded border border-lab-border bg-lab-panel2 p-4" : "rounded border border-lab-cyan/40 bg-lab-panel p-5"}>
      <div>
        <p className="text-sm uppercase tracking-wide text-lab-cyan">Forecast Command Center</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Что можно делать прямо сейчас</h2>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded border border-lab-border bg-lab-panel2 p-3">
            <p className="text-xs uppercase text-lab-muted">{card.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${card.color}`}>{card.value}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={card.matchesHref} className="rounded border border-lab-border px-2 py-1 text-xs text-lab-cyan hover:border-lab-cyan">
                Показать матчи
              </Link>
              <Link href={card.actionHref} className="rounded border border-lab-border px-2 py-1 text-xs text-lab-cyan hover:border-lab-cyan">
                Что нужно сделать
              </Link>
              <Link href={card.setupHref} className="rounded border border-lab-border px-2 py-1 text-xs text-lab-cyan hover:border-lab-cyan">
                Подключить источники
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
