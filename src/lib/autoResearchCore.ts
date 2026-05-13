import { friendlySourceError, summarizeSourceFailures } from "./friendlyErrors";
import { GLOBAL_RESEARCH_PROGRESS_STEPS, type AutoResearchMetrics, type OneClickResult } from "./autoResearchShared";
import type { SourceSyncResult } from "./sources/types";

export type AutoResearchDeps = {
  getMetrics(): Promise<AutoResearchMetrics>;
  syncPandaScore(): Promise<SourceSyncResult[]>;
  syncValveRankings(): Promise<SourceSyncResult>;
  syncCsUpdates(): Promise<SourceSyncResult>;
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
    teamsWithRank: after.teamsWithRank - before.teamsWithRank
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
  const results: Array<SourceSyncResult | SourceSyncResult[]> = [];
  const errors: string[] = [];

  async function collect(label: string, run: () => Promise<SourceSyncResult | SourceSyncResult[]>) {
    try {
      results.push(await run());
    } catch (error) {
      errors.push(`${label}: ${friendlySourceError(label, error instanceof Error ? error.message : String(error))}`);
    }
  }

  await collect("PandaScore", deps.syncPandaScore);
  await collect("Valve", deps.syncValveRankings);
  await collect("Steam", deps.syncCsUpdates);
  await deps.rebuildSnapshots();
  const predictionsRecalculated = await deps.recalculatePredictions();
  await deps.refreshResearchQueue();
  const after = await deps.getMetrics();
  const flatResults = flattenResults(results);
  const sourceIssues = [
    ...summarizeSourceFailures(flatResults),
    ...errors.map((message) => ({ source: "pipeline", status: "failed", message }))
  ];

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
      sourceIssues
    },
    errors
  };
}
