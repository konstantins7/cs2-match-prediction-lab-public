import type { MapProbability, NumericWeights, TeamSynergy } from "./types";

export function weightedScientificPrediction(input: {
  teamA: string;
  teamB: string;
  teamElo: Record<string, number>;
  mapProbabilities: MapProbability[];
  synergies: TeamSynergy[];
  weights: NumericWeights;
}) {
  const weights = normalizeWeights(input.weights);
  const eloComponent = logistic(((input.teamElo[input.teamA] ?? 1500) - (input.teamElo[input.teamB] ?? 1500)) / 400) * 100;
  const mapsComponent = input.mapProbabilities.length
    ? avg(input.mapProbabilities.map((row) => row.teamAWinProbability))
    : 50;
  const synergyA = synergyScore(input.synergies.find((row) => row.teamName === input.teamA));
  const synergyB = synergyScore(input.synergies.find((row) => row.teamName === input.teamB));
  const synergyComponent = logistic((synergyA - synergyB) * 2) * 100;
  const teamAProbability = (eloComponent * weights.elo) + (mapsComponent * weights.maps) + (synergyComponent * weights.synergy);
  return {
    teamAProbability: clamp(round(teamAProbability), 1, 99),
    components: {
      elo: round(eloComponent),
      maps: round(mapsComponent),
      synergy: round(synergyComponent)
    },
    weights,
    warnings: input.mapProbabilities.length ? [] : ["No map probability rows; maps component is neutral."]
  };
}

function normalizeWeights(weights: NumericWeights): NumericWeights {
  const total = Math.max(0.0001, weights.elo + weights.maps + weights.synergy);
  return {
    elo: weights.elo / total,
    maps: weights.maps / total,
    synergy: weights.synergy / total
  };
}

function synergyScore(row?: TeamSynergy) {
  if (!row) return 0.5;
  const pairScore = row.pairCorrelations.length ? avg(row.pairCorrelations.map((pair) => Math.max(0, pair.correlation))) : 0.4;
  return (pairScore * 0.4) + (row.rosterStability * 0.4) + ((1 - Math.min(1, row.leaderEffect)) * 0.2);
}

function logistic(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Number(Number(value).toFixed(4));
}
