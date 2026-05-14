import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function leadershipFactor(input: PredictionInput): PredictionFactorOutput {
  const iglA = input.playerStatsA.find((stat) => stat.playerId === input.rosterVersionA?.iglPlayerId);
  const iglB = input.playerStatsB.find((stat) => stat.playerId === input.rosterVersionB?.iglPlayerId);
  const coachChangeA = input.rosterEventsA.filter((event) => event.eventType.toLowerCase().includes("coach")).length;
  const coachChangeB = input.rosterEventsB.filter((event) => event.eventType.toLowerCase().includes("coach")).length;
  const scoreA = (iglA ? iglA.rating * 0.28 + iglA.pressureScore * 0.35 + iglA.volatilityScore * -0.12 : 0.5) + (input.chemistryA?.coreStabilityScore ?? 0.5) * 0.25 - coachChangeA * 0.06;
  const scoreB = (iglB ? iglB.rating * 0.28 + iglB.pressureScore * 0.35 + iglB.volatilityScore * -0.12 : 0.5) + (input.chemistryB?.coreStabilityScore ?? 0.5) * 0.25 - coachChangeB * 0.06;

  return makeFactor({
    factorName: "IGL/Coach Change",
    factorGroup: "roster",
    weight: input.modelWeights.leadership,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.24,
    confidence: 0.55,
    explanation: "Leadership proxy использует IGL pressure/volatility и coach-change risk.",
    evidence: [
      makeEvidence("IGL player", "current roster", 1, input.rosterVersionA?.iglPlayerId ?? "unknown", input.rosterVersionB?.iglPlayerId ?? "unknown", "IGL fragging floor и pressure proxy важны в close rounds.")
    ]
  });
}
