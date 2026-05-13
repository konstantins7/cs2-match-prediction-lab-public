import { prisma } from "@/lib/prisma";
import { buildDataCoverage, getCoverageMeta } from "@/lib/data/dataCoverage";
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
    prisma.team.findUniqueOrThrow({ where: { id: match.teamAId }, include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } }),
    prisma.team.findUniqueOrThrow({ where: { id: match.teamBId }, include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } })
  ]);
  const weights = { ...defaultWeights, ...(await getDefaultModelWeights()), ...modelWeights };
  const scopedSampleWhere = {
    OR: [
      { source: { not: "analyst_sample" } },
      { source: "analyst_sample", matchId: match.id, isActive: true }
    ]
  };
  const scopedPlayerWhere = (teamId: string) => ({
    teamId,
    isActive: true,
    OR: [
      { sourceMode: { not: "analyst_sample" } },
      { sourceMode: "analyst_sample", matchId: match.id }
    ]
  });

  const [
    playersA,
    playersB,
    teamFormA,
    teamFormB,
    basicResultA,
    basicResultB,
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
    activeMapPool,
    opponentMatchupA,
    opponentMatchupB,
    teamStyleA,
    teamStyleB,
    dataWindows,
    sourceConflicts,
    coverageMeta
  ] = await Promise.all([
    prisma.player.findMany({ where: scopedPlayerWhere(teamA.id), orderBy: { nickname: "asc" } }),
    prisma.player.findMany({ where: scopedPlayerWhere(teamB.id), orderBy: { nickname: "asc" } }),
    prisma.teamFormSnapshot.findFirst({ where: { teamId: teamA.id }, orderBy: { createdAt: "desc" } }),
    prisma.teamFormSnapshot.findFirst({ where: { teamId: teamB.id }, orderBy: { createdAt: "desc" } }),
    prisma.teamBasicResultSnapshot.findFirst({ where: { teamId: teamA.id }, orderBy: { createdAt: "desc" } }),
    prisma.teamBasicResultSnapshot.findFirst({ where: { teamId: teamB.id }, orderBy: { createdAt: "desc" } }),
    prisma.playerStatSnapshot.findMany({ where: { teamId: teamA.id, isActive: true, ...scopedSampleWhere }, orderBy: { createdAt: "desc" } }),
    prisma.playerStatSnapshot.findMany({ where: { teamId: teamB.id, isActive: true, ...scopedSampleWhere }, orderBy: { createdAt: "desc" } }),
    prisma.teamMapStat.findMany({ where: { teamId: teamA.id, isActive: true, ...scopedSampleWhere }, orderBy: { mapName: "asc" } }),
    prisma.teamMapStat.findMany({ where: { teamId: teamB.id, isActive: true, ...scopedSampleWhere }, orderBy: { mapName: "asc" } }),
    prisma.vetoPattern.findMany({ where: { teamId: teamA.id, isActive: true, ...scopedSampleWhere }, orderBy: { mapName: "asc" } }),
    prisma.vetoPattern.findMany({ where: { teamId: teamB.id, isActive: true, ...scopedSampleWhere }, orderBy: { mapName: "asc" } }),
    prisma.headToHead.findMany({
      where: {
        AND: [
          {
            OR: [
              { teamAId: teamA.id, teamBId: teamB.id },
              { teamAId: teamB.id, teamBId: teamA.id }
            ]
          },
          { isActive: true },
          scopedSampleWhere
        ]
      },
      orderBy: { date: "desc" }
    }),
    prisma.newsItem.findMany({
      where: {
        AND: [
          {
            OR: [
              { teamId: teamA.id },
              { teamId: teamB.id },
              { player: { is: { teamId: { in: [teamA.id, teamB.id] } } } }
            ]
          },
          { isActive: true },
          scopedSampleWhere
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
    prisma.activeMapPoolVersion.findFirst({ where: { endedAt: null }, orderBy: { startedAt: "desc" } }),
    prisma.opponentMatchupProfile.findFirst({ where: { teamId: teamA.id, opponentTeamId: teamB.id }, orderBy: { createdAt: "desc" } }),
    prisma.opponentMatchupProfile.findFirst({ where: { teamId: teamB.id, opponentTeamId: teamA.id }, orderBy: { createdAt: "desc" } }),
    prisma.teamStyleSnapshot.findFirst({ where: { teamId: teamA.id }, orderBy: { createdAt: "desc" } }),
    prisma.teamStyleSnapshot.findFirst({ where: { teamId: teamB.id }, orderBy: { createdAt: "desc" } }),
    prisma.predictionDataWindow.findMany({
      where: { matchId: match.id, teamId: { in: [teamA.id, teamB.id] } },
      orderBy: [{ teamId: "asc" }, { windowType: "asc" }]
    }),
    prisma.entityMatchCandidate.findMany({
      where: {
        status: "needs_review",
        OR: [
          { matchedEntityId: teamA.id },
          { matchedEntityId: teamB.id },
          { externalName: { in: [teamA.name, teamB.name] } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    getCoverageMeta(match.id)
  ]);

  const input: PredictionInput = {
    match,
    teamA,
    teamB,
    playersA,
    playersB,
    teamFormA,
    teamFormB,
    basicResultA,
    basicResultB,
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
    activeMapPool,
    opponentMatchupA,
    opponentMatchupB,
    teamStyleA,
    teamStyleB,
    dataWindows,
    sourceConflicts
  };
  return { ...input, dataCoverage: buildDataCoverage(input, coverageMeta) };
}
