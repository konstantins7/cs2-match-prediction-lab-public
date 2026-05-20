import type { MapProbability, ModelPredictions, NumericWeights, TeamSynergy } from "@/lib/math/types";
import { weightedScientificPrediction } from "@/lib/math/mlPredictor";

export function compareAdvisoryModels(input: {
  teamA: string;
  teamB: string;
  teamAInternalElo?: number;
  teamBInternalElo?: number;
  teamElo: Record<string, number>;
  mapProbabilities: MapProbability[];
  synergies: TeamSynergy[];
  weights: NumericWeights;
  useCalibratedStyle?: boolean;
}): ModelPredictions {
  const eloA = input.teamAInternalElo ?? input.teamElo[input.teamA] ?? 1500;
  const eloB = input.teamBInternalElo ?? input.teamElo[input.teamB] ?? 1500;
  const eloProbability = clamp(round(logistic((eloA - eloB) / 400) * 100));
  const bayesianMapProbability = input.mapProbabilities.length
    ? clamp(round(avg(input.mapProbabilities.map((row) => row.teamAWinProbability))))
    : 50;
  const weightedWeights = input.useCalibratedStyle
    ? { elo: 0.5, maps: 0.35, synergy: 0.15 }
    : input.weights;
  const weighted = weightedScientificPrediction({
    teamA: input.teamA,
    teamB: input.teamB,
    teamElo: {
      ...input.teamElo,
      [input.teamA]: eloA,
      [input.teamB]: eloB
    },
    mapProbabilities: input.mapProbabilities,
    synergies: input.synergies,
    weights: weightedWeights
  });
  const ensembleProbability = clamp(round(avg([eloProbability, bayesianMapProbability, weighted.teamAProbability])));
  return {
    elo: {
      teamAProbability: eloProbability,
      teamBProbability: round(100 - eloProbability),
      warnings: input.teamAInternalElo === undefined || input.teamBInternalElo === undefined ? ["Internal Elo missing; neutral/default rating used."] : []
    },
    bayesianMap: {
      teamAProbability: bayesianMapProbability,
      teamBProbability: round(100 - bayesianMapProbability),
      warnings: input.mapProbabilities.length ? [] : ["No map probability rows; Bayesian model is neutral."]
    },
    weighted: {
      teamAProbability: weighted.teamAProbability,
      teamBProbability: round(100 - weighted.teamAProbability),
      weightsUsed: input.useCalibratedStyle ? "calibrated-style" : "analysis-weights",
      warnings: weighted.warnings
    },
    ensemble: {
      teamAProbability: ensembleProbability,
      teamBProbability: round(100 - ensembleProbability),
      warnings: ["Advisory ensemble only; production calculatePrediction is unchanged."]
    }
  };
}

function logistic(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number) {
  return Math.max(1, Math.min(99, value));
}

function round(value: number) {
  return Number(Number(value).toFixed(2));
}
