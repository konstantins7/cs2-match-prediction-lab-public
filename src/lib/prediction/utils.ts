import type {
  Evidence,
  ModelWeights,
  PredictionFactorOutput,
  PredictionInput,
  TeamMapStatEntity
} from "./types";
import { clamp, normalizeDifference, round, sampleSizeConfidence, weightedAverage } from "./normalization";

export const defaultWeights: ModelWeights = {
  teamStrength: 1,
  recentForm: 1.05,
  playerForm: 1.18,
  kdTrend: 1.08,
  mapPool: 1.22,
  veto: 1.18,
  overtime: 0.86,
  closing: 0.98,
  comeback: 0.9,
  economy: 0.96,
  headToHead: 0.55,
  newsImpact: 0.72,
  fatigue: 0.75,
  lanOnline: 0.72,
  format: 0.6,
  dataQuality: 0.7,
  metaShift: 0.62,
  dataRelevance: 0.86,
  transferAdaptation: 0.78,
  communication: 0.64,
  chemistry: 0.9,
  roleChange: 0.72,
  positionChange: 0.68,
  playerSystemFit: 0.82,
  leadership: 0.7,
  honeymoon: 0.55,
  coreStability: 0.82,
  roleConflict: 0.74
};

export function parseWeights(value?: string | null): ModelWeights {
  if (!value) return defaultWeights;
  try {
    return { ...defaultWeights, ...(JSON.parse(value) as Partial<ModelWeights>) };
  } catch {
    return defaultWeights;
  }
}

export function makeEvidence(
  metric: string,
  period: string,
  sampleSize: number,
  teamAValue: number | string,
  teamBValue: number | string,
  note: string,
  source = "mock_seed"
): Evidence {
  return { metric, period, sampleSize, teamAValue, teamBValue, source, note };
}

export function makeFactor(params: {
  factorName: string;
  factorGroup: string;
  weight: number;
  teamAValue: number;
  teamBValue: number;
  scale?: number;
  impactScale?: number;
  confidence: number;
  explanation: string;
  evidence?: Evidence[];
  warnings?: string[];
}): PredictionFactorOutput {
  const rawDifference = params.teamAValue - params.teamBValue;
  const normalizedDifference = normalizeDifference(rawDifference, params.scale ?? 1);
  return {
    factorName: params.factorName,
    factorGroup: params.factorGroup,
    teamAValue: round(params.teamAValue, 3),
    teamBValue: round(params.teamBValue, 3),
    rawDifference: round(rawDifference, 3),
    normalizedDifference: round(normalizedDifference, 3),
    weight: round(params.weight, 3),
    impact: round(clamp(normalizedDifference * (params.impactScale ?? 10), -10, 10), 3),
    confidence: round(clamp(params.confidence, 0, 1), 3),
    explanation: params.explanation,
    evidence: params.evidence ?? [],
    warnings: params.warnings ?? []
  };
}

export function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function averageBy<T>(items: T[], selector: (item: T) => number) {
  if (items.length === 0) return 0;
  return average(items.map(selector));
}

export function topBy<T>(items: T[], selector: (item: T) => number, count = 1) {
  return [...items].sort((a, b) => selector(b) - selector(a)).slice(0, count);
}

export function mapByName(stats: TeamMapStatEntity[]) {
  return new Map(stats.map((stat) => [stat.mapName, stat]));
}

export function activeMaps(input: PredictionInput) {
  if (!input.activeMapPool) return [...new Set([...input.mapStatsA, ...input.mapStatsB].map((stat) => stat.mapName))];
  try {
    const parsed = JSON.parse(input.activeMapPool.mapsJson) as string[];
    return parsed.length > 0 ? parsed : [];
  } catch {
    return [];
  }
}

export function mapPoolScore(stats: TeamMapStatEntity[]) {
  if (stats.length === 0) return { score: 0, confidence: 0.18, sample: 0 };
  const sample = stats.reduce((sum, stat) => sum + stat.mapsPlayed, 0);
  const score = weightedAverage(
    stats.map((stat) => ({
      value:
        stat.winRate * 0.45 +
        stat.ctRoundWinRate * 0.12 +
        stat.tRoundWinRate * 0.12 +
        stat.pistolWinRate * 0.08 +
        stat.overtimeWinRate * 0.06 +
        stat.closingScore * 0.08 +
        (stat.recentTrend + 0.2) * 0.09,
      weight: sampleSizeConfidence(stat.mapsPlayed, 24)
    }))
  );
  return { score, confidence: sampleSizeConfidence(sample, 140), sample };
}

export function missingWarnings(label: string, hasData: boolean) {
  return hasData ? [] : [`Недостаточно данных для блока ${label}; confidence снижен.`];
}
