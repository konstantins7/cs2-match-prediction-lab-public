export type RiskLevel = "Low" | "Medium" | "High";

export type PredictionReadinessLevel =
  | "L0_FIXTURE_ONLY"
  | "L1_BASIC_CONTEXT"
  | "L2_BASIC_PREDICTION"
  | "L3_ANALYTICAL"
  | "L4_DEEP";

export type PredictionReadiness = {
  level: PredictionReadinessLevel;
  label: string;
  score: number;
  isActionable: boolean;
  reasons: string[];
  missingCriticalData: string[];
  nextBestActions: string[];
};

export type WeightKey =
  | "teamStrength"
  | "recentForm"
  | "playerForm"
  | "kdTrend"
  | "mapPool"
  | "veto"
  | "overtime"
  | "closing"
  | "comeback"
  | "economy"
  | "headToHead"
  | "newsImpact"
  | "fatigue"
  | "lanOnline"
  | "format"
  | "dataQuality"
  | "metaShift"
  | "dataRelevance"
  | "transferAdaptation"
  | "communication"
  | "chemistry"
  | "roleChange"
  | "positionChange"
  | "playerSystemFit"
  | "leadership"
  | "honeymoon"
  | "coreStability"
  | "roleConflict"
  | "opponentMatchup"
  | "basicRanking"
  | "basicRecentResults"
  | "tournamentImportance"
  | "teamKnownness"
  | "fixtureConfidence"
  | "unknownDataPenalty";

export type ModelWeights = Record<WeightKey, number>;

export type Evidence = {
  metric: string;
  period: string;
  sampleSize: number;
  teamAValue: number | string;
  teamBValue: number | string;
  source: string;
  note: string;
};

export type PredictionFactorOutput = {
  factorName: string;
  factorGroup: string;
  teamAValue: number;
  teamBValue: number;
  rawDifference: number;
  normalizedDifference: number;
  weight: number;
  impact: number;
  confidence: number;
  explanation: string;
  evidence: Evidence[];
  warnings: string[];
};

export type VetoScenario = {
  name: "likely scenario" | "best case Team A" | "best case Team B";
  likelyBans: string[];
  likelyPicks: string[];
  likelyDecider: string;
  mapAdvantage: number;
  vetoConfidence: number;
  hiddenDanger: string;
  explanation: string;
};

export type TeamEntity = {
  id: string;
  name: string;
  slug: string;
  country: string;
  region: string;
  hltvReferenceUrl?: string | null;
  liquipediaReferenceUrl?: string | null;
  pandaScoreId?: string | null;
  gridId?: string | null;
  valveRank?: number | null;
  hltvRank?: number | null;
  internalElo: number;
  topRankCategory: string;
  sourceMode?: string;
  sourceConfidence?: number;
  needsReview?: boolean;
  isAcademyTeam?: boolean;
  parentOrgName?: string | null;
  teamPriority?: number;
  visibilityTier?: string;
  rankSnapshots?: Array<{
    source: string;
    rank: number;
    points?: number | null;
    region?: string | null;
    rankingDate: Date | string;
    rankCategory: string;
    confidence: number;
  }>;
  isActive: boolean;
};

export type PlayerEntity = {
  id: string;
  nickname: string;
  realName?: string | null;
  teamId?: string | null;
  role: string;
  country: string;
  age?: number | null;
  isActive: boolean;
  joinedAt?: Date | string | null;
  leftAt?: Date | string | null;
  sourceMode?: string;
  sourceConfidence?: number;
  needsReview?: boolean;
  matchId?: string | null;
  importBatchId?: string | null;
  sourceRecordId?: string | null;
};

export type MatchEntity = {
  id: string;
  source?: string;
  sourceMatchId?: string | null;
  eventName: string;
  eventTier: string;
  stage: string;
  startTime: Date | string;
  status: string;
  format: string;
  isOfficial: boolean;
  isLan: boolean;
  teamAId: string;
  teamBId: string;
  winnerTeamId?: string | null;
  matchUrl?: string | null;
  dataQualityScore: number;
  sourceMode?: string;
  sourceConfidence?: number;
  needsReview?: boolean;
  isPinned?: boolean;
  manualPriority?: number | null;
  manualVisibility?: string | null;
};

export type TeamFormEntity = {
  teamId: string;
  period: string;
  matchesPlayed: number;
  mapsPlayed: number;
  matchWinRate: number;
  mapWinRate: number;
  roundWinRate: number;
  vsTop10WinRate: number;
  vsTop20WinRate: number;
  vsTop50WinRate: number;
  vsTop100WinRate: number;
  winVsTop10: number;
  winVsTop20: number;
  winVsTop50: number;
  winVsTop100: number;
  lossVsLowerRanked: number;
  opponentStrengthAdjustedForm: number;
  currentStreak: number;
  formScore: number;
  volatilityScore: number;
  matchesLast7Days: number;
  mapsLast7Days: number;
  travelRiskScore: number;
  timezoneShiftHours: number;
  fatigueScore: number;
  lanWinRate: number;
  onlineWinRate: number;
  motivationScore: number;
  rosterStabilityScore: number;
  closeOutRate: number;
  mapPointConversion: number;
  leadProtectionScore: number;
  lostFromWinningPositionRate: number;
  deciderCollapseRate: number;
  seriesCloseOutRate: number;
  comebackFrom3RoundDeficit: number;
  comebackFrom5RoundDeficit: number;
  badHalfRecovery: number;
  lostPistolRecovery: number;
  lostOwnPickRecovery: number;
  createdAt?: Date | string;
};

export type TeamBasicResultEntity = {
  teamId: string;
  period: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  vsRankedWins: number;
  vsRankedLosses: number;
  averageOpponentRank?: number | null;
  lastMatchAt?: Date | string | null;
  source: string;
  dataQuality: number;
  createdAt?: Date | string;
};

export type PlayerStatEntity = {
  playerId: string;
  teamId: string;
  period: string;
  maps: number;
  rounds: number;
  kd: number;
  kdDiff: number;
  rating: number;
  adr: number;
  kast: number;
  impact: number;
  openingKillRating: number;
  clutchScore: number;
  volatilityScore: number;
  pressureScore: number;
  trendScore: number;
  ratingTrend: number;
  kdTrend: number;
  adrTrend: number;
  openingDuelTrend: number;
  clutchTrend: number;
  pressurePerformance: number;
  mapSpecificPerformance: number;
  roleImpact: number;
  starDependency: number;
  worstPlayerLiability: number;
  lanRating: number;
  onlineRating: number;
  source: string;
  sourceUrl?: string | null;
  matchId?: string | null;
  importBatchId?: string | null;
  sourceRecordId?: string | null;
  isActive?: boolean;
  createdAt?: Date | string;
};

export type TeamMapStatEntity = {
  teamId: string;
  mapName: string;
  period: string;
  mapsPlayed: number;
  winRate: number;
  pickRate: number;
  banRate: number;
  firstPickRate: number;
  deciderRate: number;
  ctRoundWinRate: number;
  tRoundWinRate: number;
  pistolWinRate: number;
  conversionAfterPistolWin: number;
  forceBuyWinRate: number;
  antiEcoLossRate: number;
  overtimeWinRate: number;
  multipleOvertimeWinRate: number;
  overtimeFrequency: number;
  pressureRoundWinRate: number;
  clutchInOvertimeScore: number;
  closingScore: number;
  comebackScore: number;
  ecoRecoveryScore: number;
  resetResistanceScore: number;
  recentTrend: number;
  openingRoundPerformance: number;
  sampleQuality: number;
  source: string;
  sourceUrl?: string | null;
  matchId?: string | null;
  importBatchId?: string | null;
  sourceRecordId?: string | null;
  isActive?: boolean;
  createdAt?: Date | string;
};

export type VetoPatternEntity = {
  teamId: string;
  opponentTeamId?: string | null;
  format: string;
  period: string;
  mapName: string;
  pickProbability: number;
  banProbability: number;
  punishProbability: number;
  weaknessScore: number;
  comfortScore: number;
  confidenceScore: number;
  source?: string;
  matchId?: string | null;
  importBatchId?: string | null;
  sourceRecordId?: string | null;
  isActive?: boolean;
};

export type HeadToHeadEntity = {
  teamAId: string;
  teamBId: string;
  matchId: string;
  date: Date | string;
  format: string;
  winnerTeamId?: string | null;
  teamARosterSimilarity: number;
  teamBRosterSimilarity: number;
  relevanceScore: number;
  notes?: string | null;
  source?: string;
  importBatchId?: string | null;
  sourceRecordId?: string | null;
  isActive?: boolean;
};

export type NewsEntity = {
  teamId?: string | null;
  playerId?: string | null;
  title: string;
  summary: string;
  source: string;
  url?: string | null;
  publishedAt: Date | string;
  reliability: string;
  eventType: string;
  sentiment: string;
  impactScore: number;
  maxAllowedImpact: number;
  isRumor: boolean;
  isOfficial: boolean;
  matchId?: string | null;
  importBatchId?: string | null;
  sourceRecordId?: string | null;
  isActive?: boolean;
};

export type GameMetaEntity = {
  id: string;
  patchDate: Date | string;
  patchName: string;
  patchType: string;
  affectedAreas: string;
  impactScore: number;
  description: string;
};

export type RosterVersionEntity = {
  teamId: string;
  startedAt: Date | string;
  endedAt?: Date | string | null;
  playerIdsJson: string;
  coachId?: string | null;
  iglPlayerId?: string | null;
  mainLanguage: string;
  coreStabilityScore: number;
  mapsPlayedTogether: number;
  matchesPlayedTogether: number;
};

export type PlayerTeamHistoryEntity = {
  playerId: string;
  teamId: string;
  joinedAt: Date | string;
  leftAt?: Date | string | null;
  role: string;
  mainPositionsJson: string;
  mapsPlayed: number;
  rating: number;
  kd: number;
};

export type PlayerRoleSnapshotEntity = {
  playerId: string;
  teamId: string;
  date: Date | string;
  role: string;
  mapName: string;
  positionsJson: string;
  openingDuelRate: number;
  clutchRate: number;
  adr: number;
  rating: number;
  kd: number;
};

export type TeamChemistryEntity = {
  teamId: string;
  date: Date | string;
  rosterVersionId: string;
  sharedExperienceScore: number;
  languageCompatibilityScore: number;
  roleFitScore: number;
  coreStabilityScore: number;
  adaptationScore: number;
  volatilityScore: number;
  notes?: string | null;
};

export type RosterEventEntity = {
  teamId: string;
  playerId?: string | null;
  eventType: string;
  eventDate: Date | string;
  oldTeamId?: string | null;
  newTeamId?: string | null;
  oldRole?: string | null;
  newRole?: string | null;
  oldPositionsJson?: string | null;
  newPositionsJson?: string | null;
  expectedImpact: number;
  confidence: number;
};

export type MapVersionEntity = {
  mapName: string;
  versionName: string;
  startedAt: Date | string;
  endedAt?: Date | string | null;
  changeType: string;
  impactScore: number;
  description: string;
};

export type ActiveMapPoolEntity = {
  name: string;
  startedAt: Date | string;
  endedAt?: Date | string | null;
  mapsJson: string;
  notes?: string | null;
};

export type OpponentMatchupProfileEntity = {
  teamId: string;
  opponentTeamId: string;
  period: string;
  rosterSimilarity: number;
  matchesPlayed: number;
  mapsPlayed: number;
  matchWinRate: number;
  mapWinRate: number;
  averageRoundDiff: number;
  favoriteMapsJson: string;
  weakMapsJson: string;
  styleAdvantageScore: number;
  awpMatchupScore: number;
  entryMatchupScore: number;
  vetoPunishScore: number;
  overtimeMatchupScore: number;
  closingMatchupScore: number;
  confidenceScore: number;
  createdAt?: Date | string;
};

export type TeamStyleSnapshotEntity = {
  teamId: string;
  period: string;
  aggressionScore: number;
  defaultHeavyScore: number;
  executeHeavyScore: number;
  awpDependencyScore: number;
  entryDependencyScore: number;
  pistolDependencyScore: number;
  forceBuyStrength: number;
  ctSideStrength: number;
  tSideStrength: number;
  retakeStrength: number;
  clutchStrength: number;
  tempoScore: number;
  volatilityScore: number;
  createdAt?: Date | string;
};

export type PredictionDataWindowEntity = {
  matchId: string;
  teamId: string;
  windowType: string;
  startedAt: Date | string;
  endedAt: Date | string;
  rosterVersionId?: string | null;
  gameMetaVersionId?: string | null;
  mapPoolVersionId?: string | null;
  matchesCount: number;
  mapsCount: number;
  dataQualityScore: number;
  relevanceScore: number;
  summaryJson: string;
};

export type SourceConflictEntity = {
  source: string;
  entityType: string;
  externalId: string;
  externalName: string;
  matchedEntityId?: string | null;
  confidence: number;
  status: string;
};

export type DataCoverageStatus = "fresh" | "aging" | "stale" | "unknown";

export type DataCoverage = {
  fixtureData: boolean;
  rankData: boolean;
  recentMatches: boolean;
  teamFormSnapshots: boolean;
  playerRoster: boolean;
  playerStats: boolean;
  mapStats: boolean;
  vetoHistory: boolean;
  h2h: boolean;
  newsOrRosterEvents: boolean;
  sourceConflicts: boolean;
  fixtureOnly: boolean;
  rankingOnly: boolean;
  rankingAndBasicResults: boolean;
  bothTeamsUnranked: boolean;
  lastPandaScoreSyncAt?: Date | string | null;
  lastValveSyncAt?: Date | string | null;
  lastCsUpdatesSyncAt?: Date | string | null;
  lastSourceSyncAt?: Date | string | null;
  lastPredictionCalculatedAt?: Date | string | null;
  freshnessStatus: DataCoverageStatus;
  known: string[];
  missing: string[];
};

export type PredictionInput = {
  match: MatchEntity;
  teamA: TeamEntity;
  teamB: TeamEntity;
  playersA: PlayerEntity[];
  playersB: PlayerEntity[];
  teamFormA?: TeamFormEntity | null;
  teamFormB?: TeamFormEntity | null;
  basicResultA?: TeamBasicResultEntity | null;
  basicResultB?: TeamBasicResultEntity | null;
  playerStatsA: PlayerStatEntity[];
  playerStatsB: PlayerStatEntity[];
  mapStatsA: TeamMapStatEntity[];
  mapStatsB: TeamMapStatEntity[];
  vetoPatternsA: VetoPatternEntity[];
  vetoPatternsB: VetoPatternEntity[];
  h2h: HeadToHeadEntity[];
  news: NewsEntity[];
  modelWeights: ModelWeights;
  gameMetaVersions: GameMetaEntity[];
  rosterVersionA?: RosterVersionEntity | null;
  rosterVersionB?: RosterVersionEntity | null;
  chemistryA?: TeamChemistryEntity | null;
  chemistryB?: TeamChemistryEntity | null;
  rosterEventsA: RosterEventEntity[];
  rosterEventsB: RosterEventEntity[];
  playerHistoriesA: PlayerTeamHistoryEntity[];
  playerHistoriesB: PlayerTeamHistoryEntity[];
  roleSnapshotsA: PlayerRoleSnapshotEntity[];
  roleSnapshotsB: PlayerRoleSnapshotEntity[];
  mapVersions: MapVersionEntity[];
  activeMapPool?: ActiveMapPoolEntity | null;
  opponentMatchupA?: OpponentMatchupProfileEntity | null;
  opponentMatchupB?: OpponentMatchupProfileEntity | null;
  teamStyleA?: TeamStyleSnapshotEntity | null;
  teamStyleB?: TeamStyleSnapshotEntity | null;
  dataWindows: PredictionDataWindowEntity[];
  sourceConflicts: SourceConflictEntity[];
  dataCoverage?: DataCoverage;
};

export type RiskConfidenceBreakdown = {
  confidenceDrivers: string[];
  confidenceReducers: string[];
  missingData: string[];
  conflictingFactors: string[];
  riskReasons: string[];
};

export type PredictionOutput = {
  teamAProbability: number;
  teamBProbability: number;
  predictedWinnerId: string;
  confidenceScore: number;
  riskLevel: RiskLevel;
  dataQualityScore: number;
  factors: PredictionFactorOutput[];
  explanation: string;
  warnings: string[];
  evidence: Evidence[];
  vetoScenarios: VetoScenario[];
  riskBreakdown: RiskConfidenceBreakdown;
  modelVersion: string;
  rawScore: number;
  probabilityCap?: {
    cap: number;
    reasons: string[];
  };
  readiness: PredictionReadiness;
};
