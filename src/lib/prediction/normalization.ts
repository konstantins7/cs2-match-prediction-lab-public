import type { PredictionFactorOutput } from "./types";

export function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

export function normalizeDifference(diff: number, scale: number) {
  return clamp(diff / scale, -1, 1);
}

export function sampleSizeConfidence(sampleSize: number, target = 30) {
  if (sampleSize <= 0) return 0.18;
  return round(clamp(sampleSize / (sampleSize + target * 0.45), 0.18, 0.98), 3);
}

export function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

export function factorContribution(factor: PredictionFactorOutput) {
  return factor.impact * factor.weight * factor.confidence;
}

export function probabilityFromRawScore(rawScore: number) {
  const teamAProbability = clamp(Math.round(50 + rawScore), 1, 99);
  return {
    teamAProbability,
    teamBProbability: 100 - teamAProbability
  };
}

export function daysBetween(a: Date | string, b: Date | string) {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  return Math.abs(left - right) / (1000 * 60 * 60 * 24);
}

export function recencyScore(date: Date | string, now = new Date("2026-05-12T08:00:00.000Z")) {
  const days = daysBetween(date, now);
  return round(clamp(Math.exp(-days / 120), 0.18, 1), 3);
}
