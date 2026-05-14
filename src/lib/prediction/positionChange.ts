import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function positionChangeFactor(input: PredictionInput): PredictionFactorOutput {
  const changedA = input.rosterEventsA.filter((event) => event.oldPositionsJson && event.newPositionsJson && event.oldPositionsJson !== event.newPositionsJson).length;
  const changedB = input.rosterEventsB.filter((event) => event.oldPositionsJson && event.newPositionsJson && event.oldPositionsJson !== event.newPositionsJson).length;
  const scoreA = (input.chemistryA?.roleFitScore ?? 0.55) - changedA * 0.06;
  const scoreB = (input.chemistryB?.roleFitScore ?? 0.55) - changedB * 0.06;

  return makeFactor({
    factorName: "Map Position Change",
    factorGroup: "roster",
    weight: input.modelWeights.positionChange,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.2,
    confidence: 0.56,
    explanation: "Смена позиций на карте снижает вес старой map-specific статистики игрока.",
    evidence: [
      makeEvidence("position changes", "current roster", changedA + changedB, changedA, changedB, "Old position data decays after position changes.")
    ],
    warnings: changedA + changedB > 0 ? ["Map-position change повышает uncertainty на отдельных картах."] : []
  });
}
