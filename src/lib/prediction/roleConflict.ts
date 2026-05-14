import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function roleConflictFactor(input: PredictionInput): PredictionFactorOutput {
  const starDependencyA = input.playerStatsA.reduce((sum, stat) => sum + stat.starDependency, 0);
  const starDependencyB = input.playerStatsB.reduce((sum, stat) => sum + stat.starDependency, 0);
  const roleFitA = input.chemistryA?.roleFitScore ?? 0.55;
  const roleFitB = input.chemistryB?.roleFitScore ?? 0.55;
  const conflictA = Math.max(0, starDependencyA / Math.max(input.playerStatsA.length, 1) - roleFitA);
  const conflictB = Math.max(0, starDependencyB / Math.max(input.playerStatsB.length, 1) - roleFitB);

  return makeFactor({
    factorName: "Role Conflict",
    factorGroup: "roster",
    weight: input.modelWeights.roleConflict,
    teamAValue: 1 - conflictA,
    teamBValue: 1 - conflictB,
    scale: 0.22,
    confidence: 0.56,
    explanation: "Role conflict снижает chemistry, если star dependency выше role fit и роли конкурируют за одни зоны.",
    evidence: [
      makeEvidence("role conflict proxy", "current roster", input.playerStatsA.length + input.playerStatsB.length, conflictA.toFixed(2), conflictB.toFixed(2), "Высокий конфликт ролей снижает прогнозную устойчивость.")
    ],
    warnings: conflictA > 0.15 || conflictB > 0.15 ? ["Role conflict proxy заметен: risk повышен."] : []
  });
}
