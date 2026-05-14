import { getEffectiveRank, isWatchlistTeam } from "../proFocus";
import { manualQualityAllowsReadiness, parseManualRawJson, qualityFromRawRecord, type ManualPackBlock } from "../manualRealQuality";
import type { PredictionInput, PredictionReadiness, PredictionReadinessLevel } from "./types";

function hasRank(input: PredictionInput) {
  const rankA = getEffectiveRank(input.teamA).rank;
  const rankB = getEffectiveRank(input.teamB).rank;
  return Boolean((rankA && rankA <= 100) || (rankB && rankB <= 100));
}

function hasWatchlist(input: PredictionInput) {
  return isWatchlistTeam(input.teamA.name) || isWatchlistTeam(input.teamB.name);
}

function hasBasicResults(input: PredictionInput) {
  return (input.basicResultA?.matchesPlayed ?? 0) > 0 || (input.basicResultB?.matchesPlayed ?? 0) > 0;
}

function hasRoster(input: PredictionInput) {
  const trusted = (player: PredictionInput["playersA"][number]) =>
    player.sourceMode !== "manual_real" || (player.matchId === input.match.id && (player.sourceConfidence ?? 0) > 0.5);
  return input.playersA.filter(trusted).length >= 5 && input.playersB.filter(trusted).length >= 5;
}

function sourceRecord(input: PredictionInput, id?: string | null) {
  return input.manualSourceRecords?.find((record) => record.id === id);
}

function trustedManualRecord(input: PredictionInput, sourceRecordId: string | null | undefined, block: ManualPackBlock) {
  const record = sourceRecord(input, sourceRecordId);
  const quality = qualityFromRawRecord(record, block);
  return manualQualityAllowsReadiness(quality);
}

function manualRecordIsDeep(input: PredictionInput, sourceRecordId: string | null | undefined) {
  const raw = parseManualRawJson(sourceRecord(input, sourceRecordId)?.rawJson);
  return raw?.type === "parsed_demo" || raw?.type === "round_data" || raw?.type === "deep_stats";
}

function hasPlayerStats(input: PredictionInput) {
  const trusted = (stat: PredictionInput["playerStatsA"][number]) =>
    stat.source !== "manual_enrichment" || (stat.matchId === input.match.id && trustedManualRecord(input, stat.sourceRecordId, "player_stats"));
  return input.playerStatsA.filter(trusted).length >= 5 && input.playerStatsB.filter(trusted).length >= 5;
}

function hasMapStats(input: PredictionInput) {
  const trusted = (stat: PredictionInput["mapStatsA"][number]) =>
    stat.source !== "manual_enrichment" || (stat.matchId === input.match.id && trustedManualRecord(input, stat.sourceRecordId, "map_stats"));
  const sampleA = input.mapStatsA.filter(trusted).reduce((sum, stat) => sum + stat.mapsPlayed, 0);
  const sampleB = input.mapStatsB.filter(trusted).reduce((sum, stat) => sum + stat.mapsPlayed, 0);
  return sampleA >= 7 && sampleB >= 7;
}

function hasVetoHistory(input: PredictionInput) {
  const trusted = (stat: PredictionInput["vetoPatternsA"][number]) =>
    stat.source !== "manual_enrichment" || (stat.matchId === input.match.id && trustedManualRecord(input, stat.sourceRecordId, "veto_history"));
  return input.vetoPatternsA.filter(trusted).length > 0 && input.vetoPatternsB.filter(trusted).length > 0;
}

function hasDeepStats(input: PredictionInput) {
  const parsedDemoSample = [...input.playerStatsA, ...input.playerStatsB, ...input.mapStatsA, ...input.mapStatsB]
    .filter((stat) =>
      stat.source === "parsed_demo" ||
      stat.source === "grid" ||
      (stat.source === "manual_enrichment" && manualRecordIsDeep(input, stat.sourceRecordId) && trustedManualRecord(input, stat.sourceRecordId, "mapsPlayed" in stat ? "map_stats" : "player_stats"))
    )
    .reduce((sum, stat) => sum + ("mapsPlayed" in stat ? stat.mapsPlayed : stat.maps), 0);
  const hasRoundDepth = input.mapStatsA.concat(input.mapStatsB).some((stat) =>
    ["parsed_demo", "manual_enrichment", "grid"].includes(stat.source) &&
    (stat.source !== "manual_enrichment" || (manualRecordIsDeep(input, stat.sourceRecordId) && trustedManualRecord(input, stat.sourceRecordId, "map_stats"))) &&
    stat.mapsPlayed >= 8 &&
    (stat.pistolWinRate !== 0.5 || stat.forceBuyWinRate !== 0.3 || stat.overtimeFrequency > 0)
  );
  return parsedDemoSample >= 40 && hasRoundDepth && hasVetoHistory(input);
}

function criticalMissing(input: PredictionInput) {
  const missing: string[] = [];
  if (!hasRank(input)) missing.push("team rank data");
  if (!hasBasicResults(input)) missing.push("basic recent results");
  if (!hasRoster(input)) missing.push("player roster");
  if (!hasPlayerStats(input)) missing.push("player stats");
  if (!hasMapStats(input)) missing.push("map stats");
  if (!hasVetoHistory(input)) missing.push("veto history");
  if (input.h2h.length === 0) missing.push("H2H");
  if (input.news.length === 0 && input.rosterEventsA.length === 0 && input.rosterEventsB.length === 0) missing.push("news/roster events");
  return missing;
}

function actionsForMissing(missing: string[], input: PredictionInput) {
  const actions: string[] = [];
  if (missing.includes("team rank data") || hasWatchlist(input)) actions.push("Confirm rank mapping or import HLTV manual rank.");
  if (missing.includes("player roster")) actions.push("Bind roster players for both teams.");
  if (missing.includes("player stats")) actions.push("Import player stats for last_30_days.");
  if (missing.includes("map stats")) actions.push("Import map stats for last_90_days.");
  if (missing.includes("veto history")) actions.push("Import veto history or parsed demo JSON.");
  if (missing.includes("H2H")) actions.push("Add relevant H2H with roster similarity.");
  if (missing.includes("news/roster events")) actions.push("Add news or roster events if available.");
  actions.push("Import parsed demo JSON for deeper round/player/map signals.");
  return [...new Set(actions)].slice(0, 8);
}

function makeReadiness(params: {
  level: PredictionReadinessLevel;
  label: string;
  score: number;
  isActionable: boolean;
  reasons: string[];
  missingCriticalData: string[];
  nextBestActions: string[];
}): PredictionReadiness {
  return params;
}

export function calculatePredictionReadiness(input: PredictionInput, dataQualityScore: number, confidenceScore: number): PredictionReadiness {
  const missing = criticalMissing(input);
  const nextBestActions = actionsForMissing(missing, input);
  const rank = hasRank(input);
  const watchlist = hasWatchlist(input);
  const basicResults = hasBasicResults(input);
  const roster = hasRoster(input);
  const playerStats = hasPlayerStats(input);
  const mapStats = hasMapStats(input);
  const veto = hasVetoHistory(input);
  const sourceConflict = input.sourceConflicts.length > 0 || input.match.needsReview;
  const deep = hasDeepStats(input);

  if (deep) {
    return makeReadiness({
      level: "L4_DEEP",
      label: "Deep ready",
      score: Math.min(100, Math.max(82, dataQualityScore)),
      isActionable: dataQualityScore >= 55 && confidenceScore >= 50 && !sourceConflict,
      reasons: ["Есть parsed demo/GRID/manual deep stats with round/player/map depth."],
      missingCriticalData: missing,
      nextBestActions
    });
  }

  if (roster && playerStats && mapStats && veto) {
    return makeReadiness({
      level: "L3_ANALYTICAL",
      label: "Analytical ready",
      score: Math.min(86, Math.max(68, dataQualityScore)),
      isActionable: dataQualityScore >= 45 && confidenceScore >= 45 && !sourceConflict,
      reasons: ["Есть roster, player stats, map stats и хотя бы часть veto/history."],
      missingCriticalData: missing,
      nextBestActions
    });
  }

  if (rank && basicResults && !sourceConflict) {
    return makeReadiness({
      level: "L2_BASIC_PREDICTION",
      label: "Basic prediction",
      score: Math.min(62, Math.max(42, dataQualityScore)),
      isActionable: dataQualityScore >= 45 && confidenceScore >= 45,
      reasons: ["Есть rank + basic recent results + clean team matching, но нет полного player/map/veto слоя."],
      missingCriticalData: missing,
      nextBestActions
    });
  }

  if (rank || watchlist || basicResults) {
    return makeReadiness({
      level: "L1_BASIC_CONTEXT",
      label: "Basic signal",
      score: Math.min(38, Math.max(22, dataQualityScore)),
      isActionable: false,
      reasons: ["Есть fixture + rank/watchlist/basic context, но недостаточно player/map/veto данных."],
      missingCriticalData: missing,
      nextBestActions
    });
  }

  return makeReadiness({
    level: "L0_FIXTURE_ONLY",
    label: "Not ready",
    score: Math.min(20, dataQualityScore),
    isActionable: false,
    reasons: ["Есть только fixture/basic data; прогноз не готов."],
    missingCriticalData: missing,
    nextBestActions
  });
}

export function readinessRank(level: PredictionReadinessLevel) {
  return {
    L0_FIXTURE_ONLY: 0,
    L1_BASIC_CONTEXT: 1,
    L2_BASIC_PREDICTION: 2,
    L3_ANALYTICAL: 3,
    L4_DEEP: 4
  }[level];
}
