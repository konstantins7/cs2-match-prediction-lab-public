import { buildForecastAutopilotCandidate } from "./autoResearch/candidateSelector";
import type { ForecastAutopilotCandidate, ForecastAutopilotMode, ForecastAutopilotNextAction } from "./autoResearchShared";
import {
  connectorsForMissingBlocks,
  dataConnectors,
  type ConnectorResult,
  type DataGapBlock
} from "./dataConnectorRegistry";
import { isTrustedLocalImportEnabled } from "./privateNormalizedInbox";

export type DataGapResolution = {
  matchId: string;
  mode: ForecastAutopilotMode;
  missingBlocks: DataGapBlock[];
  attemptedResolvers: string[];
  connectorResults: ConnectorResult[];
  recordsCreated: number;
  recordsUpdated: number;
  stillMissing: DataGapBlock[];
  confidenceWarnings: string[];
  nextAction: ForecastAutopilotNextAction;
  canRecalculate: boolean;
  shouldSavePrediction: boolean;
  trustedLocalImportsEnabled: boolean;
};

const dataTypeLabels: Record<DataGapBlock, string> = {
  rank_basic: "rank/basic",
  roster: "roster",
  player_stats: "player_stats",
  map_stats: "map_stats",
  veto: "veto",
  team_form: "team_form/recent_results",
  h2h_news: "H2H/news",
  grid_mapping: "GRID mapping",
  source_confidence: "sourceUrl/source confidence"
};

export async function resolveMatchDataGaps(
  matchId: string,
  mode: ForecastAutopilotMode = "fast",
  candidateInput?: ForecastAutopilotCandidate
): Promise<DataGapResolution> {
  const candidate = candidateInput ?? await buildForecastAutopilotCandidate(matchId);
  const missingBlocks = inferMissingBlocks(candidate);
  const trustedLocalImportsEnabled = isTrustedLocalImportEnabled();
  const connectorResults: ConnectorResult[] = [];
  const attemptedResolvers: string[] = [];
  const connectors = connectorsForMissingBlocks(missingBlocks);

  for (const connector of connectors) {
    attemptedResolvers.push(connector.id);
    try {
      connectorResults.push(await connector.run({
        matchId,
        mode,
        candidate,
        missingBlocks,
        trustedLocalImportsEnabled
      }));
    } catch (error) {
      connectorResults.push({
        connectorId: connector.id,
        label: connector.label,
        dataTypes: connector.dataTypes,
        status: "error",
        recordsCreated: 0,
        recordsUpdated: 0,
        confidence: 0,
        sourceName: connector.label,
        warnings: [],
        blockers: [error instanceof Error ? error.message : "Connector failed."],
        normalizedPayloadSummary: "connector error"
      });
    }
  }

  const recordsCreated = connectorResults.reduce((sum, result) => sum + result.recordsCreated, 0);
  const recordsUpdated = connectorResults.reduce((sum, result) => sum + result.recordsUpdated, 0);
  const resolvedTypes = new Set(
    connectorResults
      .filter((result) => result.status === "success" && result.recordsCreated + result.recordsUpdated > 0)
      .flatMap((result) => result.dataTypes)
  );
  const stillMissing = missingBlocks.filter((block) => !resolvedTypes.has(block));
  const confidenceWarnings = [...new Set(connectorResults.flatMap((result) => result.warnings))];
  const nextAction = chooseNextAction(candidate, stillMissing);

  return {
    matchId,
    mode,
    missingBlocks,
    attemptedResolvers,
    connectorResults,
    recordsCreated,
    recordsUpdated,
    stillMissing,
    confidenceWarnings,
    nextAction,
    canRecalculate: recordsCreated + recordsUpdated > 0,
    shouldSavePrediction: stillMissing.length === 0,
    trustedLocalImportsEnabled
  };
}

export function inferMissingBlocks(candidate: ForecastAutopilotCandidate): DataGapBlock[] {
  const missing = new Set<DataGapBlock>();
  const byId = new Map(candidate.coverageBreakdown.map((item) => [item.id, item]));
  if (byId.get("rank_basic")?.status !== "yes") missing.add("rank_basic");
  if (byId.get("roster")?.status !== "yes") missing.add("roster");
  if (byId.get("player_stats")?.status !== "yes") missing.add("player_stats");
  if (byId.get("map_stats")?.status !== "yes") missing.add("map_stats");
  if (byId.get("veto")?.status !== "yes") missing.add("veto");
  if (byId.get("optional_context")?.status !== "yes") missing.add("h2h_news");
  if (!candidate.providerContributions.some((provider) => provider.source.toLowerCase().includes("grid") && provider.status === "yes")) {
    missing.add("grid_mapping");
  }
  for (const blocker of candidate.blockers) {
    const text = blocker.toLowerCase();
    if (text.includes("rank") || text.includes("basic")) missing.add("rank_basic");
    if (text.includes("roster")) missing.add("roster");
    if (text.includes("player stats")) missing.add("player_stats");
    if (text.includes("map")) missing.add("map_stats");
    if (text.includes("veto")) missing.add("veto");
    if (text.includes("grid")) missing.add("grid_mapping");
    if (text.includes("sourceurl") || text.includes("source confidence")) missing.add("source_confidence");
  }
  return [...missing];
}

export function connectorPolicySummary() {
  return dataConnectors.map((connector) => ({
    id: connector.id,
    label: connector.label,
    dataTypes: connector.dataTypes,
    mode: connector.mode,
    legalStatus: connector.legalStatus,
    canAutoRun: connector.canAutoRun || Boolean(connector.autoRunFlag && String(process.env[connector.autoRunFlag] ?? "false").toLowerCase() === "true"),
    requiresKey: connector.requiresKey,
    limitations: connector.limitations
  }));
}

function chooseNextAction(candidate: ForecastAutopilotCandidate, stillMissing: DataGapBlock[]): ForecastAutopilotNextAction {
  const existing = candidate.nextDataActions[0];
  if (existing) return existing;
  const first = stillMissing[0];
  if (!first) {
    return {
      label: "Пересчитать прогноз",
      reason: "Resolver не видит критичных missing blocks; можно повторно выполнить Полный анализ.",
      target: "full_match_analysis",
      priority: "medium"
    };
  }
  return {
    label: `Добавить данные: ${dataTypeLabels[first]}`,
    reason: `Автоматические коннекторы не закрыли ${dataTypeLabels[first]}. Используйте normalized inbox или существующий Validate / Preview / Apply flow.`,
    target: first,
    priority: "high"
  };
}
