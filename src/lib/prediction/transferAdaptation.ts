import type { PredictionFactorOutput, PredictionInput, RosterEventEntity } from "./types";
import { daysBetween } from "./normalization";
import { makeEvidence, makeFactor } from "./utils";

function adaptationPenalty(events: RosterEventEntity[]) {
  return events
    .filter((event) => event.eventType.toLowerCase().includes("signing") || event.eventType.toLowerCase().includes("stand-in"))
    .reduce((sum, event) => {
      const age = daysBetween(event.eventDate, "2026-05-12T08:00:00.000Z");
      return sum + Math.max(0, (45 - age) / 45) * Math.abs(event.expectedImpact) * event.confidence;
    }, 0);
}

export function transferAdaptationFactor(input: PredictionInput): PredictionFactorOutput {
  const penaltyA = adaptationPenalty(input.rosterEventsA);
  const penaltyB = adaptationPenalty(input.rosterEventsB);
  const scoreA = (input.chemistryA?.adaptationScore ?? 0.55) - penaltyA;
  const scoreB = (input.chemistryB?.adaptationScore ?? 0.55) - penaltyB;

  return makeFactor({
    factorName: "Transfer Adaptation",
    factorGroup: "roster",
    weight: input.modelWeights.transferAdaptation,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.26,
    confidence: 0.62,
    explanation: "Недавний переход или stand-in повышает uncertainty, пока игрок не адаптировался.",
    evidence: [
      makeEvidence("recent transfer events", "last_45_days", input.rosterEventsA.length + input.rosterEventsB.length, input.rosterEventsA.length, input.rosterEventsB.length, "Новые игроки снижают adaptation score.")
    ],
    warnings: penaltyA > 0.05 || penaltyB > 0.05 ? ["Недавний roster event увеличивает uncertainty."] : []
  });
}
