import Link from "next/link";
import { DashboardStatusStrip } from "@/components/DashboardStatusStrip";
import { LightweightMatchTable } from "@/components/LightweightMatchTable";
import { MatchFeedRefreshButton } from "@/components/MatchFeedRefreshButton";
import { OneClickResearchButton } from "@/components/OneClickResearchButton";
import { PageHeader } from "@/components/ui";
import type { MatchFocusFilter } from "@/lib/data/matches";
import { getCachedReadinessDistribution, getCommandCenterSummary, getLightweightMatchSummaries } from "@/lib/data/matchSummaries";
import { getMatchFeedStatus } from "@/lib/matchFeedCache";

type Search = {
  status?: string;
  format?: string;
  top?: string;
  confidence?: string;
  sourceMode?: string;
  focus?: MatchFocusFilter;
  sort?: string;
  page?: string;
  limit?: string;
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
  const [summaryPage, commandCenter, readinessDistribution, matchFeedStatus] = await Promise.all([
    getLightweightMatchSummaries({
      status: params.status,
      format: params.format,
      top: params.top ? Number(params.top) : undefined,
      sourceMode: params.sourceMode,
      focus: params.focus ?? "pro",
      sort: params.sort,
      page: params.page ? Number(params.page) : 1,
      limit: params.limit ? Number(params.limit) : 20
    }),
    getCommandCenterSummary(),
    getCachedReadinessDistribution(),
    getMatchFeedStatus()
  ]);
  const fullStatus = {
    realMatchesCount: commandCenter.upcoming + commandCenter.live + commandCenter.finished,
    proFocusCount: commandCenter.upcoming,
    averageDataQuality: 0,
    fixtureOnlyCount: commandCenter.uncached,
    readinessDistribution
  };

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
      <LightweightMatchTable rows={summaryPage.rows} />
      <Pagination page={summaryPage.page} hasNextPage={summaryPage.hasNextPage} params={params} />
    </div>
  );
}

function Pagination({ page, hasNextPage, params }: { page: number; hasNextPage: boolean; params: Search }) {
  const previous = page > 1 ? pageLink(params, page - 1) : "";
  const next = hasNextPage ? pageLink(params, page + 1) : "";
  return (
    <nav className="flex items-center justify-between rounded border border-lab-border bg-lab-panel p-3 text-sm">
      <span className="text-lab-muted">Page {page}</span>
      <div className="flex gap-2">
        {previous ? <Link href={previous} className="rounded border border-lab-border px-3 py-1.5 text-lab-cyan">Назад</Link> : null}
        {next ? <Link href={next} className="rounded border border-lab-border px-3 py-1.5 text-lab-cyan">Дальше</Link> : null}
      </div>
    </nav>
  );
}

function pageLink(params: Search, page: number) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && key !== "page") query.set(key, value);
  });
  query.set("page", String(page));
  return `/matches?${query.toString()}`;
}
