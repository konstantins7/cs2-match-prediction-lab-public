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

function sumContributions(factors: PredictionFactorOutput[]) {
  return factors.reduce((sum, factor) => sum + factorContribution(factor), 0);
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
      ...lowConfidence.slice(0, 5).map((factor) => `${factor.factorName}: низкий factor confidence.`)
    ],
    missingData: warningFactors.flatMap((factor) => factor.warnings).filter((warning, index, all) => all.indexOf(warning) === index).slice(0, 8),
    conflictingFactors: positives.length > 0 && negatives.length > 0 ? [`Факторы расходятся: ${positives[0].factorName} за ${input.teamA.name}, ${negatives[0].factorName} за ${input.teamB.name}.`] : [],
    riskReasons: [
      ...(close ? ["Вероятности близкие, small edge может измениться из-за veto/news."] : []),
      ...(input.match.format === "BO1" ? ["BO1 риск: pistol/economy/veto могут сильнее качнуть матч."] : []),
      ...(newRoster ? ["Новый roster повышает uncertainty."] : []),
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
  const probabilities = probabilityFromRawScore(rawScore);
  const quality = Math.round(dataQualityScore(input) * 100);
  const riskBreakdown = buildRiskBreakdown(input, factors, probabilities, quality);
  const confidence = confidenceScore(input, factors, probabilities, quality, riskBreakdown);
  const risk = riskLevel(input, probabilities, confidence, riskBreakdown);
  const warnings = factors.flatMap((factor) => factor.warnings).filter((warning, index, all) => all.indexOf(warning) === index);
  const predictedWinnerId = probabilities.teamAProbability >= probabilities.teamBProbability ? input.teamA.id : input.teamB.id;
  const partial = {
    teamAProbability: probabilities.teamAProbability,
    teamBProbability: probabilities.teamBProbability,
    factors,
    confidenceScore: confidence,
    riskLevel: risk
  };

  return {
    ...probabilities,
    predictedWinnerId,
    confidenceScore: confidence,
    riskLevel: risk,
    dataQualityScore: quality,
    factors,
    explanation: generateExplanation(input, partial),
    warnings,
    evidence: factors.flatMap((factor) => factor.evidence),
    vetoScenarios: buildVetoScenarios(input),
    riskBreakdown,
    modelVersion: "mvp-0.2-live",
    rawScore
  };
}
