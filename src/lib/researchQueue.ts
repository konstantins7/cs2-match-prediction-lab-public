import { prisma } from "./prisma";
import { calculatePrediction } from "./prediction/calculatePrediction";
import { buildPredictionInput } from "./prediction/buildPredictionInput";
import { readinessRank } from "./prediction/readiness";
import {
  buildResearchQueueForMatch,
  knownTeamMatchingIssues,
  summarizeResearchQueue,
  type ResearchQueueRow,
  type ResearchTask
} from "./researchQueueCore";

export { buildResearchQueueForMatch, knownTeamMatchingIssues, summarizeResearchQueue };
export type { ResearchQueueRow, ResearchTask } from "./researchQueueCore";

export async function refreshResearchPack(matchId: string) {
  const input = await buildPredictionInput(matchId);
  const prediction = calculatePrediction(input);
  const tasks = buildResearchQueueForMatch(input, prediction.readiness);
  return prisma.researchPack.upsert({
    where: { matchId },
    create: {
      matchId,
      readinessLevel: prediction.readiness.level,
      checklistJson: JSON.stringify(tasks)
    },
    update: {
      readinessLevel: prediction.readiness.level,
      checklistJson: JSON.stringify(tasks)
    }
  });
}

export async function getResearchQueueRows(limit = 80): Promise<ResearchQueueRow[]> {
  const matches = await prisma.match.findMany({
    where: { status: "upcoming", isOfficial: true },
    select: {
      id: true,
      eventName: true,
      startTime: true,
      sourceMode: true,
      teamA: { select: { name: true } },
      teamB: { select: { name: true } },
      researchPacks: { orderBy: { updatedAt: "desc" }, take: 1 }
    },
    orderBy: { startTime: "asc" },
    take: limit
  });

  const rows: ResearchQueueRow[] = [];
  for (const match of matches) {
    const input = await buildPredictionInput(match.id);
    const prediction = calculatePrediction(input);
    if (readinessRank(prediction.readiness.level) >= 3) continue;
    const tasks: ResearchTask[] = buildResearchQueueForMatch(input, prediction.readiness);
    const nextTask = tasks.find((task) => task.status !== "done" && task.status !== "skipped");
    rows.push({
      matchId: match.id,
      matchLabel: `${match.teamA.name} vs ${match.teamB.name}`,
      teamAName: match.teamA.name,
      teamBName: match.teamB.name,
      eventName: match.eventName,
      startTime: match.startTime,
      readinessLevel: prediction.readiness.level,
      readinessLabel: prediction.readiness.label,
      dataQualityScore: prediction.dataQualityScore,
      confidenceScore: prediction.confidenceScore,
      sourceMode: match.sourceMode,
      missingCriticalData: prediction.readiness.missingCriticalData,
      nextBestAction: nextTask?.task ?? "Review manually",
      tasks,
      packId: match.researchPacks[0]?.id
    });
  }
  return rows;
}
