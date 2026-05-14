import Link from "next/link";
import { DashboardStatusStrip } from "@/components/DashboardStatusStrip";
import { MatchTable } from "@/components/MatchTable";
import { OneClickResearchButton } from "@/components/OneClickResearchButton";
import { PageHeader } from "@/components/ui";
import { getDashboardDataStatus } from "@/lib/data/dataCoverage";
import { getCalculatedMatches, type MatchFocusFilter } from "@/lib/data/matches";
import { getReadinessDistribution } from "@/lib/data/readinessDistribution";

type Search = {
  status?: string;
  format?: string;
  top?: string;
  confidence?: string;
  sourceMode?: string;
  focus?: MatchFocusFilter;
};

function filterLink(label: string, href: string) {
  return (
    <Link href={href} className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan hover:text-white">
      {label}
    </Link>
  );
}

export default async function MatchesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const [rows, status, readinessDistribution] = await Promise.all([
    getCalculatedMatches({
      status: params.status,
      format: params.format,
      top: params.top ? Number(params.top) : undefined,
      highConfidence: params.confidence === "high",
      sourceMode: params.sourceMode,
      focus: params.focus ?? "pro",
      limit: 60
    }),
    getDashboardDataStatus(),
    getReadinessDistribution()
  ]);
  const fullStatus = { ...status, readinessDistribution };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Match center"
        title="Матчи"
        description="По умолчанию включены топовые матчи. Lower-tier, академки и отдельный контур остаются доступны через фильтры, но не подмешиваются в основной путь."
      />
      <DashboardStatusStrip status={fullStatus} />
      <OneClickResearchButton compact />
      <div className="flex flex-wrap gap-2">
        {filterLink("Топовые матчи", "/matches")}
        {filterLink("Upcoming", "/matches?status=upcoming")}
        {filterLink("Live", "/matches?status=live")}
        {filterLink("Finished", "/matches?status=finished")}
        {filterLink("BO3", "/matches?format=BO3")}
        {filterLink("Top 50", "/matches?focus=top50")}
        {filterLink("Top 100", "/matches?focus=top100")}
        {filterLink("Watchlist", "/matches?focus=watchlist")}
        {filterLink("Известные турниры", "/matches?focus=known")}
        {filterLink("All real", "/matches?focus=all_real")}
        {filterLink("Низший тир / академки", "/matches?focus=lower_tier")}
        {filterLink("Отдельный контур", "/matches?focus=separate_circuit")}
        {filterLink("Sample / Dev only", "/matches?focus=sample")}
        {filterLink("Demo", "/matches?focus=demo")}
        {filterLink("Needs review", "/matches?focus=needs_review")}
        {filterLink("High confidence", "/matches?confidence=high")}
      </div>
      <MatchTable rows={rows} />
    </div>
  );
}
