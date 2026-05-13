import {
  calculateManualBlockQuality,
  calculateManualRealPackQuality,
  manualQualityAllowsReadiness,
  qualityFromRawRecord,
  type ManualPackBlock,
  type ManualRealPackQuality
} from "./manualRealQuality";
import { readinessRank } from "./prediction/readiness";
import type { PredictionInput, PredictionOutput, PredictionReadiness } from "./prediction/types";

export type SourceLevel =
  | "Fixture only"
  | "Basic free data"
  | "Manual real partial"
  | "Manual real analytical"
  | "Sample only"
  | "Deep data";

export type RealForecastStatus = {
  isReady: boolean;
  label: "Real Forecast Ready" | "Real Forecast Not Ready";
  sourceLevel: SourceLevel;
  manualRealPackQuality: ManualRealPackQuality;
  reasons: string[];
  sampleOnlyWarning?: string;
};

function sourceRecord(input: PredictionInput, id?: string | null) {
  return input.manualSourceRecords?.find((record) => record.id === id);
}

function bestQuality(input: PredictionInput, ids: Array<string | null | undefined>, block: ManualPackBlock) {
  const qualities = ids.map((id) => qualityFromRawRecord(sourceRecord(input, id), block));
  if (qualities.length === 0) return calculateManualBlockQuality(block, {}, false);
  return qualities.sort((a, b) => b.score - a.score || b.sourceConfidence - a.sourceConfidence)[0];
}

function manualRecords(input: PredictionInput) {
  const manualPlayers = [...input.playersA, ...input.playersB].filter((player) => player.sourceMode === "manual_real" && player.matchId === input.match.id);
  const manualPlayerStats = [...input.playerStatsA, ...input.playerStatsB].filter((stat) => stat.source === "manual_enrichment" && stat.matchId === input.match.id);
  const manualMapStats = [...input.mapStatsA, ...input.mapStatsB].filter((stat) => stat.source === "manual_enrichment" && stat.matchId === input.match.id);
  const manualVeto = [...input.vetoPatternsA, ...input.vetoPatternsB].filter((row) => row.source === "manual_enrichment" && row.matchId === input.match.id);
  const manualH2h = input.h2h.filter((row) => row.source === "manual_enrichment" && row.matchId === input.match.id);
  const manualNews = input.news.filter((row) => row.source === "manual_enrichment" && row.matchId === input.match.id);
  return { manualPlayers, manualPlayerStats, manualMapStats, manualVeto, manualH2h, manualNews };
}

export function calculateManualRealPackQualityForInput(input: PredictionInput): ManualRealPackQuality {
  const records = manualRecords(input);
  const teamAPlayers = records.manualPlayers.filter((player) => player.teamId === input.teamA.id);
  const teamBPlayers = records.manualPlayers.filter((player) => player.teamId === input.teamB.id);
  const teamAPlayerStats = records.manualPlayerStats.filter((stat) => stat.teamId === input.teamA.id);
  const teamBPlayerStats = records.manualPlayerStats.filter((stat) => stat.teamId === input.teamB.id);
  const teamAMapSample = records.manualMapStats.filter((stat) => stat.teamId === input.teamA.id).reduce((sum, stat) => sum + stat.mapsPlayed, 0);
  const teamBMapSample = records.manualMapStats.filter((stat) => stat.teamId === input.teamB.id).reduce((sum, stat) => sum + stat.mapsPlayed, 0);
  const teamAVeto = records.manualVeto.filter((row) => row.teamId === input.teamA.id);
  const teamBVeto = records.manualVeto.filter((row) => row.teamId === input.teamB.id);

  return calculateManualRealPackQuality({
    roster: bestQuality(input, records.manualPlayers.map((player) => player.sourceRecordId), "roster"),
    playerStats: bestQuality(input, records.manualPlayerStats.map((stat) => stat.sourceRecordId), "player_stats"),
    mapStats: bestQuality(input, records.manualMapStats.map((stat) => stat.sourceRecordId), "map_stats"),
    veto: bestQuality(input, records.manualVeto.map((row) => row.sourceRecordId), "veto_history"),
    h2h: bestQuality(input, records.manualH2h.map((row) => row.sourceRecordId), "h2h"),
    news: bestQuality(input, records.manualNews.map((row) => row.sourceRecordId), "news"),
    rosterComplete: teamAPlayers.length >= 5 && teamBPlayers.length >= 5,
    playerStatsComplete: teamAPlayerStats.length >= 5 && teamBPlayerStats.length >= 5,
    mapStatsComplete: teamAMapSample >= 7 && teamBMapSample >= 7,
    vetoComplete: teamAVeto.length > 0 && teamBVeto.length > 0,
    h2hPresent: records.manualH2h.length > 0,
    newsChecked: records.manualNews.length > 0
  });
}

export function hasSampleOnlyAnalyticalData(input: PredictionInput) {
  const sampleStats = [...input.playersA, ...input.playersB].some((player) => player.sourceMode === "analyst_sample") ||
    [...input.playerStatsA, ...input.playerStatsB, ...input.mapStatsA, ...input.mapStatsB, ...input.vetoPatternsA, ...input.vetoPatternsB].some((row) => row.source === "analyst_sample") ||
    input.h2h.some((row) => row.source === "analyst_sample") ||
    input.news.some((row) => row.source === "analyst_sample");
  return sampleStats && !hasManualRealData(input);
}

function hasManualRealData(input: PredictionInput) {
  const records = manualRecords(input);
  return records.manualPlayers.length > 0 ||
    records.manualPlayerStats.length > 0 ||
    records.manualMapStats.length > 0 ||
    records.manualVeto.length > 0 ||
    records.manualH2h.length > 0 ||
    records.manualNews.length > 0;
}

function hasDeepRealData(input: PredictionInput) {
  return [...input.playerStatsA, ...input.playerStatsB, ...input.mapStatsA, ...input.mapStatsB].some((row) => row.source === "parsed_demo" || row.source === "grid");
}

export function determineSourceLevel(input: PredictionInput, readiness: PredictionReadiness, manualQuality = calculateManualRealPackQualityForInput(input)): SourceLevel {
  if (hasDeepRealData(input)) return "Deep data";
  if (manualQuality.score >= 65) return "Manual real analytical";
  if (hasManualRealData(input) && manualQuality.score > 0) return "Manual real partial";
  if (hasSampleOnlyAnalyticalData(input) && readinessRank(readiness.level) >= 3) return "Sample only";
  if (readiness.level === "L0_FIXTURE_ONLY") return "Fixture only";
  return "Basic free data";
}

export function evaluateRealForecastStatus(input: PredictionInput, prediction: Pick<PredictionOutput, "readiness" | "dataQualityScore" | "warnings">): RealForecastStatus {
  const manualRealPackQuality = calculateManualRealPackQualityForInput(input);
  const sourceLevel = determineSourceLevel(input, prediction.readiness, manualRealPackQuality);
  const reasons: string[] = [];
  const sampleOnly = sourceLevel === "Sample only";
  const readinessOk = readinessRank(prediction.readiness.level) >= 3;
  const deepRealData = hasDeepRealData(input);
  const hasNonSampleAnalyticalSource = manualRealPackQuality.canReachL3 || deepRealData;
  const deepCoverage = deepRealData && input.playerStatsA.length >= 5 && input.playerStatsB.length >= 5 && input.mapStatsA.length > 0 && input.mapStatsB.length > 0 && input.vetoPatternsA.length > 0 && input.vetoPatternsB.length > 0;
  const hasCoverage = (manualRealPackQuality.coverage.playerStatsComplete && manualRealPackQuality.coverage.mapStatsComplete && manualRealPackQuality.coverage.vetoComplete) || deepCoverage;
  const sourceConflict = input.sourceConflicts.length > 0 || Boolean(input.match.needsReview) || prediction.warnings.some((warning) => warning.toLowerCase().includes("source conflict"));

  if (!readinessOk) reasons.push("Readiness ниже L3.");
  if (!hasNonSampleAnalyticalSource) reasons.push("Нет validated manual_real / parsed_demo / GRID analytical source.");
  if (sampleOnly) reasons.push("L3 достигнут только через SAMPLE DATA.");
  if (sourceConflict) reasons.push("Есть critical needs_review/source conflict.");
  if (!hasCoverage) reasons.push("Нет полного player/map/veto coverage для real forecast.");
  if (prediction.dataQualityScore < 50) reasons.push("Data Quality ниже 50.");
  if (manualRealPackQuality.score < 65 && !hasDeepRealData(input)) reasons.push("Manual Real Pack Quality ниже 65.");

  return {
    isReady: reasons.length === 0,
    label: reasons.length === 0 ? "Real Forecast Ready" : "Real Forecast Not Ready",
    sourceLevel,
    manualRealPackQuality,
    reasons,
    sampleOnlyWarning: sampleOnly ? "Сейчас L3 достигнут только через SAMPLE DATA. Реальный прогноз не готов." : undefined
  };
}

export function manualQualityCanUnlockL3(quality: ManualRealPackQuality) {
  return quality.score >= 65 && quality.canReachL3 && quality.blockQualities.some(manualQualityAllowsReadiness);
}
