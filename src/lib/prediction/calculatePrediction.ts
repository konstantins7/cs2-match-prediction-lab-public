import {
  basicRankingAdvantageFactor,
  basicRecentResultsFactor,
  fixtureConfidenceFactor,
  teamKnownnessFactor,
  tournamentImportanceFactor,
  unknownDataPenaltyFactor
} from "./basicReal";
import { chemistryFactor } from "./chemistry";
import { closingFactor } from "./closing";
import { comebackFactor } from "./comeback";
import { communicationFactor } from "./communication";
import { coreStabilityFactor } from "./coreStability";
import { dataQualityFactor, dataQualityScore } from "./dataQuality";
import { dataRelevanceFactor } from "./dataRelevance";
import { economyFactor } from "./economy";
import { fatigueFactor } from "./fatigue";
import { formatFactor } from "./formatFactor";
import { headToHeadFactor } from "./headToHead";
import { honeymoonFactor } from "./honeymoon";
import { kdTrendFactor } from "./kdTrend";
import { lanOnlineFactor } from "./lanOnline";
import { leadershipFactor } from "./leadership";
import { mapPoolFactor } from "./mapPool";
import { metaShiftFactor } from "./metaShift";
import { newsImpactFactor } from "./newsImpact";
import { opponentMatchupFactor } from "./opponentMatchup";
import { overtimeFactor } from "./overtime";
import { playerFormFactor } from "./playerForm";
import { playerSystemFitFactor } from "./playerSystemFit";
import { positionChangeFactor } from "./positionChange";
import { recentFormFactor } from "./recentForm";
import { roleChangeFactor } from "./roleChange";
import { roleConflictFactor } from "./roleConflict";
import { teamStrengthFactor } from "./teamStrength";
import { transferAdaptationFactor } from "./transferAdaptation";
import { buildVetoScenarios, vetoFactor } from "./veto";
import type { PredictionFactorOutput, PredictionInput, PredictionOutput, RiskConfidenceBreakdown, RiskLevel } from "./types";
import { clamp, daysBetween, factorContribution, probabilityFromRawScore, round } from "./normalization";
import { generateExplanation } from "./explanationGenerator";
import { getEffectiveRank } from "../proFocus";
import { calculatePredictionReadiness, readinessRank } from "./readiness";
import { evaluateRealForecastStatus } from "../realForecast";

function sumContributions(factors: PredictionFactorOutput[]) {
  return factors.reduce((sum, factor) => sum + factorContribution(factor), 0);
}

function applyProbabilitySafetyCaps(input: PredictionInput, probabilities: { teamAProbability: number; teamBProbability: number }) {
  const reasons: string[] = [];
  const sourceMode = input.match.sourceMode ?? "demo";
  const hasRealPlayerStats = [...input.playerStatsA, ...input.playerStatsB].some((stat) => !["mock", "demo", "test"].includes(stat.source));
  const hasRealMapStats = [...input.mapStatsA, ...input.mapStatsB].some((stat) => !["mock", "demo", "test"].includes(stat.source));
  const hasVetoData = input.vetoPatternsA.length > 0 && input.vetoPatternsB.length > 0;
  const rankA = getEffectiveRank(input.teamA).rank;
  const rankB = getEffectiveRank(input.teamB).rank;
  const hasRankData = Boolean((rankA && rankA <= 100) || (rankB && rankB <= 100));
  const hasBasicResults = Boolean((input.basicResultA?.matchesPlayed ?? 0) > 0 || (input.basicResultB?.matchesPlayed ?? 0) > 0);
  const hasDeepStats = hasRealPlayerStats || hasRealMapStats || hasVetoData || Boolean(input.teamFormA || input.teamFormB);
  const bothUnrankedNoHistory = !hasRankData && !hasBasicResults && !hasDeepStats;
  const fixtureOnly = ["pandascore_free", "manual_real", "partial"].includes(sourceMode) && !hasRankData && !hasBasicResults && !hasDeepStats;
  const rankingOnly = hasRankData && !hasBasicResults && !hasDeepStats;
  const basicResultsOnly = !hasRankData && hasBasicResults && !hasDeepStats;
  const rankingAndBasicOnly = hasRankData && hasBasicResults && !hasDeepStats;
  const parsedDemoSample = [...input.mapStatsA, ...input.mapStatsB].reduce((sum, stat) => sum + (stat.source === "parsed_demo" ? stat.mapsPlayed : 0), 0);
  const caps: number[] = [];

  if (bothUnrankedNoHistory) {
    return {
      probabilities: { teamAProbability: 50, teamBProbability: 50 },
      cap: { cap: 50, reasons: ["Обе команды unranked и нет history/player/map/veto stats: строгий 50/50."] }
    };
  }

  if (fixtureOnly) {
    caps.push(55);
    reasons.push("Fixture-only cap 55/45: есть только базовая информация о матче.");
  }
  if (rankingOnly) {
    caps.push(60);
    reasons.push("Ranking-only cap 60/40: рейтинг даёт только ограниченный prior.");
  }
  if (basicResultsOnly) {
    caps.push(60);
    reasons.push("Basic recent results only cap 60/40 без ranking/player/map/veto stats.");
  }
  if (rankingAndBasicOnly) {
    caps.push(65);
    reasons.push("Ranking + basic recent results cap 65/35 без player/map/veto stats.");
  }

  if (sourceMode === "demo") {
    caps.push(75);
    reasons.push("DEMO DATA cap 75/25.");
  }
  if (sourceMode === "valve_rankings") {
    caps.push(70);
    reasons.push("Rankings-only cap 70/30.");
  }
  if (sourceMode === "pandascore_free" && (!hasRealPlayerStats || !hasRealMapStats || !hasVetoData)) {
    caps.push(72);
    reasons.push("PandaScore fixtures-only cap 72/28 без real player/map/veto stats.");
  }
  if (sourceMode === "manual_real" && !hasRealPlayerStats) {
    caps.push(72);
    reasons.push("Manual real match cap 72/28 без player stats.");
  }
  if (sourceMode === "parsed_demo" && parsedDemoSample >= 40) {
    caps.push(88);
    reasons.push("Parsed demo cap 88/12 при достаточной выборке.");
  }
  if (input.sourceConflicts.length > 0 || sourceMode === "mixed") {
    caps.push(68);
    reasons.push("Source conflict cap 68/32.");
  }
  if (input.match.needsReview || sourceMode === "needs_review" || sourceMode === "partial") {
    caps.push(80);
    reasons.push("Partial/needs-review cap 80/20.");
  }

  const cap = caps.length ? Math.min(...caps) : 99;
  if (cap >= 99) return { probabilities, cap: undefined };
  const favorite = Math.max(probabilities.teamAProbability, probabilities.teamBProbability);
  if (favorite <= cap) return { probabilities, cap: { cap, reasons } };
  const teamAFavorite = probabilities.teamAProbability >= probabilities.teamBProbability;
  const capped = teamAFavorite
    ? { teamAProbability: cap, teamBProbability: 100 - cap }
    : { teamAProbability: 100 - cap, teamBProbability: cap };
  return { probabilities: capped, cap: { cap, reasons } };
}

function capProbabilities(probabilities: { teamAProbability: number; teamBProbability: number }, cap: number) {
  const favorite = Math.max(probabilities.teamAProbability, probabilities.teamBProbability);
  if (favorite <= cap) return probabilities;
  const teamAFavorite = probabilities.teamAProbability >= probabilities.teamBProbability;
  return teamAFavorite
    ? { teamAProbability: cap, teamBProbability: 100 - cap }
    : { teamAProbability: 100 - cap, teamBProbability: cap };
}

function applyReadinessGate(
  probabilities: { teamAProbability: number; teamBProbability: number },
  confidence: number,
  readiness: PredictionOutput["readiness"],
  dataQuality: number
) {
  const reasons: string[] = [];
  let gatedProbabilities = probabilities;
  let gatedConfidence = confidence;
  let cap: number | undefined;

  if (dataQuality < 20) {
    reasons.push("Data quality ниже 20: actionable probability скрыта, используется neutral 50/50 baseline.");
    return {
      probabilities: { teamAProbability: 50, teamBProbability: 50 },
      confidence: Math.min(gatedConfidence, 20),
      cap: { cap: 50, reasons }
    };
  }

  if (readiness.level === "L0_FIXTURE_ONLY") {
    cap = 50;
    reasons.push("Readiness L0: прогноз не готов, только neutral 50/50 baseline.");
    gatedProbabilities = { teamAProbability: 50, teamBProbability: 50 };
    gatedConfidence = Math.min(gatedConfidence, 20);
  } else if (readiness.level === "L1_BASIC_CONTEXT") {
    cap = 55;
    reasons.push("Readiness L1 cap 55/45: слабый предварительный сигнал, не полноценный прогноз.");
    gatedProbabilities = capProbabilities(gatedProbabilities, cap);
    gatedConfidence = Math.min(gatedConfidence, 35);
  } else if (readiness.level === "L2_BASIC_PREDICTION") {
    cap = 65;
    reasons.push("Readiness L2 cap 65/35: preliminary basic prediction без полного player/map/veto слоя.");
    gatedProbabilities = capProbabilities(gatedProbabilities, cap);
    gatedConfidence = Math.min(gatedConfidence, 55);
  }

  return {
    probabilities: gatedProbabilities,
    confidence: gatedConfidence,
    cap: cap ? { cap, reasons } : undefined
  };
}

function applyReadinessFactorWarnings(input: PredictionInput, factors: PredictionFactorOutput[], readiness: PredictionOutput["readiness"]) {
  if (readinessRank(readiness.level) >= 3) return factors;
  const missingRosterMapVeto =
    input.playersA.length < 5 ||
    input.playersB.length < 5 ||
    input.mapStatsA.length === 0 ||
    input.mapStatsB.length === 0 ||
    input.vetoPatternsA.length === 0 ||
    input.vetoPatternsB.length === 0;

  return factors.map((factor) => {
    const warnings = [...factor.warnings];
    if (Math.abs(factor.impact) > 0.01) {
      warnings.push("Этот фактор основан на limited data и не является полноценным прогнозным сигналом.");
    }
    if (factor.factorName === "Basic Ranking Advantage" && missingRosterMapVeto) {
      warnings.push("Ranking signal exists, but missing roster/map/veto prevents stronger confidence.");
    }
    return {
      ...factor,
      warnings: warnings.filter((warning, index, all) => all.indexOf(warning) === index)
    };
  });
}

function rosterAgeDays(input: PredictionInput) {
  const ages = [input.rosterVersionA?.startedAt, input.rosterVersionB?.startedAt]
    .filter(Boolean)
    .map((date) => daysBetween(date as Date | string, "2026-05-12T08:00:00.000Z"));
  return ages.length ? Math.min(...ages) : 999;
}

function buildRiskBreakdown(input: PredictionInput, factors: PredictionFactorOutput[], probabilities: { teamAProbability: number; teamBProbability: number }, dataQuality: number): RiskConfidenceBreakdown {
  const warningFactors = factors.filter((factor) => factor.warnings.length > 0);
  const lowConfidence = factors.filter((factor) => factor.confidence < 0.55);
  const positives = factors.filter((factor) => factor.impact > 1.5);
  const negatives = factors.filter((factor) => factor.impact < -1.5);
  const close = Math.abs(probabilities.teamAProbability - probabilities.teamBProbability) <= 6;
  const newRoster = rosterAgeDays(input) < 45;

  return {
    confidenceDrivers: [
      ...(dataQuality >= 70 ? ["Хорошее покрытие данных и sample size."] : []),
      ...(input.match.format !== "BO1" ? ["Формат BO3/BO5 снижает случайность одной карты."] : []),
      ...factors.filter((factor) => factor.confidence > 0.75).slice(0, 4).map((factor) => `${factor.factorName}: высокая уверенность фактора.`)
    ],
    confidenceReducers: [
      ...(dataQuality < 50 || input.match.dataQualityScore < 50 ? ["Data quality ниже 50: confidence cap 65."] : []),
      ...(input.match.format === "BO1" ? ["BO1 повышает variance: confidence cap 75."] : []),
      ...(newRoster ? ["Новый состав: confidence cap 70."] : []),
      ...(input.sourceConflicts.length ? ["Есть source conflict: data quality и confidence снижены до review."] : []),
      ...lowConfidence.slice(0, 5).map((factor) => `${factor.factorName}: низкий factor confidence.`)
    ],
    missingData: warningFactors.flatMap((factor) => factor.warnings).filter((warning, index, all) => all.indexOf(warning) === index).slice(0, 8),
    conflictingFactors: positives.length > 0 && negatives.length > 0 ? [`Факторы расходятся: ${positives[0].factorName} за ${input.teamA.name}, ${negatives[0].factorName} за ${input.teamB.name}.`] : [],
    riskReasons: [
      ...(close ? ["Вероятности близкие, small edge может измениться из-за veto/news."] : []),
      ...(input.match.format === "BO1" ? ["BO1 риск: pistol/economy/veto могут сильнее качнуть матч."] : []),
      ...(newRoster ? ["Новый roster повышает uncertainty."] : []),
      ...(input.sourceConflicts.length ? ["Source conflict warning: выбран источник по priority, но нужен review."] : []),
      ...warningFactors.slice(0, 4).map((factor) => `${factor.factorName}: ${factor.warnings[0]}`)
    ]
  };
}

function confidenceScore(input: PredictionInput, factors: PredictionFactorOutput[], probabilities: { teamAProbability: number; teamBProbability: number }, dataQuality: number, risk: RiskConfidenceBreakdown) {
  const averageFactorConfidence = factors.reduce((sum, factor) => sum + factor.confidence, 0) / Math.max(factors.length, 1);
  const spread = Math.abs(probabilities.teamAProbability - probabilities.teamBProbability);
  const stability = ((input.rosterVersionA?.coreStabilityScore ?? 0.5) + (input.rosterVersionB?.coreStabilityScore ?? 0.5)) / 2;
  const volatilityPenalty =
    factors.filter((factor) => factor.confidence < 0.55).length * 1.8 +
    risk.riskReasons.length * 1.2 +
    risk.conflictingFactors.length * 4;
  let score = 34 + averageFactorConfidence * 38 + dataQuality * 0.18 + spread * 0.18 + stability * 6 - volatilityPenalty;
  if (input.match.format === "BO1") score = Math.min(score, 75);
  if (dataQuality < 50 || input.match.dataQualityScore < 50) score = Math.min(score, 65);
  if (rosterAgeDays(input) < 45) score = Math.min(score, 70);
  return Math.round(clamp(score, 0, 100));
}

function riskLevel(input: PredictionInput, probabilities: { teamAProbability: number; teamBProbability: number }, confidence: number, risk: RiskConfidenceBreakdown): RiskLevel {
  const close = Math.abs(probabilities.teamAProbability - probabilities.teamBProbability) <= 6;
  const highSignals = risk.riskReasons.length + risk.confidenceReducers.length + risk.conflictingFactors.length;
  if (input.match.format === "BO1" || confidence < 54 || (close && highSignals >= 3) || rosterAgeDays(input) < 30) return "High";
  if (close || confidence < 68 || highSignals >= 3) return "Medium";
  return "Low";
}

export function calculatePrediction(input: PredictionInput): PredictionOutput {
  const baseFactors = [
    basicRankingAdvantageFactor(input),
    basicRecentResultsFactor(input),
    tournamentImportanceFactor(input),
    teamKnownnessFactor(input),
    fixtureConfidenceFactor(input),
    unknownDataPenaltyFactor(input),
    teamStrengthFactor(input),
    recentFormFactor(input),
    playerFormFactor(input),
    kdTrendFactor(input),
    mapPoolFactor(input),
    vetoFactor(input)
  ];
  const preOvertimeRaw = sumContributions(baseFactors);
  const factors = [
    ...baseFactors,
    overtimeFactor(input, preOvertimeRaw),
    closingFactor(input),
    comebackFactor(input),
    economyFactor(input),
    headToHeadFactor(input),
    opponentMatchupFactor(input),
    newsImpactFactor(input),
    fatigueFactor(input),
    lanOnlineFactor(input),
    formatFactor(input),
    dataQualityFactor(input),
    metaShiftFactor(input),
    dataRelevanceFactor(input),
    transferAdaptationFactor(input),
    communicationFactor(input),
    chemistryFactor(input),
    roleChangeFactor(input),
    positionChangeFactor(input),
    playerSystemFitFactor(input),
    leadershipFactor(input),
    honeymoonFactor(input),
    coreStabilityFactor(input),
    roleConflictFactor(input)
  ];
  const rawScore = round(sumContributions(factors), 3);
  const uncappedProbabilities = probabilityFromRawScore(rawScore);
  const capped = applyProbabilitySafetyCaps(input, uncappedProbabilities);
  const quality = Math.round(dataQualityScore(input) * 100);
  const preliminaryRiskBreakdown = buildRiskBreakdown(input, factors, capped.probabilities, quality);
  const preliminaryConfidence = confidenceScore(input, factors, capped.probabilities, quality, preliminaryRiskBreakdown);
  const preliminaryReadiness = calculatePredictionReadiness(input, quality, preliminaryConfidence);
  const readiness =
    quality < 20
      ? {
          ...preliminaryReadiness,
          isActionable: false,
          reasons: [...preliminaryReadiness.reasons, "Data quality ниже 20: insufficient data preview, не actionable forecast."].filter((reason, index, all) => all.indexOf(reason) === index)
        }
      : preliminaryReadiness;
  const readinessGate = applyReadinessGate(capped.probabilities, preliminaryConfidence, readiness, quality);
  const probabilities = readinessGate.probabilities;
  const factorsWithReadiness = applyReadinessFactorWarnings(input, factors, readiness);
  const riskBreakdown = buildRiskBreakdown(input, factorsWithReadiness, probabilities, quality);
  const confidence = Math.min(
    readinessGate.confidence,
    confidenceScore(input, factorsWithReadiness, probabilities, quality, riskBreakdown)
  );
  const risk = riskLevel(input, probabilities, confidence, riskBreakdown);
  const probabilityCap =
    capped.cap || readinessGate.cap
      ? {
          cap: Math.min(capped.cap?.cap ?? 99, readinessGate.cap?.cap ?? 99),
          reasons: [...(capped.cap?.reasons ?? []), ...(readinessGate.cap?.reasons ?? [])].filter((reason, index, all) => all.indexOf(reason) === index)
        }
      : undefined;
  const warnings = [...factorsWithReadiness.flatMap((factor) => factor.warnings), ...(probabilityCap?.reasons ?? [])].filter((warning, index, all) => all.indexOf(warning) === index);
  const predictedWinnerId = probabilities.teamAProbability >= probabilities.teamBProbability ? input.teamA.id : input.teamB.id;
  const realForecast = evaluateRealForecastStatus(input, { readiness, dataQualityScore: quality, warnings });
  const partial = {
    teamAProbability: probabilities.teamAProbability,
    teamBProbability: probabilities.teamBProbability,
    factors: factorsWithReadiness,
    confidenceScore: confidence,
    riskLevel: risk
  };

  return {
    ...probabilities,
    predictedWinnerId,
    confidenceScore: confidence,
    riskLevel: risk,
    dataQualityScore: quality,
    factors: factorsWithReadiness,
    explanation: generateExplanation(input, partial),
    warnings,
    evidence: factorsWithReadiness.flatMap((factor) => factor.evidence),
    vetoScenarios: buildVetoScenarios(input),
    riskBreakdown,
    modelVersion: "mvp-0.3-live",
    rawScore,
    probabilityCap,
    readiness,
    sourceLevel: realForecast.sourceLevel,
    manualRealPackQuality: {
      score: realForecast.manualRealPackQuality.score,
      label: realForecast.manualRealPackQuality.label,
      canReachL3: realForecast.manualRealPackQuality.canReachL3,
      reasons: realForecast.manualRealPackQuality.reasons,
      warnings: realForecast.manualRealPackQuality.warnings
    },
    realForecast: {
      isReady: realForecast.isReady,
      label: realForecast.label,
      sourceLevel: realForecast.sourceLevel,
      reasons: realForecast.reasons,
      sampleOnlyWarning: realForecast.sampleOnlyWarning
    }
  };
}
