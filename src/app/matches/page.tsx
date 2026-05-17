import Link from "next/link";
import { DashboardStatusStrip } from "@/components/DashboardStatusStrip";
import { MatchTable } from "@/components/MatchTable";
import { MatchFeedRefreshButton } from "@/components/MatchFeedRefreshButton";
import { OneClickResearchButton } from "@/components/OneClickResearchButton";
import { PageHeader } from "@/components/ui";
import { rankForecastAutopilotCandidates, scoreForecastAutopilotCandidate } from "@/lib/autoResearch/candidateSelector";
import { getDashboardDataStatus } from "@/lib/data/dataCoverage";
import { getCalculatedMatches, type MatchFocusFilter } from "@/lib/data/matches";
import { getReadinessDistribution } from "@/lib/data/readinessDistribution";
import { getMatchFeedStatus } from "@/lib/matchFeedCache";

type Search = {
  status?: string;
  format?: string;
  top?: string;
  confidence?: string;
  sourceMode?: string;
  focus?: MatchFocusFilter;
  sort?: string;
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
  const [rows, status, readinessDistribution, matchFeedStatus] = await Promise.all([
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
    getReadinessDistribution(),
    getMatchFeedStatus()
  ]);
  const fullStatus = { ...status, readinessDistribution };
  const sortedRows = params.sort === "forecastable"
    ? sortByForecastability(rows)
    : rows;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Match center"
        title="Матчи"
        description="По умолчанию включены топовые матчи. Lower-tier, академки и отдельный контур остаются доступны через фильтры, но не подмешиваются в основной путь."
      />
      <MatchFeedRefreshButton status={matchFeedStatus} compact />
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
        {filterLink("Лучшие для прогноза", "/matches?status=upcoming&focus=all_real&sort=forecastable")}
        {filterLink("Низший тир / академки", "/matches?focus=lower_tier")}
        {filterLink("Отдельный контур", "/matches?focus=separate_circuit")}
        {filterLink("Sample / Dev only", "/matches?focus=sample")}
        {filterLink("Demo", "/matches?focus=demo")}
        {filterLink("Needs review", "/matches?focus=needs_review")}
        {filterLink("High confidence", "/matches?confidence=high")}
      </div>
      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Analyst / Advanced mode</summary>
        <div className="mt-4 space-y-4">
          <DashboardStatusStrip status={fullStatus} />
          <OneClickResearchButton compact />
        </div>
      </details>
      <MatchTable rows={sortedRows} />
    </div>
  );
}

function sortByForecastability(rows: Awaited<ReturnType<typeof getCalculatedMatches>>) {
  const scored = rows.map((row) => scoreForecastAutopilotCandidate({ input: row.input, prediction: row.prediction, priority: row.priority }));
  const order = new Map(rankForecastAutopilotCandidates(scored).map((candidate, index) => [candidate.matchId, index]));
  return [...rows].sort((a, b) => (order.get(a.match.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.match.id) ?? Number.MAX_SAFE_INTEGER));
}
