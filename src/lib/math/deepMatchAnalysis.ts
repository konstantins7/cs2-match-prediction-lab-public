import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analystSheetTemplates, quoteCsv, type AnalystSheetType } from "../analystSheetTemplates";
import { inboxFingerprint, loadPrivateAnalysisData, parseCsvRows } from "./dataLoader";
import { calculateTeamElo, calculatePlayerElo } from "./eloRating";
import { calculateMapProbabilities } from "./mapWinProbability";
import { weightedScientificPrediction } from "./mlPredictor";
import { calculatePlayerMapEfficiency, detectOutliers } from "./playerMapEfficiency";
import { calculateTeamSynergy } from "./teamSynergy";
import { calculateScientificFactors } from "@/lib/scientific/scientificFactors";
import { detectScientificAnomalies } from "@/lib/scientific/anomalyDetection";
import { buildDataRecommendations } from "@/lib/scientific/dataRecommendations";
import { findSimilarMatches } from "@/lib/scientific/matchSimilarity";
import { compareAdvisoryModels } from "@/lib/scientific/modelComparison";
import { prisma } from "@/lib/prisma";
import type { AnalysisParams, DeepMatchAnalysis, NumericWeights } from "./types";

const analysisTtlMs = 7 * 24 * 60 * 60 * 1000;
const cacheRoot = path.join(process.cwd(), "data", "analysis-cache");

export async function buildDeepMatchAnalysis(params: Partial<AnalysisParams> & { matchId: string; teamA?: string; teamB?: string }): Promise<DeepMatchAnalysis> {
  const normalized = normalizeParams(params);
  const fingerprint = await inboxFingerprint();
  const cached = await readAnalysisCache(normalized, fingerprint);
  if (cached) return { ...cached, cache: "hit" };

  const data = await loadPrivateAnalysisData(normalized.matchId);
  const teams = resolveTeams(normalized.teamA, normalized.teamB, data.roster.map((row) => row.teamName), data.mapStats.map((row) => row.teamName), data.playerStats.map((row) => row.teamName));
  const playerMapEfficiency = calculatePlayerMapEfficiency(data.playerStats, { decayDays: normalized.decayDays });
  const teamSynergy = calculateTeamSynergy(data.roster, data.playerStats);
  const mapProbabilities = calculateMapProbabilities(data.mapStats, teams[0] ?? "", teams[1] ?? "");
  const teamElo = calculateTeamElo(data.h2h, teams);
  const playerElo = calculatePlayerElo(data.playerStats);
  const outliers = detectOutliers(data.playerStats.map((row) => ({ id: `${row.teamName}:${row.nickname}:${row.mapName ?? "overall"}`, value: row.rating })), "player_rating");
  const scientificFactors = calculateScientificFactors(data, teams);
  const aiEvidenceSummary = await buildAiEvidenceSummary(normalized.matchId);
  const dbMatch = normalized.version >= 2 ? await readMatchModelContext(normalized.matchId) : null;
  const anomalies = normalized.version >= 2 ? detectScientificAnomalies(data) : [];
  const similarMatches = normalized.version >= 2 ? await findSimilarMatches(normalized.matchId, 10).catch(() => []) : [];
  const modelPredictions = compareAdvisoryModels({
    teamA: teams[0] ?? "",
    teamB: teams[1] ?? "",
    teamAInternalElo: dbMatch?.teamA.internalElo,
    teamBInternalElo: dbMatch?.teamB.internalElo,
    teamElo,
    mapProbabilities,
    synergies: teamSynergy,
    weights: normalized.weights,
    useCalibratedStyle: normalized.useCalibratedStyle
  });
  const dataRecommendations = normalized.version >= 2
    ? buildDataRecommendations(data, { matchId: normalized.matchId, aiConfidence: aiEvidenceSummary.length ? Math.max(...aiEvidenceSummary.map((row) => row.confidenceMax)) : null })
    : [];
  const prediction = weightedScientificPrediction({
    teamA: teams[0] ?? "",
    teamB: teams[1] ?? "",
    teamElo,
    mapProbabilities,
    synergies: teamSynergy,
    weights: normalized.weights
  });
  const dataQuality = quality({
    roster: data.roster.length,
    playerStats: data.playerStats.length,
    mapStats: data.mapStats.length,
    h2h: data.h2h.length,
    outliers: outliers.length,
    warnings: data.warnings
  });
  const analysis: DeepMatchAnalysis = {
    matchId: normalized.matchId,
    version: normalized.version,
    generatedAt: new Date().toISOString(),
    cache: "miss",
    params: normalized,
    dataQuality,
    playerMapEfficiency,
    teamSynergy,
    mapProbabilities,
    elo: {
      teams: teamElo,
      players: playerElo,
      warnings: data.h2h.length ? [] : ["No H2H match results; team Elo is neutral."]
    },
    prediction: {
      teamA: teams[0] ?? "",
      teamB: teams[1] ?? "",
      teamAProbability: prediction.teamAProbability,
      components: prediction.components,
      weights: prediction.weights,
      warnings: prediction.warnings
    },
    parsedDemo: data.parsedDemo,
    scientificFactors,
    aiEvidenceSummary,
    similarMatches,
    anomalies,
    modelPredictions,
    dataRecommendations,
    outliers,
    csv: toAnalysisCsv(playerMapEfficiency, scientificFactors)
  };
  await writeAnalysisCache(normalized, fingerprint, analysis);
  return analysis;
}

async function buildAiEvidenceSummary(matchId: string): Promise<DeepMatchAnalysis["aiEvidenceSummary"]> {
  const blocks: DeepMatchAnalysis["aiEvidenceSummary"] = [];
  for (const [sheetType, template] of Object.entries(analystSheetTemplates) as Array<[AnalystSheetType, typeof analystSheetTemplates[AnalystSheetType]]>) {
    const content = await readFile(path.join(process.cwd(), "data", "private-inbox", template.filename), "utf8").catch(() => "");
    if (!content.trim()) continue;
    const rows = parseCsvRows(content).filter((row) => row.matchId === matchId && /local ai extraction/i.test(row.sourceName || ""));
    if (!rows.length) continue;
    const confidences = rows.map((row) => Number(row.confidence)).filter((value) => Number.isFinite(value));
    const collected = rows.map((row) => row.collectedAt || row.publishedAt || "").filter(Boolean).sort();
    blocks.push({
      block: sheetType,
      rows: rows.length,
      confidenceMin: confidences.length ? Math.min(...confidences) : 0,
      confidenceMax: confidences.length ? Math.max(...confidences) : 0,
      sourceSite: "Local AI extraction",
      extractedAt: collected.at(-1) || "",
      promptVersion: "unknown",
      modifiedAfterAi: false
    });
  }
  return blocks;
}

function normalizeParams(params: Partial<AnalysisParams> & { matchId: string }): AnalysisParams {
  return {
    matchId: params.matchId,
    teamA: params.teamA,
    teamB: params.teamB,
    version: Number(params.version || 1),
    periodDays: Number(params.periodDays || 40),
    decayDays: Number(params.decayDays || 14),
    weights: normalizeWeights(params.weights ?? { elo: 0.34, maps: 0.43, synergy: 0.23 }),
    useCalibratedStyle: Boolean(params.useCalibratedStyle)
  };
}

function normalizeWeights(weights: NumericWeights): NumericWeights {
  return {
    elo: Math.max(0, Number(weights.elo || 0)),
    maps: Math.max(0, Number(weights.maps || 0)),
    synergy: Math.max(0, Number(weights.synergy || 0))
  };
}

function resolveTeams(...groups: Array<string | undefined | string[]>) {
  const values = groups.flat().filter((value): value is string => Boolean(value));
  return [...new Set(values)].slice(0, 2);
}

function quality(input: { roster: number; playerStats: number; mapStats: number; h2h: number; outliers: number; warnings: string[] }) {
  const score = Math.min(100, (input.roster >= 10 ? 25 : input.roster * 2.5) + Math.min(25, input.playerStats * 2.5) + Math.min(25, input.mapStats * 2) + Math.min(15, input.h2h * 3) - Math.min(15, input.outliers * 3));
  const warnings = [...input.warnings];
  if (input.roster < 10) warnings.push("Roster sample is incomplete.");
  if (input.playerStats < 10) warnings.push("Player stats sample is low.");
  if (input.mapStats < 10) warnings.push("Map stats sample is low.");
  if (input.outliers) warnings.push("Outliers detected; averages may be distorted.");
  return {
    level: score >= 70 ? "green" as const : score >= 40 ? "yellow" as const : "red" as const,
    score: Number(score.toFixed(1)),
    sampleSummary: {
      roster: input.roster,
      playerStats: input.playerStats,
      mapStats: input.mapStats,
      h2h: input.h2h,
      outliers: input.outliers
    },
    warnings
  };
}

function cacheFile(params: AnalysisParams) {
  return path.join(cacheRoot, `${params.matchId}-v${params.version}.json`);
}

async function readAnalysisCache(params: AnalysisParams, fingerprint: string) {
  try {
    const cached = JSON.parse(await readFile(cacheFile(params), "utf8")) as { timestamp?: string; fingerprint?: string; params?: AnalysisParams; analysis?: DeepMatchAnalysis };
    const timestamp = cached.timestamp ? new Date(cached.timestamp).getTime() : 0;
    if (
      cached.analysis &&
      cached.fingerprint === fingerprint &&
      JSON.stringify(cached.params) === JSON.stringify(params) &&
      Date.now() - timestamp < analysisTtlMs
    ) return cached.analysis;
  } catch {
    // Cache miss.
  }
  return null;
}

async function writeAnalysisCache(params: AnalysisParams, fingerprint: string, analysis: DeepMatchAnalysis) {
  await mkdir(cacheRoot, { recursive: true });
  await writeFile(cacheFile(params), `${JSON.stringify({ timestamp: new Date().toISOString(), fingerprint, params, analysis }, null, 2)}\n`, "utf8");
}

async function readMatchModelContext(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    select: {
      teamA: { select: { internalElo: true } },
      teamB: { select: { internalElo: true } }
    }
  });
}

function toAnalysisCsv(rows: DeepMatchAnalysis["playerMapEfficiency"], factors: DeepMatchAnalysis["scientificFactors"]) {
  const headers = ["section", "teamName", "nickname", "mapName", "rating", "adr", "kast", "impact", "normalizedRating", "trendSlope", "sampleSize", "factorId", "factorStatus", "factorExplanation"];
  const playerRows = rows.map((row) => [
    "player_map",
    row.teamName,
    row.nickname,
    row.mapName,
    row.rating,
    row.adr,
    row.kast,
    row.impact,
    row.normalizedRating,
    row.trendSlope,
    row.sampleSize,
    "",
    "",
    ""
  ]);
  const factorRows = factors.map((factor) => ["scientific_factor", "", "", "", "", "", "", factor.impact, "", "", "", factor.id, factor.status, factor.explanation]);
  return `${headers.join(",")}\n${[...playerRows, ...factorRows].map((row) => row.map((value) => quoteCsv(String(value ?? ""))).join(",")).join("\n")}${rows.length || factors.length ? "\n" : ""}`;
}
