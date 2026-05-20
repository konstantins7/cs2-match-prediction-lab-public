export type NumericWeights = {
  elo: number;
  maps: number;
  synergy: number;
};

export type AnalysisParams = {
  matchId: string;
  teamA?: string;
  teamB?: string;
  periodDays: number;
  decayDays: number;
  version: number;
  weights: NumericWeights;
};

export type RosterRow = {
  matchId: string;
  teamName: string;
  nickname: string;
  role?: string;
  country?: string;
  collectedAt?: string;
  period?: string;
  sampleSize?: number;
  confidence?: number;
};

export type PlayerStatsRow = {
  matchId: string;
  teamName: string;
  nickname: string;
  mapName?: string;
  maps: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  rating: number;
  adr: number;
  kast: number;
  impact: number;
  collectedAt?: string;
  period?: string;
  sampleSize?: number;
  confidence?: number;
};

export type MapStatsRow = {
  matchId: string;
  teamName: string;
  mapName: string;
  mapsPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  roundsWon: number;
  roundsLost: number;
  ctRoundWinRate: number;
  tRoundWinRate: number;
  pickRate: number;
  banRate: number;
  deciderRate: number;
  collectedAt?: string;
  period?: string;
  sampleSize?: number;
  confidence?: number;
};

export type H2hRow = {
  matchId: string;
  date: string;
  teamA: string;
  teamB: string;
  winner: string;
  mapName: string;
  scoreA: number;
  scoreB: number;
  sampleSize?: number;
  confidence?: number;
};

export type PrivateAnalysisData = {
  roster: RosterRow[];
  playerStats: PlayerStatsRow[];
  mapStats: MapStatsRow[];
  h2h: H2hRow[];
  parsedDemo: ParsedDemoSummary | null;
  fingerprint: string;
  warnings: string[];
};

export type ParsedDemoSummary = {
  pistolRounds: number;
  pistolRoundWinRateA?: number;
  pistolRoundWinRateB?: number;
  ctRoundWinRateA?: number;
  ctRoundWinRateB?: number;
  tRoundWinRateA?: number;
  tRoundWinRateB?: number;
};

export type PlayerMapEfficiency = {
  teamName: string;
  nickname: string;
  mapName: string;
  rating: number;
  adr: number;
  kast: number;
  impact: number;
  normalizedRating: number;
  trendSlope: number;
  movingAverage: Array<{ day: string; value: number }>;
  sampleSize: number;
  warnings: string[];
};

export type TeamSynergy = {
  teamName: string;
  pairCorrelations: Array<{ playerA: string; playerB: string; correlation: number; sampleSize: number }>;
  rosterStability: number;
  leaderEffect: number;
  roleDiversity: number | null;
  warnings: string[];
};

export type MapProbability = {
  mapName: string;
  teamAWinProbability: number;
  teamBWinProbability: number;
  teamAWinRate: number;
  teamBWinRate: number;
  teamASample: number;
  teamBSample: number;
  globalPrior: number;
  warnings: string[];
};

export type DeepMatchAnalysis = {
  matchId: string;
  version: number;
  generatedAt: string;
  cache: "hit" | "miss";
  params: AnalysisParams;
  dataQuality: {
    level: "green" | "yellow" | "red";
    score: number;
    sampleSummary: Record<string, number>;
    warnings: string[];
  };
  playerMapEfficiency: PlayerMapEfficiency[];
  teamSynergy: TeamSynergy[];
  mapProbabilities: MapProbability[];
  elo: {
    teams: Record<string, number>;
    players: Record<string, number>;
    warnings: string[];
  };
  prediction: {
    teamA: string;
    teamB: string;
    teamAProbability: number;
    components: { elo: number; maps: number; synergy: number };
    weights: NumericWeights;
    warnings: string[];
  };
  parsedDemo: ParsedDemoSummary | null;
  scientificFactors: Array<{
    id: string;
    label: string;
    status: "available" | "partial" | "missing";
    impact: number;
    explanation: string;
    warnings: string[];
    details: Record<string, unknown>;
  }>;
  aiEvidenceSummary: Array<{
    block: string;
    rows: number;
    confidenceMin: number;
    confidenceMax: number;
    sourceSite: string;
    extractedAt: string;
    promptVersion: string;
    modifiedAfterAi: boolean;
  }>;
  outliers: Array<{ scope: string; id: string; value: number; zScore: number }>;
  csv: string;
};
