import { prisma } from "@/lib/prisma";
import { buildPredictionInput } from "@/lib/prediction/buildPredictionInput";
import { calculateNewsImpact, type NewsTeamImpact } from "./newsImpact";

function json(value: unknown) {
  return JSON.stringify(value);
}

async function saveTeamSnapshot(matchId: string, impact: NewsTeamImpact) {
  return prisma.newsImpactSnapshot.create({
    data: {
      matchId,
      teamId: impact.teamId,
      newsItemIdsJson: json(impact.itemIds),
      totalImpact: impact.totalImpact,
      totalRisk: impact.totalRisk,
      confirmedImpact: impact.confirmedImpact,
      rumorImpact: impact.rumorImpact,
      confidence: impact.confidence,
      warningsJson: json(impact.warnings)
    }
  });
}

export async function saveNewsImpactSnapshot(matchId: string) {
  const input = await buildPredictionInput(matchId);
  const summary = calculateNewsImpact(input);
  const [teamA, teamB] = await Promise.all([
    saveTeamSnapshot(matchId, summary.teamA),
    saveTeamSnapshot(matchId, summary.teamB)
  ]);
  return { teamA, teamB, summary };
}

export async function rebuildNewsImpactSnapshots(limit = 120) {
  const matches = await prisma.match.findMany({
    where: { status: "upcoming", sourceMode: { not: "analyst_sample" } },
    select: { id: true },
    orderBy: { startTime: "asc" },
    take: limit
  });
  let created = 0;
  for (const match of matches) {
    await saveNewsImpactSnapshot(match.id);
    created += 2;
  }
  return created;
}
