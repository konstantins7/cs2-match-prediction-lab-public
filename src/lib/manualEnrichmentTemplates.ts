export const manualEnrichmentTemplates = {
  manual_real_pack: {
    type: "manual_real_pack",
    matchId: "pandascore_match_1474573",
    sourceName: "",
    collectedAt: "",
    period: "",
    sampleSize: 0,
    confidence: 0,
    rosters: {},
    playerStats: [],
    mapStats: [],
    vetoHistory: [],
    h2h: [],
    news: []
  },
  roster: {
    matchId: "pandascore_match_1474573",
    type: "roster",
    sourceName: "",
    sourceUrl: "",
    collectedAt: "2026-05-13T00:00:00Z",
    period: "current_roster",
    sampleSize: 0,
    confidence: 0.5,
    notes: "Manual real roster. User is responsible for source accuracy.",
    teams: {
      Monte: [],
      G2: []
    }
  },
  player_stats: {
    matchId: "pandascore_match_1474573",
    type: "player_stats",
    sourceName: "",
    sourceUrl: "",
    collectedAt: "2026-05-13T00:00:00Z",
    period: "last_30_days",
    sampleSize: 0,
    confidence: 0.5,
    notes: "Manual real player stats. Fill only verified values.",
    players: []
  },
  map_stats: {
    matchId: "pandascore_match_1474573",
    type: "map_stats",
    sourceName: "",
    sourceUrl: "",
    collectedAt: "2026-05-13T00:00:00Z",
    period: "last_90_days",
    sampleSize: 0,
    confidence: 0.5,
    notes: "Manual real map stats. mapName must be in active pool.",
    teams: []
  },
  veto_history: {
    matchId: "pandascore_match_1474573",
    type: "veto_history",
    sourceName: "",
    sourceUrl: "",
    collectedAt: "2026-05-13T00:00:00Z",
    period: "last_90_days",
    sampleSize: 0,
    confidence: 0.5,
    notes: "Manual real veto history.",
    teams: []
  },
  h2h: {
    matchId: "pandascore_match_1474573",
    type: "h2h",
    sourceName: "",
    sourceUrl: "",
    collectedAt: "2026-05-13T00:00:00Z",
    period: "current_roster_h2h",
    sampleSize: 0,
    confidence: 0.5,
    notes: "Manual real H2H.",
    entries: []
  },
  news: {
    matchId: "pandascore_match_1474573",
    type: "news",
    sourceName: "",
    sourceUrl: "",
    collectedAt: "2026-05-13T00:00:00Z",
    period: "latest",
    sampleSize: 0,
    confidence: 0.5,
    notes: "Manual real news/roster events.",
    items: []
  },
  parsed_demo: {
    matchId: "pandascore_match_1474573",
    type: "parsed_demo",
    source: "parsed_demo",
    dataRole: "historical_team_form",
    sourceName: "",
    sourceUrl: "",
    collectedAt: "",
    sourceDate: "",
    sourceMatchId: "",
    period: "",
    sampleSize: 0,
    confidence: 0.5,
    notes: "Empty parsed_demo template. Fill only verified parsed demo or historical evidence values; template data cannot be applied.",
    metadata: {
      sourceName: "",
      sourceUrl: "",
      collectedAt: "",
      period: "",
      sampleSize: 0,
      confidence: 0.5,
      dataRole: "historical_team_form",
      notes: "Use pre_match_evidence or historical_team_form for future-match forecasts. post_match_analysis/backtest_only will not count as real forecast evidence."
    },
    teams: [],
    playerStats: [],
    mapStats: [],
    vetoHistory: [],
    teamForms: [],
    roundEconomy: []
  },
  analyst_pack: {
    matchId: "pandascore_match_1474573",
    type: "analyst_pack",
    source: "analyst_sample",
    rosters: {
      Monte: ["Monte sample AWP", "Monte sample Entry", "Monte sample IGL", "Monte sample Support", "Monte sample Star"],
      G2: ["G2 sample AWP", "G2 sample Entry", "G2 sample IGL", "G2 sample Support", "G2 sample Star"]
    },
    playerStats: [
      { team: "Monte", nickname: "Monte sample AWP", kd: 1.03, rating: 1.04, adr: 73, kast: 70, impact: 1.02, maps: 14 },
      { team: "Monte", nickname: "Monte sample Entry", kd: 0.98, rating: 1.0, adr: 71, kast: 68, impact: 1.04, maps: 14 },
      { team: "Monte", nickname: "Monte sample IGL", kd: 0.94, rating: 0.97, adr: 66, kast: 69, impact: 0.93, maps: 14 },
      { team: "Monte", nickname: "Monte sample Support", kd: 0.99, rating: 1.01, adr: 69, kast: 73, impact: 0.98, maps: 14 },
      { team: "Monte", nickname: "Monte sample Star", kd: 1.08, rating: 1.09, adr: 78, kast: 72, impact: 1.13, maps: 14 },
      { team: "G2", nickname: "G2 sample AWP", kd: 1.18, rating: 1.16, adr: 79, kast: 74, impact: 1.2, maps: 16 },
      { team: "G2", nickname: "G2 sample Entry", kd: 1.06, rating: 1.08, adr: 77, kast: 71, impact: 1.14, maps: 16 },
      { team: "G2", nickname: "G2 sample IGL", kd: 0.99, rating: 1.01, adr: 69, kast: 72, impact: 0.98, maps: 16 },
      { team: "G2", nickname: "G2 sample Support", kd: 1.02, rating: 1.04, adr: 71, kast: 75, impact: 1.0, maps: 16 },
      { team: "G2", nickname: "G2 sample Star", kd: 1.22, rating: 1.19, adr: 83, kast: 76, impact: 1.24, maps: 16 }
    ],
    mapStats: [
      { team: "Monte", mapName: "Mirage", mapsPlayed: 10, winRate: 54, pickRate: 20, banRate: 12, ctRoundWinRate: 50, tRoundWinRate: 49 },
      { team: "Monte", mapName: "Ancient", mapsPlayed: 11, winRate: 50, pickRate: 18, banRate: 14, ctRoundWinRate: 49, tRoundWinRate: 48 },
      { team: "Monte", mapName: "Nuke", mapsPlayed: 8, winRate: 47, pickRate: 12, banRate: 20, ctRoundWinRate: 48, tRoundWinRate: 45 },
      { team: "Monte", mapName: "Inferno", mapsPlayed: 9, winRate: 49, pickRate: 11, banRate: 18, ctRoundWinRate: 48, tRoundWinRate: 47 },
      { team: "Monte", mapName: "Anubis", mapsPlayed: 7, winRate: 46, pickRate: 9, banRate: 24, ctRoundWinRate: 46, tRoundWinRate: 47 },
      { team: "Monte", mapName: "Dust2", mapsPlayed: 8, winRate: 48, pickRate: 10, banRate: 18, ctRoundWinRate: 47, tRoundWinRate: 48 },
      { team: "Monte", mapName: "Train", mapsPlayed: 6, winRate: 45, pickRate: 8, banRate: 26, ctRoundWinRate: 45, tRoundWinRate: 46 },
      { team: "G2", mapName: "Mirage", mapsPlayed: 14, winRate: 62, pickRate: 24, banRate: 8, ctRoundWinRate: 54, tRoundWinRate: 52 },
      { team: "G2", mapName: "Ancient", mapsPlayed: 13, winRate: 59, pickRate: 20, banRate: 10, ctRoundWinRate: 53, tRoundWinRate: 50 },
      { team: "G2", mapName: "Nuke", mapsPlayed: 12, winRate: 57, pickRate: 16, banRate: 12, ctRoundWinRate: 52, tRoundWinRate: 49 },
      { team: "G2", mapName: "Inferno", mapsPlayed: 11, winRate: 56, pickRate: 13, banRate: 14, ctRoundWinRate: 51, tRoundWinRate: 50 },
      { team: "G2", mapName: "Anubis", mapsPlayed: 10, winRate: 55, pickRate: 12, banRate: 16, ctRoundWinRate: 50, tRoundWinRate: 51 },
      { team: "G2", mapName: "Dust2", mapsPlayed: 9, winRate: 53, pickRate: 10, banRate: 17, ctRoundWinRate: 50, tRoundWinRate: 49 },
      { team: "G2", mapName: "Train", mapsPlayed: 8, winRate: 52, pickRate: 7, banRate: 22, ctRoundWinRate: 49, tRoundWinRate: 49 }
    ],
    vetoHistory: [
      { team: "Monte", mapName: "Mirage", pickRate: 20, banRate: 12, deciderRate: 14, sampleSize: 14, comfortScore: 54 },
      { team: "Monte", mapName: "Ancient", pickRate: 18, banRate: 14, deciderRate: 16, sampleSize: 14, comfortScore: 51 },
      { team: "Monte", mapName: "Nuke", pickRate: 12, banRate: 20, deciderRate: 12, sampleSize: 12, comfortScore: 47 },
      { team: "Monte", mapName: "Inferno", pickRate: 11, banRate: 18, deciderRate: 11, sampleSize: 12, comfortScore: 49 },
      { team: "Monte", mapName: "Anubis", pickRate: 9, banRate: 24, deciderRate: 8, sampleSize: 10, comfortScore: 46 },
      { team: "Monte", mapName: "Dust2", pickRate: 10, banRate: 18, deciderRate: 10, sampleSize: 10, comfortScore: 48 },
      { team: "Monte", mapName: "Train", pickRate: 8, banRate: 26, deciderRate: 7, sampleSize: 8, comfortScore: 45 },
      { team: "G2", mapName: "Mirage", pickRate: 24, banRate: 8, deciderRate: 20, sampleSize: 16, comfortScore: 62 },
      { team: "G2", mapName: "Ancient", pickRate: 20, banRate: 10, deciderRate: 18, sampleSize: 16, comfortScore: 59 },
      { team: "G2", mapName: "Nuke", pickRate: 16, banRate: 12, deciderRate: 15, sampleSize: 15, comfortScore: 57 },
      { team: "G2", mapName: "Inferno", pickRate: 13, banRate: 14, deciderRate: 13, sampleSize: 14, comfortScore: 56 },
      { team: "G2", mapName: "Anubis", pickRate: 12, banRate: 16, deciderRate: 12, sampleSize: 13, comfortScore: 55 },
      { team: "G2", mapName: "Dust2", pickRate: 10, banRate: 17, deciderRate: 10, sampleSize: 11, comfortScore: 53 },
      { team: "G2", mapName: "Train", pickRate: 7, banRate: 22, deciderRate: 8, sampleSize: 9, comfortScore: 52 }
    ],
    h2h: [
      { date: "2026-05-01T00:00:00Z", format: "BO3", winner: "G2", teamARosterSimilarity: 0.78, teamBRosterSimilarity: 0.8, relevanceScore: 0.62, notes: "Sample H2H for pipeline validation only" }
    ],
    news: [
      { team: "G2", title: "Sample analyst note", summary: "Synthetic sample note for pipeline validation only.", reliability: "official", impactScore: 1, publishedAt: "2026-05-13T00:00:00Z", sourceUrl: "" }
    ]
  }
};
