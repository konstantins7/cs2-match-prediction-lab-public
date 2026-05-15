export const parsedDemoSourceTools = ["cs_demo_manager", "awpy", "demoparser", "demoinfocs", "custom"] as const;

export type ParsedDemoSourceTool = (typeof parsedDemoSourceTools)[number];

export const parsedDemoDataRoles = [
  "historical_team_form",
  "pre_match_evidence",
  "post_match_analysis",
  "backtest_only"
] as const;

export type ParsedDemoExportDataRole = (typeof parsedDemoDataRoles)[number];

export type ParsedDemoExportProfileNote = {
  sourceTool: ParsedDemoSourceTool;
  label: string;
  expectedFields: string[];
  targetRecords: string[];
  forecastImpact: string;
  mappingNotes: string[];
};

export const PARSED_DEMO_EXPORT_PROFILE_NOTES: ParsedDemoExportProfileNote[] = [
  {
    sourceTool: "cs_demo_manager",
    label: "CS Demo Manager",
    expectedFields: ["teams", "players", "maps", "rounds/economy if exported", "source metadata"],
    targetRecords: ["PlayerStatSnapshot", "TeamMapStat", "TeamFormSnapshot proxy", "VetoPattern when provided", "HeadToHead when provided"],
    forecastImpact: "Хороший бесплатный путь к player/map context. XLSX/SQL импорт остаётся future/inactive.",
    mappingNotes: ["kills/deaths/assists/rating/adr -> PlayerStatSnapshot", "map winrate/rounds -> TeamMapStat", "economy/pistol summaries -> TeamFormSnapshot proxy"]
  },
  {
    sourceTool: "awpy",
    label: "Awpy",
    expectedFields: ["players", "rounds", "maps", "economy/pistol if normalized", "parser metadata"],
    targetRecords: ["PlayerStatSnapshot", "TeamMapStat", "TeamFormSnapshot proxy"],
    forecastImpact: "Может дать deep round/economy evidence, но только из заранее подготовленного JSON.",
    mappingNotes: ["round events -> round/economy proxy", "player aggregates -> PlayerStatSnapshot", "map aggregates -> TeamMapStat"]
  },
  {
    sourceTool: "demoparser",
    label: "demoparser / demoparser2",
    expectedFields: ["players", "maps", "rounds", "economy", "pistol/overtime if available"],
    targetRecords: ["PlayerStatSnapshot", "TeamMapStat", "TeamFormSnapshot proxy"],
    forecastImpact: "Самый прямой JSON-first путь к demo-derived player/map/round evidence без raw .dem worker.",
    mappingNotes: ["kills/deaths/adr/rating -> PlayerStatSnapshot", "round/economy/pistol/overtime -> TeamFormSnapshot proxy", "mapName must be active CS2 map"]
  },
  {
    sourceTool: "demoinfocs",
    label: "demoinfocs",
    expectedFields: ["rounds", "economy", "players if aggregated", "parser metadata"],
    targetRecords: ["TeamFormSnapshot proxy", "PlayerStatSnapshot when player aggregates are present"],
    forecastImpact: "Подходит для prepared worker output. Сам worker и raw .dem parsing пока future/inactive.",
    mappingNotes: ["round/economy summaries -> TeamFormSnapshot proxy", "optional player aggregates -> PlayerStatSnapshot"]
  },
  {
    sourceTool: "custom",
    label: "Custom parsed JSON",
    expectedFields: ["canonical parsed_demo_export shape", "teams", "players", "at least one useful stat block"],
    targetRecords: ["PlayerStatSnapshot", "TeamMapStat", "TeamFormSnapshot", "VetoPattern", "HeadToHead"],
    forecastImpact: "Универсальный путь для нормализованного JSON из внешних stat/demo tools.",
    mappingNotes: ["Use exact match team names or ids", "Use sourceDate/collectedAt cutoff correctly", "post_match_analysis is not pre-match evidence"]
  }
];

export function getParsedDemoProfileNote(sourceTool: string) {
  return PARSED_DEMO_EXPORT_PROFILE_NOTES.find((profile) => profile.sourceTool === sourceTool) ?? PARSED_DEMO_EXPORT_PROFILE_NOTES[4];
}

export function parsedDemoExportTemplate(matchId = "pandascore_match_1474573", sourceTool: ParsedDemoSourceTool = "custom") {
  return {
    type: "parsed_demo_export",
    sourceTool,
    matchId,
    dataRole: "historical_team_form",
    sourceName: "",
    collectedAt: "",
    period: "",
    sampleSize: 0,
    confidence: 0,
    teams: [
      { teamId: "", teamName: "" },
      { teamId: "", teamName: "" }
    ],
    players: [
      {
        teamName: "",
        nickname: "",
        maps: 0,
        rounds: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        rating: 0,
        adr: 0,
        kast: 0
      }
    ],
    maps: [
      {
        teamName: "",
        mapName: "",
        mapsPlayed: 0,
        winRate: 0,
        ctRoundWinRate: 0,
        tRoundWinRate: 0
      }
    ],
    rounds: [],
    economy: [],
    pistol: [],
    overtime: [],
    vetoHistory: [],
    h2h: [],
    teamForms: []
  };
}

export function parsedDemoExportExample(matchId = "pandascore_match_1474573", sourceTool: ParsedDemoSourceTool = "custom") {
  return {
    type: "parsed_demo_export",
    sourceTool,
    matchId,
    dataRole: "historical_team_form",
    sourceName: "Analyst demo export",
    collectedAt: "2026-05-01T10:00:00.000Z",
    period: "last_30_days",
    sampleSize: 6,
    confidence: 0.74,
    teams: [
      { teamName: "Team A" },
      { teamName: "Team B" }
    ],
    players: [
      { teamName: "Team A", nickname: "player_a_1", maps: 6, rounds: 144, kills: 112, deaths: 91, assists: 28, rating: 1.14, adr: 78.4, kast: 73 },
      { teamName: "Team B", nickname: "player_b_1", maps: 6, rounds: 144, kills: 101, deaths: 96, assists: 31, rating: 1.06, adr: 74.1, kast: 71 }
    ],
    maps: [
      { teamName: "Team A", mapName: "Mirage", mapsPlayed: 4, winRate: 0.75, ctRoundWinRate: 0.56, tRoundWinRate: 0.52 },
      { teamName: "Team B", mapName: "Mirage", mapsPlayed: 4, winRate: 0.5, ctRoundWinRate: 0.52, tRoundWinRate: 0.49 }
    ],
    rounds: [
      { teamName: "Team A", rounds: 144, roundWinRate: 0.54, pressureRoundWinRate: 0.51 }
    ],
    economy: [
      { teamName: "Team A", forceBuyWinRate: 0.32, antiEcoLossRate: 0.08, resetResistanceScore: 0.56 }
    ],
    pistol: [
      { teamName: "Team A", pistolWinRate: 0.58, conversionAfterPistolWin: 0.61 }
    ],
    overtime: [],
    vetoHistory: [
      { teamName: "Team A", mapName: "Mirage", pickRate: 0.32, banRate: 0.08, sampleSize: 6 }
    ],
    h2h: []
  };
}
