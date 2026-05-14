import type { PredictionInput, PredictionOutput } from "@/lib/predictionEngine";
import { getBestNextAction } from "@/lib/bestNextAction";

export type DataDepth = {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  description: string;
};

const depthLabels: Record<DataDepth["level"], Omit<DataDepth, "level">> = {
  1: {
    label: "Базовые данные матча",
    description: "Есть fixture: команды, время, формат и турнир."
  },
  2: {
    label: "Рейтинг/basic history",
    description: "Есть ranking или базовая история результатов."
  },
  3: {
    label: "Составы/player stats",
    description: "Есть составы и статистика игроков."
  },
  4: {
    label: "Карты/veto",
    description: "Есть map stats и veto history."
  },
  5: {
    label: "Demo/round/economy",
    description: "Есть глубокие demo, round или economy данные."
  }
};

export function deriveDataDepth(input: PredictionInput, prediction: PredictionOutput): DataDepth {
  const coverage = input.dataCoverage;
  const hasRoster = input.playersA.length > 0 && input.playersB.length > 0;
  const hasPlayerStats = input.playerStatsA.length > 0 && input.playerStatsB.length > 0;
  const hasMapStats = input.mapStatsA.length > 0 && input.mapStatsB.length > 0;
  const hasVeto = input.vetoPatternsA.length > 0 && input.vetoPatternsB.length > 0;
  const hasDeepSource =
    prediction.sourceLevel === "Deep data" ||
    [...(input.manualSourceRecords ?? []), ...(input.faceitContextRecords ?? [])].some((record) => {
      const raw = record.rawJson.toLowerCase();
      return raw.includes("parsed_demo") || raw.includes("roundeconomy") || raw.includes("economy") || raw.includes("grid");
    });

  let level: DataDepth["level"] = 1;
  if (
    prediction.readiness.level !== "L0_FIXTURE_ONLY" ||
    coverage?.rankData ||
    coverage?.recentMatches ||
    input.teamA.valveRank ||
    input.teamB.valveRank ||
    input.basicResultA ||
    input.basicResultB
  ) {
    level = 2;
  }
  if ((coverage?.playerRoster || hasRoster) && (coverage?.playerStats || hasPlayerStats)) level = 3;
  if ((coverage?.mapStats || hasMapStats) && (coverage?.vetoHistory || hasVeto)) level = 4;
  if (hasDeepSource) level = 5;

  return { level, ...depthLabels[level] };
}

export type ForecastStoryView = {
  known: string[];
  missing: string[];
  probability: string[];
  change: string[];
  nextAction: {
    label: string;
    href: string;
    reason: string;
  };
};

export function buildForecastStory(input: PredictionInput, prediction: PredictionOutput): ForecastStoryView {
  const depth = deriveDataDepth(input, prediction);
  const best = getBestNextAction(prediction);
  const known = [
    depth.description,
    input.dataCoverage?.rankData ? "Есть ranking signal." : "",
    input.dataCoverage?.recentMatches ? "Есть basic history." : "",
    input.dataCoverage?.newsOrRosterEvents ? "Есть новости или roster context." : "",
    prediction.realForecast.isReady ? "Есть validated real data coverage." : ""
  ].filter(Boolean);
  const missing = (prediction.readiness.missingCriticalData.length
    ? prediction.readiness.missingCriticalData
    : prediction.realForecast.reasons.length
      ? prediction.realForecast.reasons
      : ["Критичных пропусков нет, но свежесть данных всё равно нужно проверять."]).slice(0, 5);
  const mainFactors = prediction.factors
    .filter((factor) => Math.abs(factor.impact) > 0.5)
    .sort((a, b) => Math.abs(b.impact * b.weight * b.confidence) - Math.abs(a.impact * a.weight * a.confidence))
    .slice(0, 3)
    .map((factor) => `${factor.factorName}: ${factor.explanation}`);
  const probability = mainFactors.length
    ? mainFactors
    : [`Вероятность сейчас близка к балансу: ${input.teamA.name} ${prediction.teamAProbability}% / ${input.teamB.name} ${prediction.teamBProbability}%.`];
  const change = [
    ...prediction.warnings,
    ...prediction.riskBreakdown.riskReasons,
    ...prediction.riskBreakdown.missingData.map((item) => `Снизит риск: ${item}`)
  ].slice(0, 5);
  return {
    known: known.length ? known : ["Есть только базовый fixture-сигнал."],
    missing,
    probability,
    change: change.length ? change : ["Свежие составы, map/veto и player stats могут заметно уточнить прогноз."],
    nextAction: best.primaryAction
  };
}

export type ConfidenceRiskView = {
  confidenceLabel: string;
  confidenceReasons: string[];
  riskReasons: string[];
  reduceRiskWith: string[];
};

export function buildConfidenceRiskExplanation(prediction: PredictionOutput): ConfidenceRiskView {
  const confidenceLabel =
    prediction.confidenceScore >= 70
      ? "Уверенность высокая"
      : prediction.confidenceScore >= 55
        ? "Уверенность средняя"
        : "Уверенность низкая";
  const confidenceReasons = [
    ...prediction.riskBreakdown.confidenceDrivers,
    ...prediction.riskBreakdown.confidenceReducers.map((item) => `Снижает confidence: ${item}`)
  ].slice(0, 5);
  const riskReasons = [
    ...prediction.riskBreakdown.riskReasons,
    ...prediction.riskBreakdown.conflictingFactors,
    ...prediction.warnings
  ].slice(0, 5);
  const reduceRiskWith = (prediction.riskBreakdown.missingData.length
    ? prediction.riskBreakdown.missingData
    : prediction.readiness.missingCriticalData.length
      ? prediction.readiness.missingCriticalData
      : ["Проверить свежие roster/news и map/veto перед матчем."]).slice(0, 4);
  return {
    confidenceLabel,
    confidenceReasons: confidenceReasons.length ? confidenceReasons : ["Confidence держится на текущем качестве данных и согласованности факторов."],
    riskReasons: riskReasons.length ? riskReasons : ["Критичных risk-сигналов сейчас нет."],
    reduceRiskWith
  };
}
