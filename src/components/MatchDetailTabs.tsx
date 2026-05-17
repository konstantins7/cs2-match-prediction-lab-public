"use client";

import { useState } from "react";
import { DataQualityPanel } from "./DataQualityPanel";
import { FactorBreakdownTable } from "./FactorBreakdownTable";
import { FactorContributionChart } from "./FactorContributionChart";
import { MapPoolMatrix } from "./MapPoolMatrix";
import { NewsImpactPanel, NewsRiskSummary } from "./NewsImpactPanel";
import { PlayerFormTable } from "./PlayerFormTable";
import { ProbabilityBar } from "./ProbabilityBar";
import { ReadinessBadge } from "./ReadinessBadge";
import { VetoScenarioCard } from "./VetoScenarioCard";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { DataCoveragePanel } from "./DataCoveragePanel";
import { DataSourcesTable } from "./DataSourcesTable";
import { RiskBadge } from "./RiskBadge";
import { SourceModeBadge } from "./SourceModeBadge";
import { RealForecastBadge, SourceLevelBadge } from "./RealForecastBadge";
import { MatchForecastStatusPanel } from "./MatchForecastStatusPanel";
import { ForecastAutopilotButton } from "./ForecastAutopilotButton";
import { FullMatchAnalysisPanel } from "./FullMatchAnalysisPanel";
import { ForecastConciergePanel } from "./ForecastConciergePanel";
import { DemoStatExportCta } from "./ImportProfilesPanel";
import { ManualEnrichmentPanel } from "./ManualEnrichmentPanel";
import { ParsedDemoExportPanel } from "./ParsedDemoExportPanel";
import { AnalystSheetImportPanel } from "./AnalystSheetImportPanel";
import { FirstRealForecastSheetSessionPanel } from "./FirstRealForecastSheetSessionPanel";
import { GridOpenAccessMatchPanel } from "./GridOpenAccessMatchPanel";
import { ConfidenceRiskExplainer, ForecastStory } from "@/components/ui";
import { FeatureSnapshotPanel, type FeatureSnapshotView } from "./FeatureSnapshotPanel";
import { SourceCoverageMatrix } from "./SourceCoverageMatrix";
import type { PredictionInput, PredictionOutput } from "@/lib/predictionEngine";
import type { SourceCoverageRow } from "@/lib/sourceCoverageMatrix";
import { formatDateTime } from "@/lib/format";
import type { MatchPriorityResult } from "@/lib/proFocus";
import { predictionHeadline, predictionReadinessCopy } from "@/lib/predictionCopy";
import type { ResearchTask } from "@/lib/researchQueueCore";
import { buildConfidenceRiskExplanation, buildForecastStory, deriveDataDepth, deriveRealDataDepth } from "@/lib/ui/forecastUx";
import type { FirstRealForecastSessionView } from "@/lib/firstRealForecastSheetSession";
import type { GridMatchStatus } from "@/lib/gridOpenAccess";
import type { ForecastAutopilotCandidate } from "@/lib/autoResearchShared";

const tabs = ["Обзор", "Факторы", "Карты и Veto", "Matchup", "Игроки", "Новости и события", "H2H", "Risk и confidence", "Объяснение"] as const;

export function MatchDetailTabs({
  input,
  prediction,
  priority,
  researchTasks = [],
  featureSnapshot,
  sourceCoverageRows = [],
  firstRealForecastSession,
  gridOpenAccessStatus,
  autopilotCandidate
}: {
  input: PredictionInput;
  prediction: PredictionOutput;
  priority?: MatchPriorityResult;
  researchTasks?: ResearchTask[];
  featureSnapshot?: FeatureSnapshotView | null;
  sourceCoverageRows?: SourceCoverageRow[];
  firstRealForecastSession?: FirstRealForecastSessionView;
  gridOpenAccessStatus?: GridMatchStatus;
  autopilotCandidate?: ForecastAutopilotCandidate;
}) {
  const [active, setActive] = useState<(typeof tabs)[number]>("Обзор");
  const hasVetoHistory = input.vetoPatternsA.length > 0 && input.vetoPatternsB.length > 0;
  const winner = prediction.predictedWinnerId === input.teamA.id ? input.teamA.name : input.teamB.name;
  const dataLimited =
    prediction.readiness.level === "L0_FIXTURE_ONLY" ||
    prediction.readiness.level === "L1_BASIC_CONTEXT" ||
    prediction.dataQualityScore < 40 ||
    Math.abs(prediction.teamAProbability - prediction.teamBProbability) <= 1 ||
    Boolean(input.dataCoverage?.fixtureOnly);

  return (
    <div className="space-y-5">
      <FullMatchAnalysisPanel matchId={input.match.id} />
      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Advanced: technical readiness and autopilot</summary>
        <div className="mt-4 space-y-4">
          <MatchForecastStatusPanel input={input} prediction={prediction} researchTasks={researchTasks} />
          <ForecastAutopilotButton matchId={input.match.id} compact />
        </div>
      </details>
      {autopilotCandidate ? <CurrentMatchAutopilotRecommendation candidate={autopilotCandidate} /> : null}
      <ForecastConciergePanel mode="match" input={input} prediction={prediction} researchTasks={researchTasks} />
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={active === tab ? "rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black" : "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan hover:text-white"}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === "Обзор" && (
        <section className="space-y-4">
          {input.match.sourceMode === "analyst_sample" ? (
            <div className="rounded border border-violet-400/60 bg-violet-950/20 p-4">
              <h2 className="font-semibold text-violet-100">SAMPLE DATA</h2>
              <p className="mt-2 text-sm text-violet-100/80">Это sample analyst pack для проверки pipeline, не реальный прогноз. Sample records match-scoped и не считаются real actionable.</p>
            </div>
          ) : null}
          {prediction.realForecast.sampleOnlyWarning ? (
            <div className="rounded border border-lab-amber/60 bg-lab-panel p-4">
              <h2 className="font-semibold text-lab-amber">Real forecast is not ready</h2>
              <p className="mt-2 text-sm text-lab-muted">{prediction.realForecast.sampleOnlyWarning}</p>
            </div>
          ) : null}
          <ForecastStory story={buildForecastStory(input, prediction)} />
          <ConfidenceRiskExplainer view={buildConfidenceRiskExplanation(prediction)} />
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded border border-lab-border bg-lab-panel p-5">
              <p className="text-sm uppercase tracking-wide text-lab-cyan">{input.match.eventName}</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">{input.teamA.name} vs {input.teamB.name}</h1>
              <p className="mt-2 text-sm text-lab-muted">{input.match.stage} · {formatDateTime(input.match.startTime)} · {input.match.format} · {input.match.isLan ? "LAN" : "Online"}</p>
              {dataLimited ? (
                <div className="mt-4 rounded border border-lab-amber/60 bg-lab-panel2 p-3">
                  <h2 className="font-semibold text-lab-amber">{predictionHeadline(prediction, winner)}</h2>
                  <p className="mt-2 text-sm leading-6 text-lab-muted">
                    {predictionReadinessCopy(prediction)}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-lab-muted">{prediction.explanation}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <SourceModeBadge sourceMode={input.match.sourceMode} needsReview={input.match.needsReview} />
                <ReadinessBadge level={prediction.readiness.level} />
                <RealForecastBadge isReady={prediction.realForecast.isReady} />
                <SourceLevelBadge sourceLevel={prediction.sourceLevel} />
                    {prediction.sourceLevel === "Sample only" && <span className="rounded border border-violet-400/70 px-2 py-1 text-xs text-violet-300">ТОЛЬКО ТЕСТОВЫЕ ДАННЫЕ</span>}
                {priority && <span className="rounded border border-lab-border px-2 py-1 text-xs uppercase text-lab-muted">{priority.priorityLabel}</span>}
                {priority && <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">{priority.visibilityTier}</span>}
                {input.match.isPinned && <span className="rounded border border-lab-green/60 px-2 py-1 text-xs text-lab-green">PINNED</span>}
                <ConfidenceBadge value={prediction.confidenceScore} />
                <RiskBadge value={prediction.riskLevel} />
                <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">DQ {prediction.dataQualityScore}/100</span>
                {prediction.probabilityCap && <span className="rounded border border-lab-amber/60 px-2 py-1 text-xs text-lab-amber">Probability cap {prediction.probabilityCap.cap}/100</span>}
              </div>
              <div className="mt-4 rounded border border-lab-border bg-lab-panel2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-lab-muted">Реальный прогноз готов</p>
                    <p className={prediction.realForecast.isReady ? "mt-1 text-sm text-lab-green" : "mt-1 text-sm text-lab-amber"}>{prediction.realForecast.label}</p>
                  </div>
                  <div className="text-sm text-lab-muted">Качество ручного real data pack: {prediction.manualRealPackQuality.score}/100 · {prediction.manualRealPackQuality.label}</div>
                </div>
                {!prediction.realForecast.isReady && (
                  <ul className="mt-2 space-y-1 text-sm text-lab-muted">
                    {prediction.realForecast.reasons.slice(0, 6).map((reason, index) => <li key={`real-forecast-reason-${index}-${reason.slice(0, 24)}`}>{reason}</li>)}
                  </ul>
                )}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded border border-lab-border bg-lab-panel2 p-3">
                  <p className="text-xs uppercase text-lab-muted">Почему такой статус</p>
                  <ul className="mt-2 space-y-1 text-sm text-lab-muted">
                    {prediction.readiness.reasons.map((reason, index) => <li key={`readiness-reason-${index}-${reason.slice(0, 24)}`}>{reason}</li>)}
                  </ul>
                </div>
                <div className="rounded border border-lab-border bg-lab-panel2 p-3">
                  <p className="text-xs uppercase text-lab-muted">Чего не хватает</p>
                  <ul className="mt-2 space-y-1 text-sm text-lab-muted">
                    {(prediction.readiness.missingCriticalData.length ? prediction.readiness.missingCriticalData : ["Критичных пропусков нет."]).slice(0, 6).map((item, index) => <li key={`readiness-missing-${index}-${item}`}>{item}</li>)}
                  </ul>
                </div>
              </div>
            </div>
            <div className="rounded border border-lab-border bg-lab-panel p-5">
              <ProbabilityBar teamAName={input.teamA.name} teamBName={input.teamB.name} teamAProbability={prediction.teamAProbability} teamBProbability={prediction.teamBProbability} />
            </div>
          </div>
          <details className="rounded border border-lab-border bg-lab-panel p-4">
            <summary className="cursor-pointer font-semibold text-lab-cyan">Analyst/Advanced: sources, data pack and diagnostics</summary>
            <div className="mt-4 space-y-4">
              <DataCoveragePanel input={input} />
              <NewsRiskSummary news={input.news} teamAId={input.teamA.id} teamBId={input.teamB.id} />
              <DataSourcesTable input={input} />
              {gridOpenAccessStatus ? <GridOpenAccessMatchPanel initialStatus={gridOpenAccessStatus} /> : null}
              {firstRealForecastSession ? (
                <FirstRealForecastSheetSessionPanel session={firstRealForecastSession} />
              ) : (
                <AnalystSheetImportPanel defaultMatchId={input.match.id} />
              )}
              <section className="rounded border border-lab-amber/35 bg-lab-panel p-4">
                <h2 className="font-semibold text-white">Data onboarding guardrails</h2>
                <p className="mt-2 text-sm text-lab-muted">
                  Первый реальный прогноз всё ещё требует реальные `roster.csv`, `player_stats.csv`, `map_stats.csv` и `veto_history.csv` для этого матча. Kaggle/offline datasets и personal Steam demos помогают training/calibration или demo pipeline, но не заменяют live match evidence.
                </p>
                <p className="mt-2 text-sm text-lab-amber">
                  CS Demo Manager полезен для прошлых матчей текущего состава; демка target match после старта не используется как pre-match evidence.
                </p>
              </section>
              <DemoStatExportCta />
              <ParsedDemoExportPanel defaultMatchId={input.match.id} />
              <ManualEnrichmentPanel
                defaultMatchId={input.match.id}
                initialTemplate="manual_real_pack"
                matchOptions={[{
                  matchId: input.match.id,
                  label: `${input.teamA.name} vs ${input.teamB.name} · ${formatDateTime(input.match.startTime)}`,
                  teamAName: input.teamA.name,
                  teamBName: input.teamB.name,
                  startTime: input.match.startTime,
                  readinessLevel: prediction.readiness.level,
                  realForecastReady: prediction.realForecast.isReady,
                  sourceLevel: prediction.sourceLevel,
                  previewDataDepth: deriveDataDepth(input, prediction),
                  realDataDepth: deriveRealDataDepth(input, prediction),
                  missingBlocks: [...prediction.readiness.missingCriticalData, ...prediction.realForecast.reasons],
                  tasks: researchTasks
                }]}
              />
              <ForecastReportBuilder input={input} prediction={prediction} featureSnapshot={featureSnapshot} />
              <FeatureSnapshotPanel snapshot={featureSnapshot} />
              <SourceCoverageMatrix rows={sourceCoverageRows} compact />
            </div>
          </details>
          <section className="rounded border border-lab-border bg-lab-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">Что нужно добрать для улучшения прогноза</h2>
                <p className="mt-1 text-sm text-lab-muted">Research Queue показывает, какие данные сильнее всего поднимут readiness.</p>
              </div>
              <a href={`/admin/research-queue?matchId=${encodeURIComponent(input.match.id)}`} className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-cyan hover:border-lab-cyan">Создать data pack</a>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {researchTasks.length > 0 ? researchTasks.slice(0, 8).map((task) => (
                <article key={task.id} className="rounded border border-lab-border bg-lab-panel2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-medium text-white">{task.task}</h3>
                    <span className={task.priority === "high" ? "rounded border border-lab-red/60 px-2 py-1 text-xs text-lab-red" : task.priority === "medium" ? "rounded border border-lab-amber/60 px-2 py-1 text-xs text-lab-amber" : "rounded border border-lab-border px-2 py-1 text-xs text-lab-muted"}>{task.priority}</span>
                  </div>
                  <p className="mt-2 text-sm text-lab-muted">{task.reason}</p>
                  <p className="mt-2 text-xs text-lab-cyan">{task.expectedImpact}</p>
                  <p className="mt-2 text-xs text-lab-muted">{task.status} · {task.actionState}</p>
                </article>
              )) : (
                <p className="text-sm text-lab-muted">Критичных research tasks сейчас нет.</p>
              )}
            </div>
          </section>
        </section>
      )}

      {active === "Факторы" && (
        <section className="space-y-4">
          <FactorContributionChart factors={prediction.factors} />
          <FactorBreakdownTable factors={prediction.factors} teamAName={input.teamA.name} teamBName={input.teamB.name} />
        </section>
      )}

      {active === "Карты и Veto" && (
        <section className="space-y-4">
          <MapPoolMatrix input={input} />
          {hasVetoHistory ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {prediction.vetoScenarios.map((scenario) => <VetoScenarioCard key={scenario.name} scenario={scenario} />)}
            </div>
          ) : (
            <div className="rounded border border-lab-border bg-lab-panel p-4">
              <p className="text-sm text-lab-amber">Veto scenario unavailable: no map/veto history.</p>
            </div>
          )}
        </section>
      )}

      {active === "Игроки" && (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold text-white">{input.teamA.name}</h2>
          <PlayerFormTable players={input.playersA} stats={input.playerStatsA} />
          <h2 className="text-xl font-semibold text-white">{input.teamB.name}</h2>
          <PlayerFormTable players={input.playersB} stats={input.playerStatsB} />
        </section>
      )}

      {active === "Matchup" && (
        <section className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <MatchupCard title={input.teamA.name} profile={input.opponentMatchupA} style={input.teamStyleA} />
            <MatchupCard title={input.teamB.name} profile={input.opponentMatchupB} style={input.teamStyleB} />
          </div>
          <div className="rounded border border-lab-border bg-lab-panel p-4">
            <h2 className="font-semibold text-white">Prediction data windows</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-lab-muted">
                  <tr><th className="py-2">Team</th><th>Window</th><th>Matches</th><th>Maps</th><th>DQ</th><th>Relevance</th></tr>
                </thead>
                <tbody className="divide-y divide-lab-border">
                  {input.dataWindows.map((window) => (
                    <tr key={`${window.teamId}-${window.windowType}`}>
                      <td className="py-2 text-white">{window.teamId === input.teamA.id ? input.teamA.name : input.teamB.name}</td>
                      <td>{window.windowType}</td>
                      <td>{window.matchesCount}</td>
                      <td>{window.mapsCount}</td>
                      <td>{Math.round(window.dataQualityScore)}</td>
                      <td>{Math.round(window.relevanceScore * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {input.sourceConflicts.length > 0 && (
            <div className="rounded border border-lab-amber/60 bg-lab-panel p-4">
              <h2 className="font-semibold text-lab-amber">Source conflicts</h2>
              <ul className="mt-3 space-y-2 text-sm text-lab-muted">
                {input.sourceConflicts.map((conflict) => (
                  <li key={`${conflict.source}-${conflict.externalId}`}>{conflict.source}: {conflict.externalName} · confidence {Math.round(conflict.confidence * 100)}% · {conflict.status}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {active === "Новости и события" && <NewsImpactPanel news={input.news} />}

      {active === "H2H" && (
        <section className="rounded border border-lab-border bg-lab-panel p-4">
          <h2 className="font-semibold text-white">Head-to-Head</h2>
          <div className="mt-3 space-y-2 text-sm text-lab-muted">
            {input.h2h.length === 0 ? <p>Нет релевантных H2H для текущих составов.</p> : input.h2h.map((entry) => (
              <p key={entry.matchId}>{formatDateTime(entry.date)} · {entry.format} · relevance {Math.round(entry.relevanceScore * 100)}% · roster similarity {Math.round(((entry.teamARosterSimilarity + entry.teamBRosterSimilarity) / 2) * 100)}%</p>
            ))}
          </div>
        </section>
      )}

      {active === "Risk и confidence" && (
        <section className="space-y-4">
          <DataQualityPanel input={input} prediction={prediction} />
          {priority && priority.hiddenReasons.length > 0 && (
            <div className="rounded border border-lab-amber/60 bg-lab-panel p-4">
              <h3 className="font-semibold text-lab-amber">Почему матч скрыт из Pro Focus?</h3>
              <ul className="mt-3 space-y-2 text-sm text-lab-muted">
                {priority.hiddenReasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Почему confidence повышен" items={prediction.riskBreakdown.confidenceDrivers} />
            <Panel title="Что снизило confidence" items={prediction.riskBreakdown.confidenceReducers} />
            <Panel title="Где не хватает данных" items={prediction.riskBreakdown.missingData} />
            <Panel title="Конфликты факторов и risk" items={[...prediction.riskBreakdown.conflictingFactors, ...prediction.riskBreakdown.riskReasons]} />
          </div>
        </section>
      )}

      {active === "Объяснение" && (
        <section className="rounded border border-lab-border bg-lab-panel p-5">
          <h2 className="text-xl font-semibold text-white">Человеческое объяснение</h2>
          <p className="mt-3 leading-7 text-lab-muted">{prediction.explanation}</p>
          <p className="mt-4 text-sm text-lab-amber">Перед матчем нужно перепроверить roster/news, veto и источник свежих map-level данных. Это не гарантия результата.</p>
        </section>
      )}
    </div>
  );
}

function CurrentMatchAutopilotRecommendation({ candidate }: { candidate: ForecastAutopilotCandidate }) {
  return (
    <section className="rounded border border-lab-cyan/35 bg-lab-panel2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-lab-cyan">Autopilot match readiness</p>
          <h2 className="mt-1 font-semibold text-white">{candidate.coverageScore}/100 · {candidate.forecastabilityLabel}</h2>
          <p className="mt-1 text-sm text-lab-muted">Real Data Depth {candidate.realDataDepth}/5 · readiness {candidate.readinessLevel} · Real Forecast Ready {candidate.realForecastReady ? "yes" : "no"}</p>
        </div>
        <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">{candidate.format}</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-lab-border bg-lab-panel p-3">
          <p className="text-xs uppercase text-lab-muted">Blockers</p>
          <ul className="mt-2 space-y-1 text-sm text-lab-muted">
            {[...candidate.blockers, ...candidate.missingBlocks].slice(0, 6).map((item, index) => <li key={`${candidate.matchId}-blocker-${index}-${item.slice(0, 18)}`}>{item}</li>)}
          </ul>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel p-3">
          <p className="text-xs uppercase text-lab-muted">Next minimal action</p>
          {candidate.nextDataActions[0] ? (
            <>
              <p className="mt-2 font-medium text-lab-amber">{candidate.nextDataActions[0].label}</p>
              <p className="mt-1 text-sm text-lab-muted">{candidate.nextDataActions[0].reason}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-lab-muted">Критичного действия не найдено.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ForecastReportBuilder({ input, prediction, featureSnapshot }: { input: PredictionInput; prediction: PredictionOutput; featureSnapshot?: FeatureSnapshotView | null }) {
  if (!prediction.realForecast.isReady) {
    const missing = prediction.readiness.missingCriticalData.length ? prediction.readiness.missingCriticalData : prediction.realForecast.reasons;
    return (
      <section className="rounded border border-lab-amber/60 bg-lab-panel p-4">
        <h2 className="font-semibold text-lab-amber">Прогноз не готов</h2>
        <p className="mt-2 text-sm text-lab-muted">Workflow готов. Первый настоящий прогноз не получен, потому что real data pack не предоставлен или не хватает validated real coverage.</p>
        <ul className="mt-3 space-y-1 text-sm text-lab-muted">
          {missing.slice(0, 6).map((item, index) => <li key={`forecast-not-ready-${index}-${item.slice(0, 24)}`}>{item}</li>)}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/admin/research-queue?matchId=${encodeURIComponent(input.match.id)}&template=parsed_demo`} className="rounded border border-lab-green/60 px-3 py-1.5 text-sm text-lab-green">Загрузить parsed_demo JSON</a>
          <a href={`/admin/research-queue?matchId=${encodeURIComponent(input.match.id)}`} className="rounded border border-lab-cyan/60 px-3 py-1.5 text-sm text-lab-cyan">Создать manual_real data pack</a>
          <a href="/admin/sources" className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan">Проверить источники</a>
        </div>
      </section>
    );
  }

  const realDepth = deriveRealDataDepth(input, prediction);
  const reportSections = [
    ["Матч", `${input.teamA.name} vs ${input.teamB.name} · ${formatDateTime(input.match.startTime)} · ${input.match.format}`],
    ["Источники данных", prediction.sourceLevel],
    ["Real Data Depth", `${realDepth.level}/5 · ${realDepth.label}`],
    ["Покрытие данных", input.dataCoverage?.known.join(", ") || "Coverage metadata unavailable"],
    ["Снимок признаков", featureSnapshot ? `${featureSnapshot.modelVersion} · ${featureSnapshot.featureSchemaVersion}` : "Feature snapshot pending"],
    ["Team Strength", prediction.factors.find((factor) => factor.factorName.includes("Team Strength"))?.explanation ?? "Team strength included in model factors."],
    ["Player Form", `${input.playerStatsA.length}/${input.playerStatsB.length} player stat rows`],
    ["Map Pool", `${input.mapStatsA.length}/${input.mapStatsB.length} map stat rows`],
    ["Veto", `${input.vetoPatternsA.length}/${input.vetoPatternsB.length} veto rows`],
    ["H2H", `${input.h2h.length} relevant H2H rows`],
    ["News/Risk", `${input.news.length} news rows · risk ${prediction.riskLevel}`],
    ["Probability", `${input.teamA.name} ${prediction.teamAProbability}% / ${input.teamB.name} ${prediction.teamBProbability}%`],
    ["Confidence", `${prediction.confidenceScore}/100`],
    ["Risk", prediction.riskLevel],
    ["Explanation", prediction.explanation],
    ["Missing/weak data", prediction.readiness.missingCriticalData.join(", ") || "No critical missing blocks."]
  ];

  return (
    <section className="rounded border border-lab-green/50 bg-lab-panel p-4">
      <h2 className="font-semibold text-lab-green">Полный отчёт прогноза</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {reportSections.map(([title, body]) => (
          <article key={title} className="rounded border border-lab-border bg-lab-panel2 p-3">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm text-lab-muted">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MatchupCard({ title, profile, style }: { title: string; profile: PredictionInput["opponentMatchupA"]; style: PredictionInput["teamStyleA"] }) {
  return (
    <article className="rounded border border-lab-border bg-lab-panel p-4">
      <h2 className="font-semibold text-white">{title}</h2>
      {profile ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-lab-muted">Direct sample</dt><dd className="text-white">{profile.matchesPlayed} matches / {profile.mapsPlayed} maps</dd></div>
          <div><dt className="text-lab-muted">Confidence</dt><dd className="text-white">{Math.round(profile.confidenceScore * 100)}%</dd></div>
          <div><dt className="text-lab-muted">Map winrate</dt><dd className="text-white">{Math.round(profile.mapWinRate * 100)}%</dd></div>
          <div><dt className="text-lab-muted">Veto punish</dt><dd className="text-white">{Math.round(profile.vetoPunishScore * 100)}%</dd></div>
          <div><dt className="text-lab-muted">AWP matchup</dt><dd className="text-white">{Math.round(profile.awpMatchupScore * 100)}%</dd></div>
          <div><dt className="text-lab-muted">Closing</dt><dd className="text-white">{Math.round(profile.closingMatchupScore * 100)}%</dd></div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-lab-amber">Недостаточно direct matchup sample. Используется neutral baseline.</p>
      )}
      {style && <p className="mt-3 text-sm text-lab-muted">Style: aggression {Math.round(style.aggressionScore * 100)}%, clutch {Math.round(style.clutchStrength * 100)}%, volatility {Math.round(style.volatilityScore * 100)}%.</p>}
    </article>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel p-4">
      <h3 className="font-semibold text-white">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-lab-muted">
        {items.length > 0 ? items.map((item, index) => <li key={`${title}-${index}-${item.slice(0, 24)}`}>{item}</li>) : <li>Критичных сигналов нет.</li>}
      </ul>
    </div>
  );
}
