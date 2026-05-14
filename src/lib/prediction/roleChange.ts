import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function roleChangeFactor(input: PredictionInput): PredictionFactorOutput {
  const roleChangesA = input.rosterEventsA.filter((event) => event.oldRole && event.newRole && event.oldRole !== event.newRole);
  const roleChangesB = input.rosterEventsB.filter((event) => event.oldRole && event.newRole && event.oldRole !== event.newRole);
  const fitA = (input.chemistryA?.roleFitScore ?? 0.55) - roleChangesA.length * 0.07;
  const fitB = (input.chemistryB?.roleFitScore ?? 0.55) - roleChangesB.length * 0.07;

  return makeFactor({
    factorName: "Role Change",
    factorGroup: "roster",
    weight: input.modelWeights.roleChange,
    teamAValue: fitA,
    teamBValue: fitB,
    scale: 0.22,
    confidence: 0.58,
    explanation: "Роль после перехода сравнивается отдельно; old player stats теряют релевантность при смене роли.",
    evidence: [
      makeEvidence("role changes", "current roster", roleChangesA.length + roleChangesB.length, roleChangesA.length, roleChangesB.length, "Смена роли снижает relevance старой статистики.")
    ],
    warnings: roleChangesA.length + roleChangesB.length > 0 ? ["Role change detected: старые player stats decayed."] : []
  });
}
