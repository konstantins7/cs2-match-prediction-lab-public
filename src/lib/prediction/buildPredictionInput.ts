import { prisma } from "@/lib/prisma";
import { buildDataCoverage, getCoverageMeta } from "@/lib/data/dataCoverage";
import type { ModelWeights, PredictionInput } from "./types";
import { defaultWeights, parseWeights } from "./utils";

export async function getDefaultModelWeights(): Promise<ModelWeights> {
  const preset = await prisma.modelWeightPreset.findFirst({ where: { isDefault: true } });
  return parseWeights(preset?.weightsJson);
}

function faceitContextPassesCutoff(rawJson: string, cutoff: Date) {
  try {
    const raw = JSON.parse(rawJson) as Record<string, unknown>;
    const payload = raw.payload && typeof raw.payload === "object" ? raw.payload as Record<string, unknown> : {};
    const value = raw.sourceDate ?? raw.date ?? raw.updatedAt ?? raw.updated_at ?? payload.sourceDate ?? payload.date ?? payload.updatedAt ?? payload.updated_at;
    if (!value) return true;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return true;
    return parsed.getTime() <= cutoff.getTime();
  } catch {
    return true;
  }
}

export async function buildPredictionInput(matchId: string, modelWeights?: Partial<ModelWeights>): Promise<PredictionInput> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new Error(`Match not found: ${matchId}`);

  const [teamA, teamB] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: match.teamAId }, include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } }),
    prisma.team.findUniqueOrThrow({ where: { id: match.teamBId }, include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } })
  ]);
  const weights = { ...defaultWeights, ...(await getDefaultModelWeights()), ...modelWeights };
  const cutoff = new Date(match.startTime);
  const preMatchRoles = ["pre_match_evidence", "historical_team_form"];
  const safeRealEvidenceWhere = (source: "manual_enrichment" | "parsed_demo" | "grid") => ({
    source,
    matchId: match.id,
    isActive: true,
    dataLeakageCheckPassed: true,
    dataRole: { in: preMatchRoles },
    sourceDate: { lte: cutoff }
  });
  const realEvidenceCounts = await Promise.all([
    prisma.playerStatSnapshot.count({ where: safeRealEvidenceWhere("manual_enrichment") }),
    prisma.teamMapStat.count({ where: safeRealEvidenceWhere("manual_enrichment") }),
    prisma.vetoPattern.count({ where: safeRealEvidenceWhere("manual_enrichment") }),
    prisma.headToHead.count({ where: safeRealEvidenceWhere("manual_enrichment") }),
    prisma.newsItem.count({ where: safeRealEvidenceWhere("manual_enrichment") }),
    prisma.player.count({ where: { sourceMode: "manual_real", matchId: match.id, isActive: true } }),
    prisma.playerStatSnapshot.count({ where: safeRealEvidenceWhere("parsed_demo") }),
    prisma.teamMapStat.count({ where: safeRealEvidenceWhere("parsed_demo") }),
    prisma.vetoPattern.count({ where: safeRealEvidenceWhere("parsed_demo") }),
    prisma.teamFormSnapshot.count({ where: safeRealEvidenceWhere("parsed_demo") }),
    prisma.player.count({ where: { sourceMode: "parsed_demo", matchId: match.id, isActive: true } }),
    prisma.playerStatSnapshot.count({ where: safeRealEvidenceWhere("grid") }),
    prisma.teamMapStat.count({ where: safeRealEvidenceWhere("grid") }),
    prisma.vetoPattern.count({ where: safeRealEvidenceWhere("grid") }),
    prisma.teamFormSnapshot.count({ where: safeRealEvidenceWhere("grid") })
  ]);
  const hasRealEvidenceForMatch = realEvidenceCounts.some((count) => count > 0);
  const scopedForecastWhere = hasRealEvidenceForMatch
    ? {
        OR: [
          { source: { notIn: ["analyst_sample", "manual_enrichment", "parsed_demo", "grid"] } },
          safeRealEvidenceWhere("manual_enrichment"),
          safeRealEvidenceWhere("parsed_demo"),
          safeRealEvidenceWhere("grid")
        ]
      }
    : {
        OR: [
          { source: { notIn: ["analyst_sample", "manual_enrichment", "parsed_demo", "grid"] } },
          safeRealEvidenceWhere("manual_enrichment"),
          safeRealEvidenceWhere("parsed_demo"),
          safeRealEvidenceWhere("grid"),
          { source: "analyst_sample", matchId: match.id, isActive: true }
        ]
      };
  const scopedPlayerWhere = (teamId: string) => ({
    teamId,
    isActive: true,
    OR: hasRealEvidenceForMatch
      ? [
          { sourceMode: { notIn: ["analyst_sample", "manual_real", "parsed_demo"] } },
          { sourceMode: "manual_real", matchId: match.id },
          { sourceMode: "parsed_demo", matchId: match.id }
        ]
      : [
          { sourceMode: { notIn: ["analyst_sample", "manual_real", "parsed_demo"] } },
          { sourceMode: "manual_real", matchId: match.id },
          { sourceMode: "parsed_demo", matchId: match.id },
          { sourceMode: "analyst_sample", matchId: match.id }
        ]
  });
  const teamFormWhere = (teamId: string) => ({
    teamId,
    isActive: true,
    OR: hasRealEvidenceForMatch
      ? [
          { source: { notIn: ["analyst_sample", "manual_enrichment", "parsed_demo", "grid"] } },
          safeRealEvidenceWhere("manual_enrichment"),
          safeRealEvidenceWhere("parsed_demo"),
          safeRealEvidenceWhere("grid")
        ]
      : [
          { source: { notIn: ["analyst_sample", "manual_enrichment", "parsed_demo", "grid"] } },
          safeRealEvidenceWhere("manual_enrichment"),
          safeRealEvidenceWhere("parsed_demo"),
          safeRealEvidenceWhere("grid"),
          { source: "analyst_sample", matchId: match.id, isActive: true }
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
    prisma.teamFormSnapshot.findFirst({ where: teamFormWhere(teamA.id), orderBy: { createdAt: "desc" } }),
    prisma.teamFormSnapshot.findFirst({ where: teamFormWhere(teamB.id), orderBy: { createdAt: "desc" } }),
    prisma.teamBasicResultSnapshot.findFirst({ where: { teamId: teamA.id }, orderBy: { createdAt: "desc" } }),
    prisma.teamBasicResultSnapshot.findFirst({ where: { teamId: teamB.id }, orderBy: { createdAt: "desc" } }),
    prisma.playerStatSnapshot.findMany({ where: { teamId: teamA.id, isActive: true, ...scopedForecastWhere }, orderBy: { createdAt: "desc" } }),
    prisma.playerStatSnapshot.findMany({ where: { teamId: teamB.id, isActive: true, ...scopedForecastWhere }, orderBy: { createdAt: "desc" } }),
    prisma.teamMapStat.findMany({ where: { teamId: teamA.id, isActive: true, ...scopedForecastWhere }, orderBy: { mapName: "asc" } }),
    prisma.teamMapStat.findMany({ where: { teamId: teamB.id, isActive: true, ...scopedForecastWhere }, orderBy: { mapName: "asc" } }),
    prisma.vetoPattern.findMany({ where: { teamId: teamA.id, isActive: true, ...scopedForecastWhere }, orderBy: { mapName: "asc" } }),
    prisma.vetoPattern.findMany({ where: { teamId: teamB.id, isActive: true, ...scopedForecastWhere }, orderBy: { mapName: "asc" } }),
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
          scopedForecastWhere
        ]
      },
      orderBy: { date: "desc" }
    }),
    prisma.newsItem.findMany({
      where: {
        AND: [
          {
            OR: [
              { matchId: match.id },
              { teamId: teamA.id },
              { teamId: teamB.id },
              { player: { is: { teamId: { in: [teamA.id, teamB.id] } } } }
            ]
          },
          { isActive: true },
          scopedForecastWhere
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

  const sourceRecordIds = [
    ...playersA,
    ...playersB,
    ...playerStatsA,
    ...playerStatsB,
    ...mapStatsA,
    ...mapStatsB,
    ...vetoPatternsA,
    ...vetoPatternsB,
    ...h2h,
    ...news
  ]
    .map((record) => record.sourceRecordId)
    .filter((id): id is string => Boolean(id));
  const manualSourceRecords = await prisma.externalSourceRecord.findMany({
        where: {
          OR: [
            ...(sourceRecordIds.length ? [{ id: { in: [...new Set(sourceRecordIds)] } }] : []),
            { entityId: match.id, entityType: { startsWith: "analyst_sample_" } },
            { entityId: match.id, entityType: { startsWith: "manual_real_" } }
          ]
        },
        select: { id: true, source: true, entityType: true, entityId: true, rawJson: true, fetchedAt: true, sourceConfidence: true }
      });
  const faceitContextRecordsRaw = await prisma.externalSourceRecord.findMany({
    where: {
      source: "faceit",
      OR: [
        { externalId: { startsWith: `match:${match.id}:` } },
        { rawJson: { contains: `"matchId":"${match.id}"` } }
      ]
    },
    select: { id: true, source: true, entityType: true, entityId: true, rawJson: true, fetchedAt: true, sourceConfidence: true },
    orderBy: { fetchedAt: "desc" }
  });
  const faceitContextRecords = faceitContextRecordsRaw.filter((record) => faceitContextPassesCutoff(record.rawJson, cutoff));

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
    sourceConflicts,
    manualSourceRecords,
    faceitContextRecords
  };
  return { ...input, dataCoverage: buildDataCoverage(input, coverageMeta) };
}
