import { prisma } from "../prisma";
import { calculateMatchPriority, type MatchPriorityResult } from "../proFocus";
import { buildPredictionInput } from "../prediction/buildPredictionInput";
import { calculatePrediction } from "../prediction/calculatePrediction";
import { readinessRank } from "../prediction/readiness";
import type { PredictionInput, PredictionOutput } from "../prediction/types";
import { deriveDataDepth, deriveRealDataDepth } from "../ui/forecastUx";
import { MANUAL_REAL_MAP_SAMPLE_THRESHOLD } from "../manualRealReadinessRules";
import type {
  CoverageBreakdownItem,
  CoverageBreakdownStatus,
  CoverageFreshnessDetails,
  ForecastAutopilotCandidate,
  ForecastAutopilotProviderContribution,
  ForecastabilityTier
} from "../autoResearchShared";

const MAX_CANDIDATES = 80;

const tierLabels: Record<ForecastabilityTier, string> = {
  READY: "Готов к реальному прогнозу",
  NEARLY_READY: "Почти готов",
  BASIC_ONLY: "Только базовый прогноз",
  BLOCKED: "Заблокирован",
  NOT_ENOUGH_DATA: "Недостаточно данных"
};

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / 86_400_000));
}

function item(params: {
  id: string;
  label: string;
  points: number;
  maxPoints: number;
  status: CoverageBreakdownStatus;
  explanation: string;
  blocker?: string;
  freshness?: CoverageFreshnessDetails;
}): CoverageBreakdownItem {
  return params;
}

function teamSamples(rows: PredictionInput["mapStatsA"]) {
  return rows.reduce((sum, row) => sum + row.mapsPlayed, 0);
}

function hasRoster(input: PredictionInput) {
  return input.playersA.length >= 5 && input.playersB.length >= 5;
}

function hasPlayerStats(input: PredictionInput) {
  return input.playerStatsA.length >= 5 && input.playerStatsB.length >= 5;
}

function hasMapStats(input: PredictionInput) {
  return teamSamples(input.mapStatsA) >= MANUAL_REAL_MAP_SAMPLE_THRESHOLD && teamSamples(input.mapStatsB) >= MANUAL_REAL_MAP_SAMPLE_THRESHOLD;
}

function hasVeto(input: PredictionInput) {
  return input.vetoPatternsA.length > 0 && input.vetoPatternsB.length > 0;
}

function rankOrBasic(input: PredictionInput) {
  return Boolean(input.dataCoverage?.rankData || input.dataCoverage?.recentMatches || input.teamA.valveRank || input.teamB.valveRank || input.teamA.hltvRank || input.teamB.hltvRank || input.basicResultA || input.basicResultB);
}

function evidenceRows(input: PredictionInput) {
  return [
    ...input.playerStatsA,
    ...input.playerStatsB,
    ...input.mapStatsA,
    ...input.mapStatsB,
    ...input.vetoPatternsA,
    ...input.vetoPatternsB,
    ...input.playersA,
    ...input.playersB,
    ...input.h2h,
    ...input.news,
    ...(input.manualSourceRecords ?? []),
    ...(input.faceitContextRecords ?? [])
  ];
}

function evidenceFreshness(input: PredictionInput, now: Date): CoverageFreshnessDetails {
  const dates = evidenceRows(input)
    .flatMap((row) => [iso("sourceDate" in row ? row.sourceDate : null), iso("collectedAt" in row ? row.collectedAt : null), iso("createdAt" in row ? row.createdAt : null), iso("fetchedAt" in row ? row.fetchedAt : null)])
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  const latest = dates[0] ?? null;
  const period = evidenceRows(input).find((row) => "period" in row && typeof row.period === "string") as { period?: string } | undefined;
  return {
    collectedAt: latest?.toISOString() ?? null,
    sourceDate: latest?.toISOString() ?? null,
    freshnessDays: latest ? daysBetween(now, latest) : null,
    dataPeriod: period?.period ?? null,
    targetStartTime: new Date(input.match.startTime).toISOString()
  };
}

function hasLeakageFailure(input: PredictionInput) {
  return evidenceRows(input).some((row) => "dataLeakageCheckPassed" in row && row.dataLeakageCheckPassed === false);
}

function criticalNeedsReview(input: PredictionInput) {
  return Boolean(input.match.needsReview || input.teamA.needsReview || input.teamB.needsReview || input.playersA.some((player) => player.needsReview) || input.playersB.some((player) => player.needsReview));
}

function sourceUrlMissingWarning(input: PredictionInput) {
  return [...input.playerStatsA, ...input.playerStatsB, ...input.mapStatsA, ...input.mapStatsB].some((row) => ["manual_enrichment", "manual_real"].includes(row.source) && !row.sourceUrl);
}

function sourceNames(input: PredictionInput) {
  const names = new Set<string>();
  for (const row of evidenceRows(input)) {
    if ("source" in row && row.source) names.add(String(row.source));
    if ("sourceMode" in row && row.sourceMode) names.add(String(row.sourceMode));
  }
  for (const record of input.manualSourceRecords ?? []) names.add(record.source);
  for (const record of input.faceitContextRecords ?? []) names.add(record.source);
  return names;
}

function providerContributions(input: PredictionInput, breakdown: CoverageBreakdownItem[]): ForecastAutopilotProviderContribution[] {
  const sources = sourceNames(input);
  const byId = new Map(breakdown.map((entry) => [entry.id, entry.points]));
  return [
    { source: "PandaScore Free", status: input.match.sourceMode === "pandascore_free" || input.match.source === "pandascore" ? "yes" : "partial", contribution: "fixture/basic match context", points: byId.get("fixture") ?? 0 },
    { source: "Valve Rankings", status: input.dataCoverage?.rankData || input.teamA.valveRank || input.teamB.valveRank ? "yes" : "no", contribution: "ranking/basic team strength", points: input.dataCoverage?.rankData ? 6 : 0 },
    { source: "GRID Open Access", status: sources.has("grid") || sources.has("grid_open_access") ? "yes" : "no", contribution: "official OA context only when mapped", points: sources.has("grid") || sources.has("grid_open_access") ? 2 : 0 },
    { source: "FACEIT", status: (input.faceitContextRecords?.length ?? 0) > 0 ? "partial" : "no", contribution: "explicit-ID optional context", points: (input.faceitContextRecords?.length ?? 0) > 0 ? 1 : 0 },
    { source: "Leetify", status: sources.has("leetify") ? "partial" : "unavailable", contribution: "explicit-ID optional context only", points: sources.has("leetify") ? 1 : 0 },
    { source: "Manual/Parsed", status: sources.has("manual_enrichment") || sources.has("manual_real") || sources.has("parsed_demo") ? "yes" : "no", contribution: "validated user/import evidence", points: sources.has("manual_enrichment") || sources.has("manual_real") || sources.has("parsed_demo") ? 4 : 0 }
  ];
}

function blockerItems(breakdown: CoverageBreakdownItem[]) {
  return breakdown.map((entry) => entry.blocker).filter((value): value is string => Boolean(value));
}

function forecastabilityTier(params: {
  input: PredictionInput;
  prediction: PredictionOutput;
  score: number;
  realDepth: number;
  blockers: string[];
  now: Date;
}): ForecastabilityTier {
  if (params.prediction.realForecast.isReady) return "READY";
  const start = new Date(params.input.match.startTime);
  if (
    params.input.match.status !== "upcoming" ||
    start.getTime() <= params.now.getTime() ||
    !params.input.match.isOfficial ||
    ["demo", "analyst_sample"].includes(params.input.match.sourceMode ?? "") ||
    hasLeakageFailure(params.input) ||
    criticalNeedsReview(params.input)
  ) return "BLOCKED";
  if (params.score >= 70 && params.realDepth >= 3 && params.blockers.length <= 2) return "NEARLY_READY";
  if (rankOrBasic(params.input) || params.prediction.readiness.level === "L1_BASIC_CONTEXT" || params.prediction.readiness.level === "L2_BASIC_PREDICTION") return "BASIC_ONLY";
  return "NOT_ENOUGH_DATA";
}

function coverageBreakdown(input: PredictionInput, prediction: PredictionOutput, now: Date): CoverageBreakdownItem[] {
  const start = new Date(input.match.startTime);
  const futureOfficial = input.match.status === "upcoming" && input.match.isOfficial && start.getTime() > now.getTime() && !["demo", "analyst_sample"].includes(input.match.sourceMode ?? "");
  const rankBasic = rankOrBasic(input);
  const roster = hasRoster(input);
  const playerStats = hasPlayerStats(input);
  const mapStats = hasMapStats(input);
  const veto = hasVeto(input);
  const mapA = teamSamples(input.mapStatsA);
  const mapB = teamSamples(input.mapStatsB);
  const leakage = hasLeakageFailure(input);
  const needsReview = criticalNeedsReview(input);
  const freshness = evidenceFreshness(input, now);
  const freshnessOk = freshness.freshnessDays == null || freshness.freshnessDays <= 30;
  const optionalCount = [
    input.h2h.length > 0,
    input.news.length > 0 || input.rosterEventsA.length > 0 || input.rosterEventsB.length > 0,
    (input.faceitContextRecords?.length ?? 0) > 0,
    sourceNames(input).has("grid") || sourceNames(input).has("grid_open_access"),
    sourceNames(input).has("leetify")
  ].filter(Boolean).length;
  const sourceUrlWarning = sourceUrlMissingWarning(input);
  return [
    item({
      id: "fixture",
      label: "fixture/future official real",
      points: futureOfficial ? 15 : 0,
      maxPoints: 15,
      status: futureOfficial ? "yes" : "no",
      explanation: futureOfficial ? "Матч upcoming, official и real-source." : "Матч не подходит для live autopilot candidate.",
      blocker: futureOfficial ? undefined : "target is not a future official real match"
    }),
    item({
      id: "format",
      label: "BO3",
      points: input.match.format === "BO3" ? 5 : 2,
      maxPoints: 5,
      status: input.match.format === "BO3" ? "yes" : "partial",
      explanation: input.match.format === "BO3" ? "BO3 лучше подходит для аналитического сравнения." : "Не BO3: signal более шумный."
    }),
    item({
      id: "rank_basic",
      label: "ranking/basic recent context",
      points: rankBasic ? 12 : 0,
      maxPoints: 12,
      status: rankBasic ? "yes" : "no",
      explanation: rankBasic ? "Есть ranking или basic recent results." : "Нет ranking/basic recent results.",
      blocker: rankBasic ? undefined : "missing ranking/basic context"
    }),
    item({
      id: "roster",
      label: "roster",
      points: roster ? 12 : input.playersA.length + input.playersB.length > 0 ? 6 : 0,
      maxPoints: 12,
      status: roster ? "yes" : input.playersA.length + input.playersB.length > 0 ? "partial" : "no",
      explanation: roster ? "Есть составы обеих команд." : "Не хватает состава одной или обеих команд.",
      blocker: roster ? undefined : "missing roster"
    }),
    item({
      id: "player_stats",
      label: "player stats",
      points: playerStats ? 14 : input.playerStatsA.length + input.playerStatsB.length > 0 ? 7 : 0,
      maxPoints: 14,
      status: playerStats ? "yes" : input.playerStatsA.length + input.playerStatsB.length > 0 ? "partial" : "no",
      explanation: playerStats ? "Есть player stats по обеим командам." : "Не хватает player stats coverage.",
      blocker: playerStats ? undefined : "missing player stats"
    }),
    item({
      id: "map_stats",
      label: "map stats",
      points: mapStats ? 16 : mapA > 0 || mapB > 0 ? 8 : 0,
      maxPoints: 16,
      status: mapStats ? "yes" : mapA > 0 || mapB > 0 ? "partial" : "no",
      explanation: mapStats ? `Обе команды прошли map sample ${MANUAL_REAL_MAP_SAMPLE_THRESHOLD}.` : `${input.teamA.name} maps ${mapA}/${MANUAL_REAL_MAP_SAMPLE_THRESHOLD}; ${input.teamB.name} maps ${mapB}/${MANUAL_REAL_MAP_SAMPLE_THRESHOLD}.`,
      blocker: mapStats ? undefined : "map stats sample below gate"
    }),
    item({
      id: "veto",
      label: "veto",
      points: veto ? 12 : input.vetoPatternsA.length + input.vetoPatternsB.length > 0 ? 6 : 0,
      maxPoints: 12,
      status: veto ? "yes" : input.vetoPatternsA.length + input.vetoPatternsB.length > 0 ? "partial" : "no",
      explanation: veto ? "Есть veto rows по обеим командам." : "Не хватает veto по одной или обеим командам.",
      blocker: veto ? undefined : "missing veto"
    }),
    item({
      id: "freshness_safety",
      label: "freshness / no leakage / no needs_review",
      points: !leakage && !needsReview && freshnessOk ? 8 : !leakage && !needsReview ? 4 : 0,
      maxPoints: 8,
      status: !leakage && !needsReview && freshnessOk ? "yes" : !leakage && !needsReview ? "partial" : "no",
      explanation: sourceUrlWarning
        ? "sourceUrl missing lowers source confidence but is not a hard blocker."
        : freshnessOk
          ? "No leakage/critical needs_review and data freshness is acceptable."
          : "Freshness needs review.",
      blocker: leakage ? "leakage failed" : needsReview ? "critical needs_review" : freshnessOk ? undefined : "stale evidence",
      freshness
    }),
    item({
      id: "optional_context",
      label: "optional GRID/FACEIT/Leetify/H2H/news",
      points: Math.min(6, optionalCount * 2),
      maxPoints: 6,
      status: optionalCount >= 3 ? "yes" : optionalCount > 0 ? "partial" : "no",
      explanation: optionalCount > 0 ? "Есть optional context, но он не заменяет required gates." : "Нет optional H2H/news/GRID/FACEIT/Leetify context."
    })
  ];
}

function selectionReason(candidate: ForecastAutopilotCandidate) {
  if (candidate.realForecastReady) return "Выбран, потому что уже проходит Real Forecast gates.";
  if (candidate.forecastabilityTier === "NEARLY_READY") return "Выбран как ближайший к real forecast: высокий coverage и мало blockers.";
  if (candidate.forecastabilityTier === "BASIC_ONLY") return "Выбран как лучший basic candidate среди доступных матчей.";
  return "Выбран как лучший доступный candidate, но данных всё ещё недостаточно.";
}

export function scoreForecastAutopilotCandidate(params: {
  input: PredictionInput;
  prediction: PredictionOutput;
  priority: MatchPriorityResult;
  now?: Date;
}): ForecastAutopilotCandidate {
  const now = params.now ?? new Date();
  const breakdown = coverageBreakdown(params.input, params.prediction, now);
  const coverageScore = breakdown.reduce((sum, entry) => sum + entry.points, 0);
  const maxCoverageScore = breakdown.reduce((sum, entry) => sum + entry.maxPoints, 0);
  const previewDepth = deriveDataDepth(params.input, params.prediction).level;
  const realDepth = deriveRealDataDepth(params.input, params.prediction).level;
  const blockers = blockerItems(breakdown);
  const tier = forecastabilityTier({ input: params.input, prediction: params.prediction, score: coverageScore, realDepth, blockers, now });
  const missingBlocks = [...new Set([...params.prediction.readiness.missingCriticalData, ...params.prediction.realForecast.reasons, ...blockers])].slice(0, 8);
  const providerContributions = providerContributionsForCandidate(params.input, breakdown);
  const candidate: ForecastAutopilotCandidate = {
    matchId: params.input.match.id,
    href: `/match/${params.input.match.id}`,
    eventName: params.input.match.eventName,
    startTime: new Date(params.input.match.startTime).toISOString(),
    status: params.input.match.status,
    format: params.input.match.format,
    teamAName: params.input.teamA.name,
    teamBName: params.input.teamB.name,
    coverageScore,
    maxCoverageScore,
    coverageBreakdown: breakdown,
    forecastabilityTier: tier,
    forecastabilityLabel: tierLabels[tier],
    readinessLevel: params.prediction.readiness.level,
    readinessRank: readinessRank(params.prediction.readiness.level),
    realForecastReady: params.prediction.realForecast.isReady,
    previewDataDepth: previewDepth,
    realDataDepth: realDepth,
    dataQualityScore: params.prediction.dataQualityScore,
    confidenceScore: params.prediction.confidenceScore,
    priorityScore: params.priority.priorityScore,
    priorityLabel: params.priority.priorityLabel,
    selectionReason: "",
    blockers,
    missingBlocks,
    providerContributions
  };
  candidate.selectionReason = selectionReason(candidate);
  return candidate;
}

function providerContributionsForCandidate(input: PredictionInput, breakdown: CoverageBreakdownItem[]) {
  return providerContributions(input, breakdown);
}

function sortCandidates(candidates: ForecastAutopilotCandidate[]) {
  const tierPenalty = (candidate: ForecastAutopilotCandidate) => candidate.forecastabilityTier === "BLOCKED" ? 1 : 0;
  return [...candidates].sort((a, b) => {
    const blocked = tierPenalty(a) - tierPenalty(b);
    if (blocked !== 0) return blocked;
    if (Number(b.realForecastReady) - Number(a.realForecastReady) !== 0) return Number(b.realForecastReady) - Number(a.realForecastReady);
    if (b.readinessRank - a.readinessRank !== 0) return b.readinessRank - a.readinessRank;
    if (b.coverageScore - a.coverageScore !== 0) return b.coverageScore - a.coverageScore;
    if (b.realDataDepth - a.realDataDepth !== 0) return b.realDataDepth - a.realDataDepth;
    if ((b.format === "BO3" ? 1 : 0) - (a.format === "BO3" ? 1 : 0) !== 0) return (b.format === "BO3" ? 1 : 0) - (a.format === "BO3" ? 1 : 0);
    if (b.priorityScore - a.priorityScore !== 0) return b.priorityScore - a.priorityScore;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

function finalizeCandidateReasons(candidates: ForecastAutopilotCandidate[]) {
  const best = candidates[0] ?? null;
  return candidates.map((candidate, index) => ({
    ...candidate,
    whySelected: index === 0 ? candidate.selectionReason : undefined,
    whyNotSelected: index === 0 || !best
      ? undefined
      : candidate.forecastabilityTier === "BLOCKED"
        ? `Не выбран: ${candidate.blockers[0] ?? "candidate blocked"}.`
        : `Не выбран: лучший кандидат имеет ${best.coverageScore}/100 против ${candidate.coverageScore}/100; ${candidate.blockers[0] ?? candidate.missingBlocks[0] ?? "меньше usable coverage"}.`
  }));
}

export function rankForecastAutopilotCandidates(candidates: ForecastAutopilotCandidate[]) {
  return finalizeCandidateReasons(sortCandidates(candidates));
}

export async function buildForecastAutopilotCandidate(matchId: string, now = new Date()) {
  const input = await buildPredictionInput(matchId);
  const prediction = calculatePrediction(input);
  const priority = calculateMatchPriority({ ...input.match, teamA: input.teamA, teamB: input.teamB }, now);
  return scoreForecastAutopilotCandidate({ input, prediction, priority, now });
}

export async function getForecastAutopilotCandidates(now = new Date(), limit = MAX_CANDIDATES) {
  const matches = await prisma.match.findMany({
    where: {
      status: "upcoming",
      isOfficial: true,
      sourceMode: { notIn: ["demo", "analyst_sample"] },
      startTime: { gt: now }
    },
    select: { id: true },
    orderBy: { startTime: "asc" },
    take: limit
  });
  const candidates = await Promise.all(matches.map((match) => buildForecastAutopilotCandidate(match.id, now).catch(() => null)));
  return rankForecastAutopilotCandidates(candidates.filter((candidate): candidate is ForecastAutopilotCandidate => Boolean(candidate)));
}
