import { friendlySourceError, summarizeSourceFailures } from "./friendlyErrors";
import { GLOBAL_RESEARCH_PROGRESS_STEPS, type AutoResearchMetrics, type AutoResearchSourceReport, type OneClickResult } from "./autoResearchShared";
import type { SourceSyncResult } from "./sources/types";

export type AutoResearchDeps = {
  getMetrics(): Promise<AutoResearchMetrics>;
  runOrchestrator(): Promise<{ results: SourceSyncResult[]; reports: AutoResearchSourceReport[] }>;
  rebuildSnapshots(): Promise<unknown>;
  recalculatePredictions(): Promise<number>;
  refreshResearchQueue(): Promise<number>;
};

function diffMetrics(after: AutoResearchMetrics, before: AutoResearchMetrics): AutoResearchMetrics {
  return {
    matches: after.matches - before.matches,
    readyForecasts: after.readyForecasts - before.readyForecasts,
    basicPreview: after.basicPreview - before.basicPreview,
    needsManualData: after.needsManualData - before.needsManualData,
    teamsWithRank: after.teamsWithRank - before.teamsWithRank,
    L0_FIXTURE_ONLY: after.L0_FIXTURE_ONLY - before.L0_FIXTURE_ONLY,
    L1_BASIC_CONTEXT: after.L1_BASIC_CONTEXT - before.L1_BASIC_CONTEXT,
    L2_BASIC_PREDICTION: after.L2_BASIC_PREDICTION - before.L2_BASIC_PREDICTION,
    L3_ANALYTICAL: after.L3_ANALYTICAL - before.L3_ANALYTICAL,
    L4_DEEP: after.L4_DEEP - before.L4_DEEP,
    teamsWithRoster: after.teamsWithRoster - before.teamsWithRoster,
    matchesWithMapVeto: after.matchesWithMapVeto - before.matchesWithMapVeto,
    researchTasks: after.researchTasks - before.researchTasks,
    sourceSetupNeeded: after.sourceSetupNeeded - before.sourceSetupNeeded
  };
}

function flattenResults(results: Array<SourceSyncResult | SourceSyncResult[]>) {
  return results.flatMap((result) => (Array.isArray(result) ? result : [result]));
}

export function countUpdatedMatchRecords(results: SourceSyncResult[]) {
  return results.reduce((sum, result) => sum + result.records.filter((record) => record.entityType === "match").length, 0);
}

export async function runOneClickGlobalRefreshWithDeps(deps: AutoResearchDeps): Promise<OneClickResult> {
  const before = await deps.getMetrics();
  let orchestratorReports: AutoResearchSourceReport[] = [];
  const results: Array<SourceSyncResult | SourceSyncResult[]> = [];
  const errors: string[] = [];

  try {
    const orchestrator = await deps.runOrchestrator();
    results.push(orchestrator.results);
    orchestratorReports = orchestrator.reports;
  } catch (error) {
    errors.push(`AutoResearch: ${friendlySourceError("pipeline", error instanceof Error ? error.message : String(error))}`);
  }
  await deps.rebuildSnapshots();
  const predictionsRecalculated = await deps.recalculatePredictions();
  await deps.refreshResearchQueue();
  const after = await deps.getMetrics();
  const flatResults = flattenResults(results);
  const sourceIssues = [
    ...summarizeSourceFailures(flatResults),
    ...orchestratorReports
      .filter((report) => ["failed", "blocked", "disabled"].includes(report.status) || (report.status === "skipped" && !["manual", "parsed-demo"].includes(report.source)))
      .map((report) => ({ source: report.source, status: report.status, message: report.message })),
    ...errors.map((message) => ({ source: "pipeline", status: "failed", message }))
  ];
  const succeeded = [
    "получить матчи",
    "обновить рейтинги",
    "проверить патчи CS2",
    "обновить новости",
    "пересчитать прогнозы",
    "обновить задачи"
  ];
  const unavailable = [
    after.teamsWithRoster === 0 ? "получить составы" : null,
    after.matchesWithMapVeto === 0 ? "получить map/veto" : null,
    "получить player stats",
    "получить deep round/economy"
  ].filter(Boolean) as string[];

  return {
    ok: errors.length === 0,
    steps: [...GLOBAL_RESEARCH_PROGRESS_STEPS],
    summary: {
      before,
      after,
      diff: diffMetrics(after, before),
      updatedMatches: countUpdatedMatchRecords(flatResults),
      newMatches: Math.max(0, after.matches - before.matches),
      predictionsRecalculated,
      sourceIssues,
      succeeded,
      unavailable,
      unavailableReason: "Эти данные недоступны в текущих бесплатных источниках. Подключите GRID/Liquipedia/FACEIT, загрузите parsed demo или создайте manual data pack.",
      sourceReports: orchestratorReports
    },
    errors
  };
}
