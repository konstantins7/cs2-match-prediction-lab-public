import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const now = new Date("2026-05-12T08:00:00.000Z");
const maps = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];
const roles = ["AWP", "Entry", "IGL", "Support", "Star rifler"];

const teams = [
  ["team_aurora_five", "Aurora Five", "aurora-five", "CA", "North America"],
  ["team_nordic_pulse", "Nordic Pulse", "nordic-pulse", "SE", "Europe"],
  ["team_iron_wolves", "Iron Wolves", "iron-wolves", "PL", "Europe"],
  ["team_mirage_core", "Mirage Core", "mirage-core", "ES", "Europe"],
  ["team_inferno_kings", "Inferno Kings", "inferno-kings", "BR", "South America"],
  ["team_ancient_force", "Ancient Force", "ancient-force", "UA", "Europe"],
  ["team_dustborn", "Dustborn", "dustborn", "US", "North America"],
  ["team_anubis_guard", "Anubis Guard", "anubis-guard", "EG", "MENA"],
  ["team_nuke_theory", "Nuke Theory", "nuke-theory", "DE", "Europe"],
  ["team_overpass_unit", "Overpass Unit", "overpass-unit", "AU", "Oceania"],
  ["team_crimson_aim", "Crimson Aim", "crimson-aim", "KR", "Asia"],
  ["team_vertex_clan", "Vertex Clan", "vertex-clan", "KZ", "Central Asia"]
] as const;

const weightKeys = [
  "teamStrength",
  "recentForm",
  "playerForm",
  "kdTrend",
  "mapPool",
  "veto",
  "overtime",
  "closing",
  "comeback",
  "economy",
  "headToHead",
  "newsImpact",
  "fatigue",
  "lanOnline",
  "format",
  "dataQuality",
  "metaShift",
  "dataRelevance",
  "transferAdaptation",
  "communication",
  "chemistry",
  "roleChange",
  "positionChange",
  "playerSystemFit",
  "leadership",
  "honeymoon",
  "coreStability",
  "roleConflict"
] as const;

function days(offset: number) {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + offset);
  return value;
}

function hours(offset: number) {
  const value = new Date(now);
  value.setUTCHours(value.getUTCHours() + offset);
  return value;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function wave(index: number, modifier = 0) {
  return Math.sin(index * 1.37 + modifier) * 0.5 + 0.5;
}

function json(value: unknown) {
  return JSON.stringify(value);
}

async function reset() {
  await prisma.predictionAudit.deleteMany();
  await prisma.predictionFactor.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.sourceSyncLog.deleteMany();
  await prisma.newsItem.deleteMany();
  await prisma.headToHead.deleteMany();
  await prisma.matchMap.deleteMany();
  await prisma.match.deleteMany();
  await prisma.vetoPattern.deleteMany();
  await prisma.teamMapStat.deleteMany();
  await prisma.teamFormSnapshot.deleteMany();
  await prisma.playerRoleSnapshot.deleteMany();
  await prisma.playerTeamHistory.deleteMany();
  await prisma.playerStatSnapshot.deleteMany();
  await prisma.rosterEvent.deleteMany();
  await prisma.teamChemistrySnapshot.deleteMany();
  await prisma.teamRosterVersion.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.modelWeightPreset.deleteMany();
  await prisma.gameMetaVersion.deleteMany();
  await prisma.mapVersion.deleteMany();
  await prisma.activeMapPoolVersion.deleteMany();
}

function buildWeights(multiplier = 1) {
  return Object.fromEntries(
    weightKeys.map((key, index) => {
      const base = key === "dataQuality" ? 0.7 : key === "format" ? 0.55 : 1;
      const specialist =
        key === "mapPool" || key === "veto" || key === "playerForm" ? 0.12 : 0;
      return [key, round((base + specialist + (index % 4) * 0.03) * multiplier, 2)];
    })
  );
}

async function seedTeamsAndPlayers() {
  for (let i = 0; i < teams.length; i += 1) {
    const [id, name, slug, country, region] = teams[i];
    await prisma.team.create({
      data: {
        id,
        name,
        slug,
        country,
        region,
        hltvReferenceUrl: `https://www.hltv.org/search?query=${encodeURIComponent(name)}`,
        liquipediaReferenceUrl: `https://liquipedia.net/counterstrike/${slug}`,
        pandaScoreId: `demo-ps-${i + 1}`,
        gridId: `demo-grid-${i + 1}`,
        valveRank: i + 8,
        hltvRank: i + 12,
        internalElo: 1715 - i * 27 + (i % 3) * 18,
        topRankCategory: i < 2 ? "top-10" : i < 5 ? "top-20" : i < 9 ? "top-50" : "top-100",
        isActive: true
      }
    });

    const playerIds: string[] = [];
    for (let slot = 0; slot < roles.length; slot += 1) {
      const playerId = `player_${slug.replaceAll("-", "_")}_${slot + 1}`;
      playerIds.push(playerId);
      const role = roles[slot];
      const joinedOffset = slot === 4 && i % 4 === 0 ? -24 : -220 + i * 8 + slot * 9;
      await prisma.player.create({
        data: {
          id: playerId,
          nickname: `${slug.split("-")[0]}-${role.replace(" ", "").slice(0, 4)}${slot + 1}`,
          realName: `Demo Player ${i + 1}-${slot + 1}`,
          teamId: id,
          role,
          country,
          age: 19 + ((i + slot) % 12),
          isActive: true,
          joinedAt: days(joinedOffset),
          liquipediaReferenceUrl: `https://liquipedia.net/counterstrike/${slug}`
        }
      });

      const roleBoost = role === "AWP" ? 0.06 : role === "Star rifler" ? 0.05 : role === "Support" ? -0.02 : 0;
      const variance = wave(i * 5 + slot, 0.4) - 0.5;
      const mapsPlayed = 16 + ((i * 5 + slot * 7) % 26);
      await prisma.playerStatSnapshot.create({
        data: {
          id: `stat_${playerId}`,
          playerId,
          teamId: id,
          period: "last_30_days",
          maps: mapsPlayed,
          rounds: mapsPlayed * 24,
          kd: round(0.94 + roleBoost + variance * 0.18, 2),
          kdDiff: Math.round((roleBoost + variance * 0.22) * 95),
          rating: round(0.98 + roleBoost + variance * 0.2, 2),
          adr: round(68 + roleBoost * 90 + variance * 16, 1),
          kast: round(0.66 + roleBoost * 0.5 + wave(slot + i, 1.2) * 0.12),
          impact: round(0.9 + roleBoost + wave(i + slot, 2.3) * 0.28, 2),
          openingKillRating: round(0.88 + (role === "Entry" ? 0.14 : 0.02) + variance * 0.18, 2),
          clutchScore: round(0.43 + (role === "Support" ? 0.08 : 0.03) + wave(i, slot) * 0.22),
          volatilityScore: round(0.22 + wave(i, slot * 0.7) * 0.42),
          pressureScore: round(0.45 + wave(i + slot, 3.1) * 0.34),
          trendScore: round(-0.15 + wave(i * 2 + slot, 1.4) * 0.34),
          ratingTrend: round(-0.08 + wave(i + slot, 0.9) * 0.18),
          kdTrend: round(-0.09 + wave(i + slot, 1.7) * 0.2),
          adrTrend: round(-4 + wave(i + slot, 2.2) * 8, 1),
          openingDuelTrend: round(-0.08 + wave(i + slot, 2.7) * 0.16),
          clutchTrend: round(-0.07 + wave(i + slot, 3.2) * 0.14),
          pressurePerformance: round(0.43 + wave(i + slot, 3.7) * 0.34),
          mapSpecificPerformance: round(0.45 + wave(i + slot, 4.2) * 0.36),
          roleImpact: round(0.48 + (role === "AWP" || role === "Star rifler" ? 0.13 : 0) + wave(i + slot, 4.8) * 0.26),
          starDependency: round(role === "Star rifler" ? 0.72 + wave(i, slot) * 0.18 : 0.26 + wave(i, slot) * 0.22),
          worstPlayerLiability: round(slot === 3 ? 0.18 + wave(i, slot) * 0.34 : 0.08 + wave(i, slot) * 0.22),
          lanRating: round(0.95 + roleBoost + wave(i + slot, 5.2) * 0.18, 2),
          onlineRating: round(0.97 + roleBoost + wave(i + slot, 5.8) * 0.18, 2),
          source: "mock_seed",
          sourceUrl: "manual://seed/player-stats"
        }
      });

      await prisma.playerTeamHistory.create({
        data: {
          id: `history_${playerId}`,
          playerId,
          teamId: id,
          joinedAt: days(joinedOffset),
          role,
          mainPositionsJson: json(["anchor", role === "Entry" ? "entry-lane" : "rotator"]),
          mapsPlayed: mapsPlayed + 20,
          rating: round(0.98 + roleBoost + variance * 0.16, 2),
          kd: round(0.95 + roleBoost + variance * 0.15, 2),
          notes: "Fictional continuity record for MVP data relevance."
        }
      });

      for (let mapIndex = 0; mapIndex < maps.length; mapIndex += 1) {
        await prisma.playerRoleSnapshot.create({
          data: {
            id: `role_${playerId}_${mapIndex}`,
            playerId,
            teamId: id,
            date: days(-12 - mapIndex),
            role,
            mapName: maps[mapIndex],
            positionsJson: json([
              `${maps[mapIndex].toLowerCase()}-${role.toLowerCase().replace(" ", "-")}`,
              slot % 2 === 0 ? "early-contact" : "late-round"
            ]),
            openingDuelRate: round(0.16 + (role === "Entry" ? 0.12 : 0.02) + wave(i + mapIndex, slot) * 0.08),
            clutchRate: round(0.05 + (role === "Support" ? 0.05 : 0.02) + wave(slot + mapIndex, i) * 0.05),
            adr: round(66 + roleBoost * 90 + wave(i + slot + mapIndex, 1) * 18, 1),
            rating: round(0.94 + roleBoost + wave(i + slot + mapIndex, 2) * 0.22, 2),
            kd: round(0.91 + roleBoost + wave(i + slot + mapIndex, 3) * 0.22, 2),
            source: "mock_seed",
            sourceUrl: "manual://seed/role-snapshots"
          }
        });
      }
    }

    const rosterStarted = i % 4 === 0 ? days(-28) : days(-180 + i * 5);
    await prisma.teamRosterVersion.create({
      data: {
        id: `roster_${id}`,
        teamId: id,
        startedAt: rosterStarted,
        playerIdsJson: json(playerIds),
        coachId: `coach_${slug}`,
        iglPlayerId: playerIds[2],
        mainLanguage: i % 5 === 0 ? "mixed" : i % 2 === 0 ? "English" : "regional",
        coreStabilityScore: round(i % 4 === 0 ? 0.46 : 0.68 + wave(i, 0.3) * 0.24),
        mapsPlayedTogether: i % 4 === 0 ? 11 + i : 38 + i * 3,
        matchesPlayedTogether: i % 4 === 0 ? 5 + i : 18 + i * 2
      }
    });
  }

  for (let i = 0; i < teams.length; i += 1) {
    const [id] = teams[i];
    await prisma.teamChemistrySnapshot.create({
      data: {
        id: `chem_${id}`,
        teamId: id,
        date: days(-4),
        rosterVersionId: `roster_${id}`,
        sharedExperienceScore: round(i % 4 === 0 ? 0.42 : 0.58 + wave(i, 1.1) * 0.32),
        languageCompatibilityScore: round(i % 5 === 0 ? 0.52 : 0.7 + wave(i, 1.5) * 0.2),
        roleFitScore: round(0.56 + wave(i, 1.9) * 0.32),
        coreStabilityScore: round(i % 4 === 0 ? 0.46 : 0.66 + wave(i, 2.2) * 0.25),
        adaptationScore: round(i % 4 === 0 ? 0.38 : 0.61 + wave(i, 2.5) * 0.25),
        volatilityScore: round(i % 4 === 0 ? 0.58 : 0.2 + wave(i, 2.9) * 0.34),
        notes: i % 4 === 0 ? "Recent roster move creates adaptation risk." : "Stable fictional core."
      }
    });

    if (i % 4 === 0) {
      const changedPlayerId = `player_${teams[i][2].replaceAll("-", "_")}_5`;
      await prisma.rosterEvent.create({
        data: {
          id: `event_transfer_${id}`,
          teamId: id,
          playerId: changedPlayerId,
          eventType: "new signing",
          eventDate: days(-24),
          oldTeamId: `old_${id}`,
          newTeamId: id,
          oldRole: "Rifler",
          newRole: "Star rifler",
          oldPositionsJson: json(["lurker", "late-round"]),
          newPositionsJson: json(["pack", "trade-core"]),
          expectedImpact: 0.08,
          confidence: 0.72,
          sourceUrl: "manual://seed/roster-event"
        }
      });
    }
  }
}

async function seedTeamSnapshots() {
  for (let i = 0; i < teams.length; i += 1) {
    const [id] = teams[i];
    const formBase = 0.48 + wave(i, 0.2) * 0.18 - i * 0.006;
    await prisma.teamFormSnapshot.create({
      data: {
        id: `form_${id}`,
        teamId: id,
        period: "last_30_days",
        matchesPlayed: 12 + (i % 7),
        mapsPlayed: 24 + i * 2,
        matchWinRate: round(clamp(formBase + 0.03)),
        mapWinRate: round(clamp(formBase + 0.01)),
        roundWinRate: round(clamp(0.49 + wave(i, 0.6) * 0.09)),
        vsTop10WinRate: round(clamp(0.22 + wave(i, 1.1) * 0.25)),
        vsTop20WinRate: round(clamp(0.32 + wave(i, 1.4) * 0.28)),
        vsTop50WinRate: round(clamp(0.42 + wave(i, 1.7) * 0.3)),
        vsTop100WinRate: round(clamp(0.5 + wave(i, 2.0) * 0.28)),
        winVsTop10: round(clamp(0.18 + wave(i, 2.3) * 0.3)),
        winVsTop20: round(clamp(0.3 + wave(i, 2.6) * 0.32)),
        winVsTop50: round(clamp(0.4 + wave(i, 2.9) * 0.34)),
        winVsTop100: round(clamp(0.48 + wave(i, 3.2) * 0.34)),
        lossVsLowerRanked: round(clamp(0.08 + wave(i, 3.5) * 0.24)),
        opponentStrengthAdjustedForm: round(clamp(0.42 + wave(i, 3.8) * 0.34)),
        currentStreak: (i % 5) - 2,
        formScore: round(clamp(formBase + wave(i, 4.1) * 0.08)),
        volatilityScore: round(clamp(0.18 + wave(i, 4.4) * 0.45)),
        matchesLast7Days: 1 + (i % 5),
        mapsLast7Days: 3 + (i % 5) * 2,
        travelRiskScore: round(clamp(i % 3 === 0 ? 0.58 + wave(i, 4.7) * 0.22 : 0.18 + wave(i, 4.7) * 0.18)),
        timezoneShiftHours: i % 3 === 0 ? 5 : i % 4 === 0 ? 3 : 0,
        fatigueScore: round(clamp(0.22 + (i % 5) * 0.09 + wave(i, 5) * 0.12)),
        lanWinRate: round(clamp(0.44 + wave(i, 5.3) * 0.25)),
        onlineWinRate: round(clamp(0.46 + wave(i, 5.6) * 0.25)),
        motivationScore: round(clamp(0.48 + wave(i, 5.9) * 0.32)),
        rosterStabilityScore: round(i % 4 === 0 ? 0.48 : 0.64 + wave(i, 6.2) * 0.24),
        closeOutRate: round(clamp(0.48 + wave(i, 6.5) * 0.32)),
        mapPointConversion: round(clamp(0.52 + wave(i, 6.8) * 0.3)),
        leadProtectionScore: round(clamp(0.5 + wave(i, 7.1) * 0.31)),
        lostFromWinningPositionRate: round(clamp(0.08 + wave(i, 7.4) * 0.28)),
        deciderCollapseRate: round(clamp(0.08 + wave(i, 7.7) * 0.28)),
        seriesCloseOutRate: round(clamp(0.5 + wave(i, 8.0) * 0.28)),
        comebackFrom3RoundDeficit: round(clamp(0.34 + wave(i, 8.3) * 0.34)),
        comebackFrom5RoundDeficit: round(clamp(0.18 + wave(i, 8.6) * 0.3)),
        badHalfRecovery: round(clamp(0.32 + wave(i, 8.9) * 0.34)),
        lostPistolRecovery: round(clamp(0.28 + wave(i, 9.2) * 0.34)),
        lostOwnPickRecovery: round(clamp(0.26 + wave(i, 9.5) * 0.32))
      }
    });

    for (let mapIndex = 0; mapIndex < maps.length; mapIndex += 1) {
      const sample = 3 + ((i * 5 + mapIndex * 7) % 34);
      const mapBase = 0.42 + wave(i + mapIndex, 0.8) * 0.25 - mapIndex * 0.006;
      await prisma.teamMapStat.create({
        data: {
          id: `map_${id}_${maps[mapIndex].toLowerCase()}`,
          teamId: id,
          mapName: maps[mapIndex],
          period: "last_90_days",
          mapsPlayed: sample,
          winRate: round(clamp(mapBase)),
          pickRate: round(clamp(0.08 + wave(i, mapIndex) * 0.45)),
          banRate: round(clamp(0.08 + wave(i + 2, mapIndex) * 0.48)),
          firstPickRate: round(clamp(0.05 + wave(i + 4, mapIndex) * 0.3)),
          deciderRate: round(clamp(0.04 + wave(i + 6, mapIndex) * 0.28)),
          ctRoundWinRate: round(clamp(0.45 + wave(i, mapIndex + 0.2) * 0.18)),
          tRoundWinRate: round(clamp(0.42 + wave(i, mapIndex + 0.4) * 0.18)),
          pistolWinRate: round(clamp(0.42 + wave(i, mapIndex + 0.6) * 0.2)),
          conversionAfterPistolWin: round(clamp(0.55 + wave(i, mapIndex + 0.8) * 0.25)),
          forceBuyWinRate: round(clamp(0.18 + wave(i, mapIndex + 1) * 0.25)),
          antiEcoLossRate: round(clamp(0.04 + wave(i, mapIndex + 1.2) * 0.14)),
          overtimeWinRate: round(clamp(0.35 + wave(i, mapIndex + 1.4) * 0.34)),
          multipleOvertimeWinRate: round(clamp(0.22 + wave(i, mapIndex + 1.6) * 0.3)),
          overtimeFrequency: round(clamp(0.04 + wave(i, mapIndex + 1.8) * 0.16)),
          pressureRoundWinRate: round(clamp(0.43 + wave(i, mapIndex + 2) * 0.22)),
          clutchInOvertimeScore: round(clamp(0.34 + wave(i, mapIndex + 2.2) * 0.34)),
          closingScore: round(clamp(0.42 + wave(i, mapIndex + 2.4) * 0.36)),
          comebackScore: round(clamp(0.34 + wave(i, mapIndex + 2.6) * 0.34)),
          ecoRecoveryScore: round(clamp(0.38 + wave(i, mapIndex + 2.8) * 0.34)),
          resetResistanceScore: round(clamp(0.36 + wave(i, mapIndex + 3) * 0.34)),
          recentTrend: round(-0.12 + wave(i, mapIndex + 3.2) * 0.24),
          openingRoundPerformance: round(clamp(0.42 + wave(i, mapIndex + 3.4) * 0.22)),
          sampleQuality: round(sample / (sample + 12)),
          source: "mock_seed",
          sourceUrl: "manual://seed/map-stats"
        }
      });

      await prisma.vetoPattern.create({
        data: {
          id: `veto_${id}_${maps[mapIndex].toLowerCase()}`,
          teamId: id,
          format: mapIndex % 3 === 0 ? "BO1" : "BO3",
          period: "last_60_days",
          mapName: maps[mapIndex],
          pickProbability: round(clamp(0.08 + wave(i, mapIndex + 4) * 0.42)),
          banProbability: round(clamp(0.08 + wave(i, mapIndex + 5) * 0.5)),
          punishProbability: round(clamp(0.08 + wave(i, mapIndex + 6) * 0.42)),
          weaknessScore: round(clamp(0.1 + wave(i, mapIndex + 7) * 0.55)),
          comfortScore: round(clamp(0.25 + wave(i, mapIndex + 8) * 0.55)),
          confidenceScore: round(sample / (sample + 10))
        }
      });
    }
  }
}

async function seedMetaAndMaps() {
  await prisma.activeMapPoolVersion.create({
    data: {
      id: "pool_current_2026_demo",
      name: "CS2 Demo Active Duty 2026",
      startedAt: days(-120),
      mapsJson: json(maps),
      notes: "Fictional active pool for local MVP testing.",
      sourceUrl: "manual://seed/active-map-pool"
    }
  });

  await prisma.gameMetaVersion.createMany({
    data: [
      {
        id: "meta_economy_2026_spring",
        patchDate: days(-36),
        patchName: "Spring Economy Tuning",
        patchType: "major",
        affectedAreas: "economy, force-buy, reset resistance",
        impactScore: 0.72,
        description: "Fictional major economy update used to decay older economy data.",
        sourceUrl: "manual://seed/meta"
      },
      {
        id: "meta_weapon_2026_minor",
        patchDate: days(-11),
        patchName: "Rifle Spread Adjustment",
        patchType: "minor",
        affectedAreas: "rifles, opening duels",
        impactScore: 0.28,
        description: "Fictional minor weapon adjustment.",
        sourceUrl: "manual://seed/meta"
      }
    ]
  });

  for (let index = 0; index < maps.length; index += 1) {
    await prisma.mapVersion.create({
      data: {
        id: `map_version_${maps[index].toLowerCase()}`,
        mapName: maps[index],
        versionName: `${maps[index]} 2026 demo layout`,
        startedAt: index % 3 === 0 ? days(-42) : days(-190),
        changeType: index % 3 === 0 ? "major_layout" : "stable",
        impactScore: index % 3 === 0 ? 0.62 : 0.18,
        description: `Fictional ${maps[index]} version used for map relevance decay.`,
        sourceUrl: "manual://seed/map-version"
      }
    });
  }
}

async function seedMatches() {
  const allMatches: Array<{
    id: string;
    teamAId: string;
    teamBId: string;
    startTime: Date;
    status: string;
    format: string;
    isLan: boolean;
    winnerTeamId?: string;
    eventName: string;
    stage: string;
  }> = [];

  for (let i = 0; i < 20; i += 1) {
    const a = teams[i % teams.length][0];
    const b = teams[(i * 3 + 5) % teams.length][0];
    allMatches.push({
      id: `match_upcoming_${String(i + 1).padStart(2, "0")}`,
      teamAId: a,
      teamBId: b === a ? teams[(i + 1) % teams.length][0] : b,
      startTime: hours(5 + i * 7),
      status: "upcoming",
      format: i % 5 === 0 ? "BO1" : i % 7 === 0 ? "BO5" : "BO3",
      isLan: i % 3 === 0,
      eventName: i % 2 === 0 ? "Analyst Cup 2026" : "Data Masters Spring",
      stage: i % 4 === 0 ? "Playoff quarterfinal" : i % 3 === 0 ? "Swiss round" : "Group stage"
    });
  }

  for (let i = 0; i < 2; i += 1) {
    allMatches.push({
      id: `match_live_${i + 1}`,
      teamAId: teams[(i + 2) % teams.length][0],
      teamBId: teams[(i + 8) % teams.length][0],
      startTime: hours(-1 + i),
      status: "live",
      format: "BO3",
      isLan: i === 0,
      eventName: "Live Demo Series",
      stage: "Upper bracket"
    });
  }

  for (let i = 0; i < 10; i += 1) {
    const teamAId = teams[(i + 1) % teams.length][0];
    const teamBId = teams[(i * 2 + 4) % teams.length][0];
    allMatches.push({
      id: `match_finished_${String(i + 1).padStart(2, "0")}`,
      teamAId,
      teamBId: teamBId === teamAId ? teams[(i + 5) % teams.length][0] : teamBId,
      startTime: days(-1 - i),
      status: "finished",
      format: i % 4 === 0 ? "BO1" : "BO3",
      isLan: i % 3 === 1,
      winnerTeamId: i % 2 === 0 ? teamAId : teamBId,
      eventName: "Historical Demo League",
      stage: i % 3 === 0 ? "Elimination" : "Group stage"
    });
  }

  for (let i = 0; i < allMatches.length; i += 1) {
    const match = allMatches[i];
    await prisma.match.create({
      data: {
        id: match.id,
        source: "mock_seed",
        sourceMatchId: `mock-${match.id}`,
        eventName: match.eventName,
        eventTier: i % 4 === 0 ? "S" : i % 3 === 0 ? "A" : "B",
        stage: match.stage,
        startTime: match.startTime,
        status: match.status,
        format: match.format,
        isOfficial: true,
        isLan: match.isLan,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        winnerTeamId: match.winnerTeamId,
        matchUrl: `manual://seed/matches/${match.id}`,
        dataQualityScore: 58 + ((i * 9) % 39)
      }
    });

    const mapCount = match.format === "BO1" ? 1 : match.format === "BO5" ? 5 : 3;
    if (match.status === "finished" || match.status === "live") {
      for (let mapOrder = 1; mapOrder <= mapCount; mapOrder += 1) {
        const teamAWon = match.winnerTeamId ? match.winnerTeamId === match.teamAId : mapOrder % 2 === 1;
        await prisma.matchMap.create({
          data: {
            id: `map_${match.id}_${mapOrder}`,
            matchId: match.id,
            mapName: maps[(i + mapOrder) % maps.length],
            mapOrder,
            pickedByTeamId: mapOrder % 2 === 1 ? match.teamAId : match.teamBId,
            bannedByTeamId: maps[(i + mapOrder + 2) % maps.length] ? (mapOrder % 2 === 0 ? match.teamAId : match.teamBId) : null,
            teamAScore: teamAWon ? 13 + (mapOrder % 3) : 7 + (i % 5),
            teamBScore: teamAWon ? 8 + (i % 5) : 13 + (mapOrder % 3),
            winnerTeamId: teamAWon ? match.teamAId : match.teamBId,
            wentOvertime: (i + mapOrder) % 6 === 0,
            overtimeCount: (i + mapOrder) % 6 === 0 ? 1 + (i % 2) : 0,
            regulationScore: "13:10",
            teamACTRoundsWon: 6 + (i % 4),
            teamATRoundsWon: 5 + (mapOrder % 4),
            teamBCTRoundsWon: 5 + ((i + mapOrder) % 4),
            teamBTRoundsWon: 4 + (i % 5)
          }
        });
      }
    }
  }

  for (let i = 0; i < 10; i += 1) {
    const matchId = `match_finished_${String(i + 1).padStart(2, "0")}`;
    const match = allMatches.find((candidate) => candidate.id === matchId);
    if (!match) continue;
    await prisma.headToHead.create({
      data: {
        id: `h2h_${matchId}`,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        matchId,
        date: match.startTime,
        format: match.format,
        winnerTeamId: match.winnerTeamId,
        teamARosterSimilarity: round(0.45 + wave(i, 1) * 0.5),
        teamBRosterSimilarity: round(0.45 + wave(i, 2) * 0.5),
        relevanceScore: round(0.35 + wave(i, 3) * 0.5),
        notes: "Fictional H2H sample with roster similarity weighting."
      }
    });
  }
}

async function seedNewsPredictionsAndAdmin() {
  const newsTypes = ["stand-in", "bootcamp", "role change", "travel issue", "recent heavy loss", "motivation boost"];
  for (let i = 0; i < teams.length; i += 1) {
    const [teamId, teamName, slug] = teams[i];
    const reliability = i % 5 === 0 ? "weak rumor" : i % 4 === 0 ? "reliable rumor" : i % 3 === 0 ? "confirmed insider" : "official";
    const isRumor = reliability.includes("rumor");
    const maxAllowedImpact = reliability === "official" ? 12 : reliability === "confirmed insider" ? 8 : reliability === "reliable rumor" ? 5 : 3;
    await prisma.newsItem.create({
      data: {
        id: `news_${teamId}`,
        teamId,
        title: `${teamName}: ${newsTypes[i % newsTypes.length]} signal`,
        summary: "Fictional research event for risk-aware prediction testing.",
        source: reliability,
        url: `manual://seed/news/${slug}`,
        publishedAt: days(-1 - (i % 7)),
        reliability,
        eventType: newsTypes[i % newsTypes.length],
        sentiment: i % 3 === 0 ? "negative" : i % 3 === 1 ? "positive" : "neutral",
        impactScore: round((i % 3 === 0 ? -1 : 1) * (1.5 + wave(i, 1) * maxAllowedImpact)),
        maxAllowedImpact,
        isRumor,
        isOfficial: reliability === "official"
      }
    });
  }

  await prisma.modelWeightPreset.createMany({
    data: [
      {
        id: "preset_balanced",
        name: "BO3 balanced model",
        description: "Balanced research preset for normal BO3 matches.",
        weightsJson: json(buildWeights(1)),
        isDefault: true
      },
      {
        id: "preset_conservative",
        name: "Conservative model",
        description: "Lower overall factor pressure and higher reliance on data quality.",
        weightsJson: json({ ...buildWeights(0.82), dataQuality: 1.1, newsImpact: 0.55 }),
        isDefault: false
      },
      {
        id: "preset_map_heavy",
        name: "Map-heavy model",
        description: "Higher map-pool and veto influence.",
        weightsJson: json({ ...buildWeights(1), mapPool: 1.55, veto: 1.45, format: 0.8 }),
        isDefault: false
      },
      {
        id: "preset_player_form",
        name: "Player-form-heavy model",
        description: "Higher player trend and role fit influence.",
        weightsJson: json({ ...buildWeights(1), playerForm: 1.45, kdTrend: 1.35, playerSystemFit: 1.25 }),
        isDefault: false
      },
      {
        id: "preset_news_sensitive",
        name: "News-sensitive model",
        description: "More sensitive to official news while retaining clamps.",
        weightsJson: json({ ...buildWeights(1), newsImpact: 1.35, chemistry: 1.15, roleConflict: 1.15 }),
        isDefault: false
      },
      {
        id: "preset_bo1_risk",
        name: "BO1 risk model",
        description: "Increases economy, veto, format, and risk-related factors.",
        weightsJson: json({ ...buildWeights(1), economy: 1.45, veto: 1.35, format: 1.4, overtime: 1.15 }),
        isDefault: false
      }
    ]
  });

  for (let i = 0; i < 20; i += 1) {
    const matchId = `match_upcoming_${String(i + 1).padStart(2, "0")}`;
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) continue;
    const aProb = 50 + ((i * 7) % 24) - 12;
    const predictedWinnerId = aProb >= 50 ? match.teamAId : match.teamBId;
    const prediction = await prisma.prediction.create({
      data: {
        id: `prediction_seed_${String(i + 1).padStart(2, "0")}`,
        matchId,
        modelVersion: "seed-example-v0.2",
        teamAProbability: aProb,
        teamBProbability: 100 - aProb,
        predictedWinnerId,
        confidenceScore: 55 + (i % 28),
        riskLevel: i % 4 === 0 ? "High" : i % 3 === 0 ? "Medium" : "Low",
        dataQualityScore: match.dataQualityScore,
        explanation: "Saved seed example only. UI recalculates live with calculatePrediction.",
        warningsJson: json(["Seed predictions are audit examples, not UI source of truth."])
      }
    });
    await prisma.predictionFactor.createMany({
      data: [
        {
          predictionId: prediction.id,
          factorName: "Seed Team Strength",
          factorGroup: "seed",
          teamAValue: aProb,
          teamBValue: 100 - aProb,
          rawDifference: aProb - (100 - aProb),
          normalizedDifference: (aProb - 50) / 50,
          weight: 1,
          impact: (aProb - 50) / 3,
          confidence: 0.65,
          explanation: "Stored seed factor for audit display only."
        }
      ]
    });
  }

  await prisma.sourceSyncLog.createMany({
    data: [
      {
        id: "sync_mock_seed",
        source: "mock",
        status: "success",
        startedAt: now,
        finishedAt: hours(1),
        recordsImported: 320,
        errorsJson: json([]),
        notes: "Local deterministic seed import."
      },
      {
        id: "sync_pandascore_disabled",
        source: "pandascore",
        status: "disabled",
        startedAt: now,
        finishedAt: now,
        recordsImported: 0,
        errorsJson: json([]),
        notes: "Adapter available but disabled by env/config."
      },
      {
        id: "sync_grid_disabled",
        source: "grid",
        status: "disabled",
        startedAt: now,
        finishedAt: now,
        recordsImported: 0,
        errorsJson: json([]),
        notes: "Adapter available but disabled by env/config."
      },
      {
        id: "sync_liquipedia_disabled",
        source: "liquipedia",
        status: "disabled",
        startedAt: now,
        finishedAt: now,
        recordsImported: 0,
        errorsJson: json([]),
        notes: "Adapter available but disabled by env/config."
      }
    ]
  });
}

async function main() {
  await reset();
  await seedMetaAndMaps();
  await seedTeamsAndPlayers();
  await seedTeamSnapshots();
  await seedMatches();
  await seedNewsPredictionsAndAdmin();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed complete: fictional CS2 Match Prediction Lab data created.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
