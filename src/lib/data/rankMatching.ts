import { aliasesForTeamName } from "@/lib/config/teamAliases";
import { normalizeEntityName, scoreNameSimilarity } from "@/lib/sources/entityMatcher";
import { prisma } from "@/lib/prisma";

function rankCategory(rank: number) {
  if (rank <= 10) return "top_10";
  if (rank <= 20) return "top_20";
  if (rank <= 30) return "top_30";
  if (rank <= 50) return "top_50";
  if (rank <= 100) return "top_100";
  return "unranked";
}

function teamTopRankCategory(rank: number) {
  if (rank <= 10) return "top-10";
  if (rank <= 20) return "top-20";
  if (rank <= 50) return "top-50";
  if (rank <= 100) return "top-100";
  return "unranked";
}

function rawRecord(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function rankingDate(raw: Record<string, unknown>) {
  const sourceText = String(raw.sourceFile ?? raw.sourceUrl ?? "");
  const match = sourceText.match(/(20\d{2})[_-](\d{2})[_-](\d{2})/);
  if (match) return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return new Date();
}

function candidateScore(teamName: string, rankingName: string) {
  const direct = scoreNameSimilarity(teamName, rankingName);
  const teamAliasScore = Math.max(0, ...aliasesForTeamName(teamName).map((alias) => scoreNameSimilarity(alias, rankingName)));
  const rankingAliasScore = Math.max(0, ...aliasesForTeamName(rankingName).map((alias) => scoreNameSimilarity(teamName, alias)));
  return Math.max(direct, teamAliasScore, rankingAliasScore);
}

export async function getRankMatchingCandidates(limit = 40) {
  const [matches, records, rejected] = await Promise.all([
    prisma.match.findMany({
      where: { sourceMode: { not: "demo" } },
      select: {
        teamA: { select: { id: true, name: true, valveRank: true, hltvRank: true, rankSnapshots: { take: 1 } } },
        teamB: { select: { id: true, name: true, valveRank: true, hltvRank: true, rankSnapshots: { take: 1 } } }
      },
      take: 300
    }),
    prisma.externalSourceRecord.findMany({ where: { source: "valve-rankings", entityType: "valve_ranking" }, take: 200 }),
    prisma.entityMatchCandidate.findMany({ where: { source: "valve-rankings", entityType: "team", status: "rejected" } })
  ]);
  const rejectedPairs = new Set(rejected.map((row) => `${row.matchedEntityId ?? ""}:${row.externalId}`));
  const teams = new Map<string, { id: string; name: string; valveRank: number | null; hltvRank: number | null; rankSnapshots: unknown[] }>();
  matches.forEach((match) => {
    teams.set(match.teamA.id, match.teamA);
    teams.set(match.teamB.id, match.teamB);
  });
  const unranked = [...teams.values()].filter((team) => !team.valveRank && !team.hltvRank && team.rankSnapshots.length === 0);
  const rankingRows = records.map((record) => ({ record, raw: rawRecord(record.rawJson) }));

  return unranked
    .map((team) => {
      const best = rankingRows
        .map(({ record, raw }) => {
          const name = String(raw.teamName ?? raw.name ?? "");
          const confidence = candidateScore(team.name, name);
          return {
            teamId: team.id,
            teamName: team.name,
            normalizedTeamName: normalizeEntityName(team.name),
            externalId: record.externalId,
            valveTeamName: name,
            normalizedValveName: normalizeEntityName(name),
            rank: Number(raw.rank),
            points: Number(raw.points),
            region: typeof raw.region === "string" ? raw.region : null,
            confidence,
            sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : null
          };
        })
        .filter((candidate) => candidate.valveTeamName && !rejectedPairs.has(`${team.id}:${candidate.externalId}`))
        .sort((a, b) => b.confidence - a.confidence)[0];
      return best;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate) && candidate.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

export async function confirmRankMatch(teamId: string, externalId: string) {
  const record = await prisma.externalSourceRecord.findUnique({
    where: { source_entityType_externalId: { source: "valve-rankings", entityType: "valve_ranking", externalId } }
  });
  if (!record) throw new Error("Valve ranking record not found.");
  const raw = rawRecord(record.rawJson);
  const rank = Number(raw.rank);
  const teamName = String(raw.teamName ?? raw.name ?? externalId);
  if (!Number.isFinite(rank)) throw new Error("Valve ranking record has no numeric rank.");
  await prisma.entityAlias.upsert({
    where: { entityType_source_externalId: { entityType: "team", source: "valve-rankings", externalId } },
    create: { entityType: "team", entityId: teamId, source: "valve-rankings", externalId, alias: teamName, confidence: 0.96 },
    update: { entityId: teamId, alias: teamName, confidence: 0.96 }
  });
  const date = rankingDate(raw);
  await prisma.teamRankSnapshot.upsert({
    where: { id: `rank_valve_rankings_${teamId}_${date.toISOString().slice(0, 10)}_${rank}`.replace(/[^a-zA-Z0-9_-]/g, "_") },
    create: {
      id: `rank_valve_rankings_${teamId}_${date.toISOString().slice(0, 10)}_${rank}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
      teamId,
      source: "valve_rankings",
      rank,
      points: Number.isFinite(Number(raw.points)) ? Number(raw.points) : null,
      region: typeof raw.region === "string" ? raw.region : null,
      rankingDate: date,
      rankCategory: rankCategory(rank),
      confidence: 0.96,
      sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : null
    },
    update: {
      rank,
      rankCategory: rankCategory(rank),
      confidence: 0.96
    }
  });
  await prisma.team.update({
    where: { id: teamId },
    data: {
      valveRank: rank,
      internalElo: Number.isFinite(Number(raw.points)) ? Number(raw.points) : undefined,
      topRankCategory: teamTopRankCategory(rank),
      sourceConfidence: 0.96,
      needsReview: false
    }
  });
  await prisma.entityMatchCandidate.create({
    data: {
      source: "valve-rankings",
      entityType: "team",
      externalId,
      externalName: teamName,
      matchedEntityId: teamId,
      confidence: 0.96,
      status: "matched",
      rawJson: record.rawJson
    }
  });
  return { teamId, externalId, rank };
}

export async function rejectRankMatch(teamId: string, externalId: string) {
  const record = await prisma.externalSourceRecord.findUnique({
    where: { source_entityType_externalId: { source: "valve-rankings", entityType: "valve_ranking", externalId } }
  });
  const raw = record ? rawRecord(record.rawJson) : {};
  await prisma.entityMatchCandidate.create({
    data: {
      source: "valve-rankings",
      entityType: "team",
      externalId,
      externalName: String(raw.teamName ?? raw.name ?? externalId),
      matchedEntityId: teamId,
      confidence: 0,
      status: "rejected",
      rawJson: record?.rawJson ?? "{}"
    }
  });
  return { teamId, externalId };
}
