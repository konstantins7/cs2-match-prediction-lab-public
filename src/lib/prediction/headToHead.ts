import type { PredictionFactorOutput, PredictionInput } from "./types";
import { recencyScore, weightedAverage } from "./normalization";
import { makeEvidence, makeFactor } from "./utils";

export function headToHeadFactor(input: PredictionInput): PredictionFactorOutput {
  const relevant = input.h2h.filter(
    (entry) =>
      (entry.teamAId === input.teamA.id && entry.teamBId === input.teamB.id) ||
      (entry.teamAId === input.teamB.id && entry.teamBId === input.teamA.id)
  );
  const signed = relevant.map((entry) => {
    const winnerForA = entry.winnerTeamId === input.teamA.id ? 1 : entry.winnerTeamId === input.teamB.id ? -1 : 0;
    const rosterSimilarity = (entry.teamARosterSimilarity + entry.teamBRosterSimilarity) / 2;
    return {
      value: winnerForA * entry.relevanceScore * rosterSimilarity,
      weight: recencyScore(entry.date) * rosterSimilarity
    };
  });
  const score = weightedAverage(signed);

  return makeFactor({
    factorName: "Head-to-Head",
    factorGroup: "history",
    weight: input.modelWeights.headToHead,
    teamAValue: 0.5 + score / 2,
    teamBValue: 0.5 - score / 2,
    scale: 0.5,
    confidence: Math.min(0.72, 0.22 + relevant.length * 0.12),
    explanation: "H2H не перебивает текущую форму и снижается при старых матчах или изменившихся составах.",
    evidence: [
      makeEvidence("relevant H2H entries", "historical", relevant.length, relevant.length, relevant.length, "Старые H2H и низкая roster similarity имеют малый вес.")
    ],
    warnings: relevant.length === 0 ? ["Нет релевантных H2H матчей между текущими составами."] : []
  });
}
