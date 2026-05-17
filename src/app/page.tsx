import Link from "next/link";
import { DashboardStatusStrip } from "@/components/DashboardStatusStrip";
import { ForecastAutopilotButton } from "@/components/ForecastAutopilotButton";
import { ForecastCommandCenter } from "@/components/ForecastCommandCenter";
import { ForecastConciergePanel } from "@/components/ForecastConciergePanel";
import { MatchCard } from "@/components/MatchCard";
import { MatchFeedRefreshButton } from "@/components/MatchFeedRefreshButton";
import { OneClickResearchButton } from "@/components/OneClickResearchButton";
import { ActionButton, InfoBanner, PageHeader, StatCard } from "@/components/ui";
import { getAutoResearchMetrics } from "@/lib/autoResearch";
import { getDashboardDataStatus } from "@/lib/data/dataCoverage";
import { getCalculatedMatches } from "@/lib/data/matches";
import { getReadinessDistribution } from "@/lib/data/readinessDistribution";
import { getMatchFeedStatus } from "@/lib/matchFeedCache";
import { buildSourceSetupChecklist, isNoExtraApiMode } from "@/lib/sourceSetup";
import { getBestNextAction } from "@/lib/bestNextAction";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [upcoming, live, finished, status, readinessDistribution, commandMetrics, matchFeedStatus] = await Promise.all([
    getCalculatedMatches({ status: "upcoming", limit: 6, focus: "pro" }),
    getCalculatedMatches({ status: "live", limit: 3, focus: "pro" }),
    getCalculatedMatches({ status: "finished", limit: 3, focus: "pro" }),
    getDashboardDataStatus(),
    getReadinessDistribution(),
    getAutoResearchMetrics(),
    getMatchFeedStatus()
  ]);
  const fullStatus = { ...status, readinessDistribution };
  const sourceSetup = buildSourceSetupChecklist(false, status.teamsWithPlayerRoster > 0 || status.matchesEnoughForBasicPrediction > 0);
  const noExtraApiMode = isNoExtraApiMode(sourceSetup);
  const globalAction = upcoming[0] ? getBestNextAction(upcoming[0].prediction).primaryAction : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dark Esport Dashboard"
        title="CS2 Match Prediction Lab"
        description="Командный центр для объяснимой CS2-аналитики: видно, какие прогнозы готовы, где только basic signal и какое одно действие сильнее всего улучшит матч."
        actions={
          <>
            <ActionButton href="#forecast-autopilot">Найти лучший матч для прогноза</ActionButton>
            <ActionButton href="#auto-refresh" tone="violet">Обновить список матчей</ActionButton>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Реальные прогнозы готовы" value={commandMetrics.readyForecasts} detail="Можно открывать полный разбор" tone="green" />
        <StatCard label="Базовые прогнозы" value={commandMetrics.basicPreview} detail="Есть signal, но deep data ограничены" tone="cyan" />
        <StatCard label="Нужно одно действие" value={commandMetrics.needsManualData} detail="Лучший путь через data pack или demo" tone="amber" />
        <StatCard label="Нужно подключить источник" value={commandMetrics.sourceSetupNeeded} detail="GRID/Liquipedia/FACEIT optional" tone="violet" />
        <StatCard label="Нужно загрузить demo" value={Math.max(0, commandMetrics.needsManualData - commandMetrics.matchesWithMapVeto)} detail="Самый сильный free deep path" tone="blue" />
      </section>

      {noExtraApiMode ? (
        <InfoBanner title="Эти данные недоступны в basic free mode" tone="cyan">
          Сайт работает в basic free mode. Это нормально: автоматически доступны матчи, рейтинги, патчи и basic history. Для аналитического прогноза добавьте data pack, parsed demo или подключите API.
        </InfoBanner>
      ) : null}

      {globalAction ? (
        <InfoBanner title="Следующее лучшее действие" tone="violet">
          <Link href={globalAction.href} className="font-semibold text-white hover:text-lab-cyan">{globalAction.label}</Link>
          <span className="ml-2">{globalAction.reason}</span>
        </InfoBanner>
      ) : null}

      <section id="auto-refresh">
        <MatchFeedRefreshButton status={matchFeedStatus} />
      </section>

      <section>
        <OneClickResearchButton />
      </section>

      <section id="forecast-autopilot">
        <ForecastAutopilotButton />
      </section>

      <ForecastConciergePanel mode="home" metrics={commandMetrics} />

      <ForecastCommandCenter metrics={commandMetrics} />

      <DashboardStatusStrip status={fullStatus} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Лучшие матчи для анализа</h2>
          <Link href="/matches?status=upcoming&focus=all_real" className="text-sm text-lab-cyan">Все матчи</Link>
        </div>
        {upcoming.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {upcoming.map((row) => <MatchCard key={row.match.id} row={row} />)}
          </div>
        ) : (
          <div className="rounded border border-lab-border bg-lab-panel p-5">
            <h3 className="font-semibold text-white">Мало топовых матчей сейчас</h3>
            <p className="mt-2 text-sm text-lab-muted">Низший тир, академки, separate-circuit и demo не подмешиваются в Pro Focus молча.</p>
            <Link href="/matches?status=upcoming&focus=all_real" className="mt-3 inline-flex rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black">
              Показать все реальные матчи
            </Link>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-xl font-semibold text-white">Live matches</h2>
          <div className="grid gap-4">
            {live.map((row) => <MatchCard key={row.match.id} row={row} />)}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-xl font-semibold text-white">Finished matches</h2>
          <div className="grid gap-4">
            {finished.map((row) => <MatchCard key={row.match.id} row={row} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
