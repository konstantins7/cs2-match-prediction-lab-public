import type {
  GameMetaEntity,
  MapVersionEntity,
  PredictionInput,
  RosterVersionEntity,
  TeamChemistryEntity,
  TeamFormEntity,
  TeamMapStatEntity
} from "./types";
import { defaultWeights } from "./utils";

const now = "2026-05-12T08:00:00.000Z";
const maps = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];

function form(teamId: string, overrides: Partial<TeamFormEntity> = {}): TeamFormEntity {
  return {
    teamId,
    period: "last_30_days",
    matchesPlayed: 12,
    mapsPlayed: 28,
    matchWinRate: 0.58,
    mapWinRate: 0.57,
    roundWinRate: 0.52,
    vsTop10WinRate: 0.42,
    vsTop20WinRate: 0.5,
    vsTop50WinRate: 0.6,
    vsTop100WinRate: 0.66,
    winVsTop10: 0.42,
    winVsTop20: 0.5,
    winVsTop50: 0.6,
    winVsTop100: 0.66,
    lossVsLowerRanked: 0.12,
    opponentStrengthAdjustedForm: 0.58,
    currentStreak: 2,
    formScore: 0.6,
    volatilityScore: 0.25,
    matchesLast7Days: 2,
    mapsLast7Days: 5,
    travelRiskScore: 0.22,
    timezoneShiftHours: 0,
    fatigueScore: 0.22,
    lanWinRate: 0.56,
    onlineWinRate: 0.58,
    motivationScore: 0.66,
    rosterStabilityScore: 0.7,
    closeOutRate: 0.62,
    mapPointConversion: 0.64,
    leadProtectionScore: 0.6,
    lostFromWinningPositionRate: 0.12,
    deciderCollapseRate: 0.14,
    seriesCloseOutRate: 0.62,
    comebackFrom3RoundDeficit: 0.46,
    comebackFrom5RoundDeficit: 0.32,
    badHalfRecovery: 0.48,
    lostPistolRecovery: 0.42,
    lostOwnPickRecovery: 0.44,
    createdAt: now,
    ...overrides
  };
}

function mapStats(teamId: string, boost = 0): TeamMapStatEntity[] {
  return maps.map((mapName, index) => ({
    teamId,
    mapName,
    period: "last_90_days",
    mapsPlayed: 20 + index,
    winRate: 0.54 + boost,
    pickRate: 0.2,
    banRate: 0.18,
    firstPickRate: 0.14,
    deciderRate: 0.16,
    ctRoundWinRate: 0.52 + boost,
    tRoundWinRate: 0.49 + boost,
    pistolWinRate: 0.5 + boost,
    conversionAfterPistolWin: 0.6 + boost,
    forceBuyWinRate: 0.3 + boost,
    antiEcoLossRate: 0.08,
    overtimeWinRate: 0.48 + boost,
    multipleOvertimeWinRate: 0.38 + boost,
    overtimeFrequency: 0.1,
    pressureRoundWinRate: 0.5 + boost,
    clutchInOvertimeScore: 0.48 + boost,
    closingScore: 0.56 + boost,
    comebackScore: 0.46 + boost,
    ecoRecoveryScore: 0.5 + boost,
    resetResistanceScore: 0.5 + boost,
    recentTrend: 0.04 + boost,
    openingRoundPerformance: 0.5 + boost,
    sampleQuality: 0.72,
    source: "test"
  }));
}

function roster(teamId: string, overrides: Partial<RosterVersionEntity> = {}): RosterVersionEntity {
  return {
    teamId,
    startedAt: "2025-10-01T08:00:00.000Z",
    endedAt: null,
    playerIdsJson: "[]",
    coachId: "coach",
    iglPlayerId: `${teamId}_p3`,
    mainLanguage: "English",
    coreStabilityScore: 0.74,
    mapsPlayedTogether: 65,
    matchesPlayedTogether: 30,
    ...overrides
  };
}

function chemistry(teamId: string, overrides: Partial<TeamChemistryEntity> = {}): TeamChemistryEntity {
  return {
    teamId,
    date: now,
    rosterVersionId: `roster_${teamId}`,
    sharedExperienceScore: 0.7,
    languageCompatibilityScore: 0.72,
    roleFitScore: 0.72,
    coreStabilityScore: 0.74,
    adaptationScore: 0.68,
    volatilityScore: 0.22,
    notes: "test",
    ...overrides
  };
}

function meta(overrides: Partial<GameMetaEntity> = {}): GameMetaEntity {
  return {
    id: "meta",
    patchDate: "2026-04-01T08:00:00.000Z",
    patchName: "Test Patch",
    patchType: "major",
    affectedAreas: "economy",
    impactScore: 0.7,
    description: "test",
    ...overrides
  };
}

function mapVersion(overrides: Partial<MapVersionEntity> = {}): MapVersionEntity {
  return {
    mapName: "Mirage",
    versionName: "test",
    startedAt: "2026-04-05T08:00:00.000Z",
    endedAt: null,
    changeType: "major_layout",
    impactScore: 0.7,
    description: "test",
    ...overrides
  };
}

export function createPredictionFixture(overrides: Partial<PredictionInput> = {}): PredictionInput {
  const playersA = Array.from({ length: 5 }, (_, index) => ({
    id: `teamA_p${index + 1}`,
    nickname: `A${index + 1}`,
    teamId: "teamA",
    role: ["AWP", "Entry", "IGL", "Support", "Star rifler"][index],
    country: "AA",
    isActive: true,
    joinedAt: "2025-10-01T08:00:00.000Z"
  }));
  const playersB = Array.from({ length: 5 }, (_, index) => ({
    id: `teamB_p${index + 1}`,
    nickname: `B${index + 1}`,
    teamId: "teamB",
    role: ["AWP", "Entry", "IGL", "Support", "Star rifler"][index],
    country: "BB",
    isActive: true,
    joinedAt: "2025-10-01T08:00:00.000Z"
  }));
  const playerStatsA = playersA.map((player, index) => ({
    playerId: player.id,
    teamId: "teamA",
    period: "last_30_days",
    maps: 22,
    rounds: 520,
    kd: 1.02,
    kdDiff: 8,
    rating: 1.04,
    adr: 74,
    kast: 0.72,
    impact: 1.02,
    openingKillRating: 1,
    clutchScore: 0.5,
    volatilityScore: 0.26,
    pressureScore: 0.58,
    trendScore: 0.04,
    ratingTrend: 0.04,
    kdTrend: 0.04,
    adrTrend: 2,
    openingDuelTrend: 0.03,
    clutchTrend: 0.02,
    pressurePerformance: 0.58,
    mapSpecificPerformance: 0.58,
    roleImpact: 0.6,
    starDependency: index === 4 ? 0.68 : 0.28,
    worstPlayerLiability: 0.12,
    lanRating: 1.03,
    onlineRating: 1.04,
    source: "test",
    createdAt: now
  }));
  const playerStatsB = playerStatsA.map((stat, index) => ({
    ...stat,
    playerId: `teamB_p${index + 1}`,
    teamId: "teamB",
    rating: 1.01,
    kdTrend: 0.01,
    ratingTrend: 0.01
  }));

  return {
    match: {
      id: "match_test",
      eventName: "Test Event",
      eventTier: "A",
      stage: "Group",
      startTime: now,
      status: "upcoming",
      format: "BO3",
      isOfficial: true,
      isLan: false,
      teamAId: "teamA",
      teamBId: "teamB",
      winnerTeamId: null,
      matchUrl: "manual://test",
      dataQualityScore: 82
    },
    teamA: {
      id: "teamA",
      name: "Team A",
      slug: "team-a",
      country: "AA",
      region: "Test",
      valveRank: 12,
      hltvRank: 12,
      internalElo: 1700,
      topRankCategory: "top-20",
      isActive: true
    },
    teamB: {
      id: "teamB",
      name: "Team B",
      slug: "team-b",
      country: "BB",
      region: "Test",
      valveRank: 22,
      hltvRank: 22,
      internalElo: 1660,
      topRankCategory: "top-50",
      isActive: true
    },
    playersA,
    playersB,
    teamFormA: form("teamA"),
    teamFormB: form("teamB", { formScore: 0.55, matchWinRate: 0.52, mapWinRate: 0.52 }),
    playerStatsA,
    playerStatsB,
    mapStatsA: mapStats("teamA", 0.02),
    mapStatsB: mapStats("teamB", 0),
    vetoPatternsA: maps.map((mapName) => ({
      teamId: "teamA",
      format: "BO3",
      period: "last_60_days",
      mapName,
      pickProbability: 0.2,
      banProbability: 0.16,
      punishProbability: 0.18,
      weaknessScore: 0.2,
      comfortScore: 0.58,
      confidenceScore: 0.7
    })),
    vetoPatternsB: maps.map((mapName) => ({
      teamId: "teamB",
      format: "BO3",
      period: "last_60_days",
      mapName,
      pickProbability: 0.19,
      banProbability: 0.17,
      punishProbability: 0.17,
      weaknessScore: 0.22,
      comfortScore: 0.53,
      confidenceScore: 0.68
    })),
    h2h: [],
    news: [],
    modelWeights: defaultWeights,
    gameMetaVersions: [meta()],
    rosterVersionA: roster("teamA"),
    rosterVersionB: roster("teamB"),
    chemistryA: chemistry("teamA"),
    chemistryB: chemistry("teamB", { coreStabilityScore: 0.68, sharedExperienceScore: 0.64 }),
    rosterEventsA: [],
    rosterEventsB: [],
    playerHistoriesA: [],
    playerHistoriesB: [],
    roleSnapshotsA: playersA.map((player) => ({
      playerId: player.id,
      teamId: "teamA",
      date: now,
      role: player.role,
      mapName: "Mirage",
      positionsJson: "[]",
      openingDuelRate: 0.2,
      clutchRate: 0.08,
      adr: 74,
      rating: 1.04,
      kd: 1.02
    })),
    roleSnapshotsB: playersB.map((player) => ({
      playerId: player.id,
      teamId: "teamB",
      date: now,
      role: player.role,
      mapName: "Mirage",
      positionsJson: "[]",
      openingDuelRate: 0.19,
      clutchRate: 0.07,
      adr: 72,
      rating: 1.01,
      kd: 1
    })),
    mapVersions: [mapVersion()],
    activeMapPool: {
      name: "test pool",
      startedAt: "2026-01-01T08:00:00.000Z",
      mapsJson: JSON.stringify(maps),
      notes: "test"
    },
    opponentMatchupA: {
      teamId: "teamA",
      opponentTeamId: "teamB",
      period: "last_90_days",
      rosterSimilarity: 0.8,
      matchesPlayed: 3,
      mapsPlayed: 24,
      matchWinRate: 0.58,
      mapWinRate: 0.57,
      averageRoundDiff: 2,
      favoriteMapsJson: JSON.stringify(["Mirage", "Nuke"]),
      weakMapsJson: JSON.stringify(["Train"]),
      styleAdvantageScore: 0.57,
      awpMatchupScore: 0.56,
      entryMatchupScore: 0.55,
      vetoPunishScore: 0.32,
      overtimeMatchupScore: 0.54,
      closingMatchupScore: 0.56,
      confidenceScore: 0.72,
      createdAt: now
    },
    opponentMatchupB: {
      teamId: "teamB",
      opponentTeamId: "teamA",
      period: "last_90_days",
      rosterSimilarity: 0.78,
      matchesPlayed: 3,
      mapsPlayed: 22,
      matchWinRate: 0.49,
      mapWinRate: 0.5,
      averageRoundDiff: -1,
      favoriteMapsJson: JSON.stringify(["Ancient", "Anubis"]),
      weakMapsJson: JSON.stringify(["Mirage"]),
      styleAdvantageScore: 0.48,
      awpMatchupScore: 0.5,
      entryMatchupScore: 0.49,
      vetoPunishScore: 0.46,
      overtimeMatchupScore: 0.5,
      closingMatchupScore: 0.49,
      confidenceScore: 0.68,
      createdAt: now
    },
    teamStyleA: {
      teamId: "teamA",
      period: "last_90_days",
      aggressionScore: 0.58,
      defaultHeavyScore: 0.54,
      executeHeavyScore: 0.56,
      awpDependencyScore: 0.56,
      entryDependencyScore: 0.57,
      pistolDependencyScore: 0.55,
      forceBuyStrength: 0.52,
      ctSideStrength: 0.55,
      tSideStrength: 0.53,
      retakeStrength: 0.54,
      clutchStrength: 0.57,
      tempoScore: 0.58,
      volatilityScore: 0.26,
      createdAt: now
    },
    teamStyleB: {
      teamId: "teamB",
      period: "last_90_days",
      aggressionScore: 0.52,
      defaultHeavyScore: 0.56,
      executeHeavyScore: 0.51,
      awpDependencyScore: 0.5,
      entryDependencyScore: 0.5,
      pistolDependencyScore: 0.51,
      forceBuyStrength: 0.48,
      ctSideStrength: 0.51,
      tSideStrength: 0.5,
      retakeStrength: 0.49,
      clutchStrength: 0.5,
      tempoScore: 0.51,
      volatilityScore: 0.32,
      createdAt: now
    },
    dataWindows: [
      {
        matchId: "match_test",
        teamId: "teamA",
        windowType: "current_roster_only",
        startedAt: "2025-10-01T08:00:00.000Z",
        endedAt: now,
        rosterVersionId: "roster_teamA",
        gameMetaVersionId: "meta",
        mapPoolVersionId: "pool",
        matchesCount: 12,
        mapsCount: 28,
        dataQualityScore: 82,
        relevanceScore: 0.82,
        summaryJson: "{}"
      },
      {
        matchId: "match_test",
        teamId: "teamB",
        windowType: "current_roster_only",
        startedAt: "2025-10-01T08:00:00.000Z",
        endedAt: now,
        rosterVersionId: "roster_teamB",
        gameMetaVersionId: "meta",
        mapPoolVersionId: "pool",
        matchesCount: 12,
        mapsCount: 28,
        dataQualityScore: 82,
        relevanceScore: 0.76,
        summaryJson: "{}"
      }
    ],
    sourceConflicts: [],
    ...overrides
  };
}
