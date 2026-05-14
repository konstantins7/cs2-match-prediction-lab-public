import { DashboardStatusStrip } from "@/components/DashboardStatusStrip";
import { PredictionCard } from "@/components/PredictionCard";
import { PageHeader } from "@/components/ui";
import { getDashboardDataStatus } from "@/lib/data/dataCoverage";
import { getCalculatedMatches, type MatchFocusFilter } from "@/lib/data/matches";
import { getReadinessDistribution } from "@/lib/data/readinessDistribution";

export const dynamic = "force-dynamic";

type Search = { sourceMode?: string; focus?: MatchFocusFilter };

export default async function PredictionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const [rows, status, readinessDistribution] = await Promise.all([
    getCalculatedMatches({ status: "upcoming", limit: 20, sourceMode: params.sourceMode, focus: params.focus ?? "pro" }),
    getDashboardDataStatus(),
    getReadinessDistribution()
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Forecast board"
        title="Прогнозы"
        description="Карточки показывают readiness, глубину данных, risk/confidence и одно главное действие. Lower-tier матчи скрыты из основного фокуса, но доступны фильтрами."
      />
      <DashboardStatusStrip status={{ ...status, readinessDistribution }} />
      <div className="flex flex-wrap gap-2">
        {[
          ["Топовые матчи", "/predictions"],
          ["Top 50", "/predictions?focus=top50"],
          ["Top 100", "/predictions?focus=top100"],
          ["Watchlist", "/predictions?focus=watchlist"],
          ["Известные турниры", "/predictions?focus=known"],
          ["All real", "/predictions?focus=all_real"],
          ["Низший тир / академки", "/predictions?focus=lower_tier"],
          ["Отдельный контур", "/predictions?focus=separate_circuit"],
          ["Sample / Dev only", "/predictions?focus=sample"],
          ["Demo", "/predictions?focus=demo"],
          ["Needs review", "/predictions?focus=needs_review"]
        ].map(([label, href]) => (
          <a key={href} href={href} className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan hover:text-white">
            {label}
          </a>
        ))}
      </div>
      <div className="grid gap-4">
        {rows.map((row) => <PredictionCard key={row.match.id} row={row} />)}
      </div>
    </div>
  );
}
