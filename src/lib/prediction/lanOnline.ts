import type { PredictionFactorOutput, PredictionInput } from "./types";
import { averageBy, makeEvidence, makeFactor } from "./utils";

export function lanOnlineFactor(input: PredictionInput): PredictionFactorOutput {
  const teamA = input.match.isLan ? input.teamFormA?.lanWinRate ?? 0.5 : input.teamFormA?.onlineWinRate ?? 0.5;
  const teamB = input.match.isLan ? input.teamFormB?.lanWinRate ?? 0.5 : input.teamFormB?.onlineWinRate ?? 0.5;
  const playerA = input.match.isLan ? averageBy(input.playerStatsA, (s) => s.lanRating) : averageBy(input.playerStatsA, (s) => s.onlineRating);
  const playerB = input.match.isLan ? averageBy(input.playerStatsB, (s) => s.lanRating) : averageBy(input.playerStatsB, (s) => s.onlineRating);
  const normalizedA = teamA * 0.65 + (playerA / 1.2) * 0.35;
  const normalizedB = teamB * 0.65 + (playerB / 1.2) * 0.35;

  return makeFactor({
    factorName: "LAN/Online",
    factorGroup: "context",
    weight: input.modelWeights.lanOnline,
    teamAValue: normalizedA,
    teamBValue: normalizedB,
    scale: 0.25,
    confidence: 0.64,
    explanation: input.match.isLan ? "LAN split учитывает team LAN winrate и player LAN rating." : "Online split учитывает team online winrate и player online rating.",
    evidence: [
      makeEvidence(input.match.isLan ? "lanWinRate" : "onlineWinRate", input.match.isLan ? "LAN" : "online", 1, teamA, teamB, "Контекст матча меняет релевантность split.")
    ]
  });
}
