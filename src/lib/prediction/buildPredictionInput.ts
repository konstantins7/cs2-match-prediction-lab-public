import { prisma } from "@/lib/prisma";
import type { ModelWeights, PredictionInput } from "./types";
import { defaultWeights, parseWeights } from "./utils";

export async function getDefaultModelWeights(): Promise<ModelWeights> {
  const preset = await prisma.modelWeightPreset.findFirst({ where: { isDefault: true } });
  return parseWeights(preset?.weightsJson);
}

export async function buildPredictionInput(matchId: string, modelWeights?: Partial<ModelWeights>): Promise<PredictionInput> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new Error(`Match not found: ${matchId}`);

  const [teamA, teamB] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: match.teamAId } }),
    prisma.team.findUniqueOrThrow({ where: { id: match.teamBId } })
  ]);
  const weights = { ...defaultWeights, ...(await getDefaultModelWeights()), ...modelWeights };

  const [
    playersA,
    playersB,
    teamFormA,
    teamFormB,
    playerStatsA,
    playerStatsB,
    mapStatsA,
    mapStatsB,
    vetoPatternsA,
    vetoPatternsB,
    h2h,
    news,
    gameMetaVersions,
    rosterVersionA,
    rosterVersionB,
    chemistryA,
    chemistryB,
    rosterEventsA,
    rosterEventsB,
    playerHistoriesA,
    playerHistoriesB,
    roleSnapshotsA,
    roleSnapshotsB,
    mapVersions,
    activeMapPool
  ] = await Promise.all([
    prisma.player.findMany({ where: { teamId: teamA.id, isActive: true }, orderBy: { nickname: "asc" } }),
    prisma.player.findMany({ where: { teamId: teamB.id, isActive: true }, orderBy: { nickname: "asc" } }),
    prisma.teamFormSnapshot.findFirst({ where: { teamId: teamA.id }, orderBy: { createdAt: "desc" } }),
    prisma.teamFormSnapshot.findFirst({ where: { teamId: teamB.id }, orderBy: { createdAt: "desc" } }),
    prisma.playerStatSnapshot.findMany({ where: { teamId: teamA.id }, orderBy: { createdAt: "desc" } }),
    prisma.playerStatSnapshot.findMany({ where: { teamId: teamB.id }, orderBy: { createdAt: "desc" } }),
    prisma.teamMapStat.findMany({ where: { teamId: teamA.id }, orderBy: { mapName: "asc" } }),
    prisma.teamMapStat.findMany({ where: { teamId: teamB.id }, orderBy: { mapName: "asc" } }),
    prisma.vetoPattern.findMany({ where: { teamId: teamA.id }, orderBy: { mapName: "asc" } }),
    prisma.vetoPattern.findMany({ where: { teamId: teamB.id }, orderBy: { mapName: "asc" } }),
    prisma.headToHead.findMany({
      where: {
        OR: [
          { teamAId: teamA.id, teamBId: teamB.id },
          { teamAId: teamB.id, teamBId: teamA.id }
        ]
      },
      orderBy: { date: "desc" }
    }),
    prisma.newsItem.findMany({
      where: {
        OR: [
          { teamId: teamA.id },
          { teamId: teamB.id },
          { player: { is: { teamId: { in: [teamA.id, teamB.id] } } } }
        ]
      },
      orderBy: { publishedAt: "desc" }
    }),
    prisma.gameMetaVersion.findMany({ orderBy: { patchDate: "desc" } }),
    prisma.teamRosterVersion.findFirst({ where: { teamId: teamA.id, endedAt: null }, orderBy: { startedAt: "desc" } }),
    prisma.teamRosterVersion.findFirst({ where: { teamId: teamB.id, endedAt: null }, orderBy: { startedAt: "desc" } }),
    prisma.teamChemistrySnapshot.findFirst({ where: { teamId: teamA.id }, orderBy: { date: "desc" } }),
    prisma.teamChemistrySnapshot.findFirst({ where: { teamId: teamB.id }, orderBy: { date: "desc" } }),
    prisma.rosterEvent.findMany({ where: { teamId: teamA.id }, orderBy: { eventDate: "desc" } }),
    prisma.rosterEvent.findMany({ where: { teamId: teamB.id }, orderBy: { eventDate: "desc" } }),
    prisma.playerTeamHistory.findMany({ where: { teamId: teamA.id } }),
    prisma.playerTeamHistory.findMany({ where: { teamId: teamB.id } }),
    prisma.playerRoleSnapshot.findMany({ where: { teamId: teamA.id }, orderBy: { date: "desc" } }),
    prisma.playerRoleSnapshot.findMany({ where: { teamId: teamB.id }, orderBy: { date: "desc" } }),
    prisma.mapVersion.findMany({ orderBy: { startedAt: "desc" } }),
    prisma.activeMapPoolVersion.findFirst({ where: { endedAt: null }, orderBy: { startedAt: "desc" } })
  ]);

  return {
    match,
    teamA,
    teamB,
    playersA,
    playersB,
    teamFormA,
    teamFormB,
    playerStatsA,
    playerStatsB,
    mapStatsA,
    mapStatsB,
    vetoPatternsA,
    vetoPatternsB,
    h2h,
    news,
    modelWeights: weights,
    gameMetaVersions,
    rosterVersionA,
    rosterVersionB,
    chemistryA,
    chemistryB,
    rosterEventsA,
    rosterEventsB,
    playerHistoriesA,
    playerHistoriesB,
    roleSnapshotsA,
    roleSnapshotsB,
    mapVersions,
    activeMapPool
  };
}
