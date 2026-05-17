import Link from "next/link";
import { DashboardStatusStrip } from "@/components/DashboardStatusStrip";
import { ForecastAutopilotButton } from "@/components/ForecastAutopilotButton";
import { ForecastCommandCenter } from "@/components/ForecastCommandCenter";
import { ForecastConciergePanel } from "@/components/ForecastConciergePanel";
import { MatchCard } from "@/components/MatchCard";
import { MatchFeedRefreshButton } from "@/components/MatchFeedRefreshButton";
import { OneClickResearchButton } from "@/components/OneClickResearchButton";
import { ActionButton, InfoBanner, PageHeader } from "@/components/ui";
import { rankForecastAutopilotCandidates, scoreForecastAutopilotCandidate } from "@/lib/autoResearch/candidateSelector";
import { getAutoResearchMetrics } from "@/lib/autoResearch";
import { getDashboardDataStatus } from "@/lib/data/dataCoverage";
import { getCalculatedMatches } from "@/lib/data/matches";
import { getReadinessDistribution } from "@/lib/data/readinessDistribution";
import { getMatchFeedStatus } from "@/lib/matchFeedCache";
import { buildSourceSetupChecklist, isNoExtraApiMode } from "@/lib/sourceSetup";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();
  const [upcoming, live, status, readinessDistribution, commandMetrics, matchFeedStatus] = await Promise.all([
    getCalculatedMatches({ status: "upcoming", limit: 24, focus: "all_real" }),
    getCalculatedMatches({ status: "live", limit: 6, focus: "all_real" }),
    getDashboardDataStatus(),
    getReadinessDistribution(),
    getAutoResearchMetrics(),
    getMatchFeedStatus()
  ]);
  const fullStatus = { ...status, readinessDistribution };
  const sourceSetup = buildSourceSetupChecklist(false, status.teamsWithPlayerRoster > 0 || status.matchesEnoughForBasicPrediction > 0);
  const noExtraApiMode = isNoExtraApiMode(sourceSetup);
  const today = upcoming.filter((row) => sameDay(new Date(row.match.startTime), now)).slice(0, 6);
  const nearby = upcoming.filter((row) => !sameDay(new Date(row.match.startTime), now)).slice(0, 6);
  const bestIds = rankForecastAutopilotCandidates(upcoming.map((row) => scoreForecastAutopilotCandidate({ input: row.input, prediction: row.prediction, priority: row.priority })))
    .slice(0, 5)
    .map((candidate) => candidate.matchId);
  const byId = new Map(upcoming.map((row) => [row.match.id, row]));
  const best = bestIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CS2 Match Prediction Lab"
        title="Матчи и прогнозы без лишней админки"
        description="Обновите список матчей, выберите игру и нажмите Полный анализ. Если финальный прогноз ещё не готов, сайт покажет одно главное действие."
        actions={
          <>
            <ActionButton href="#match-feed">Обновить список матчей</ActionButton>
            <ActionButton href="#forecast-autopilot" tone="violet">Найти лучший матч для прогноза</ActionButton>
          </>
        }
      />

      <section id="match-feed">
        <MatchFeedRefreshButton status={matchFeedStatus} compact />
      </section>

      <section id="forecast-autopilot">
        <ForecastAutopilotButton compact />
      </section>

      <MatchSection title="Матчи сейчас" rows={live} empty="Live матчей сейчас нет." />
      <MatchSection title="Сегодня" rows={today} empty="На сегодня в cache нет upcoming матчей." />
      <MatchSection title="Ближайшие" rows={nearby} empty="Ближайших upcoming матчей пока нет." />
      <MatchSection title="Лучшие для прогноза" rows={best} empty="Autopilot candidates пока не найдены." />

      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Analyst / Advanced mode</summary>
        <div className="mt-5 space-y-5">
          {noExtraApiMode ? (
            <InfoBanner title="Эти данные недоступны в basic free mode" tone="cyan">
              Сайт работает в basic free mode. Для аналитического прогноза добавьте data pack, parsed demo или подключите API.
            </InfoBanner>
          ) : null}
          <OneClickResearchButton compact />
          <ForecastConciergePanel mode="home" metrics={commandMetrics} />
          <ForecastCommandCenter metrics={commandMetrics} />
          <DashboardStatusStrip status={fullStatus} />
        </div>
      </details>
    </div>
  );
}

function MatchSection({ title, rows, empty }: { title: string; rows: Awaited<ReturnType<typeof getCalculatedMatches>>; empty: string }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <Link href="/matches?status=upcoming&focus=all_real&sort=forecastable" className="text-sm text-lab-cyan">Все матчи</Link>
      </div>
      {rows.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((row) => <MatchCard key={`${title}-${row.match.id}`} row={row} />)}
        </div>
      ) : (
        <div className="rounded border border-lab-border bg-lab-panel p-4 text-sm text-lab-muted">{empty}</div>
      )}
    </section>
  );
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
