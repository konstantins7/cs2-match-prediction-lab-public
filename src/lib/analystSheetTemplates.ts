export const analystSheetTypes = ["roster", "player_stats", "map_stats", "veto_history", "h2h", "news_events"] as const;

export type AnalystSheetType = (typeof analystSheetTypes)[number];

export type AnalystSheetTemplate = {
  sheetType: AnalystSheetType;
  title: string;
  filename: string;
  columns: string[];
  placeholderRow: string[];
  coveredBlock: string;
  description: string;
};

export const analystSheetTemplates: Record<AnalystSheetType, AnalystSheetTemplate> = {
  roster: {
    sheetType: "roster",
    title: "Roster sheet",
    filename: "roster.csv",
    columns: ["matchId", "teamName", "nickname", "role", "country", "sourceName", "collectedAt", "period", "sampleSize", "confidence"],
    placeholderRow: ["pandascore_match_1474573", "Team A", "player_name", "rifler", "country", "source name", "2026-05-01T10:00:00Z", "current_roster", "0", "0"],
    coveredBlock: "roster",
    description: "Составы по выбранному матчу. Нужны пять игроков на каждую команду."
  },
  player_stats: {
    sheetType: "player_stats",
    title: "Player stats sheet",
    filename: "player_stats.csv",
    columns: ["matchId", "teamName", "nickname", "maps", "kills", "deaths", "assists", "kd", "rating", "adr", "kast", "impact", "openingKills", "openingDeaths", "clutchesWon", "clutchesAttempted", "sourceName", "collectedAt", "period", "sampleSize", "confidence"],
    placeholderRow: ["pandascore_match_1474573", "Team A", "player_name", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "source name", "2026-05-01T10:00:00Z", "last_30_days", "0", "0"],
    coveredBlock: "player_stats",
    description: "Статистика игроков. Должна соответствовать roster rows."
  },
  map_stats: {
    sheetType: "map_stats",
    title: "Map stats sheet",
    filename: "map_stats.csv",
    columns: ["matchId", "teamName", "mapName", "mapsPlayed", "wins", "losses", "winRate", "roundsWon", "roundsLost", "ctRoundWinRate", "tRoundWinRate", "pickRate", "banRate", "deciderRate", "sourceName", "collectedAt", "period", "sampleSize", "confidence"],
    placeholderRow: ["pandascore_match_1474573", "Team A", "Mirage", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "source name", "2026-05-01T10:00:00Z", "last_90_days", "0", "0"],
    coveredBlock: "map_stats",
    description: "Map pool statistics для команд выбранного матча."
  },
  veto_history: {
    sheetType: "veto_history",
    title: "Veto history sheet",
    filename: "veto_history.csv",
    columns: ["matchId", "teamName", "mapName", "sampleSize", "pickRate", "banRate", "deciderRate", "sourceName", "collectedAt", "period", "confidence"],
    placeholderRow: ["pandascore_match_1474573", "Team A", "Mirage", "0", "0", "0", "0", "source name", "2026-05-01T10:00:00Z", "last_90_days", "0"],
    coveredBlock: "veto_history",
    description: "История pick/ban/decider по картам."
  },
  h2h: {
    sheetType: "h2h",
    title: "H2H sheet",
    filename: "h2h.csv",
    columns: ["matchId", "date", "teamA", "teamB", "winner", "format", "mapName", "scoreA", "scoreB", "rosterSimilarity", "sourceName", "collectedAt", "period", "sampleSize", "confidence"],
    placeholderRow: ["pandascore_match_1474573", "2026-05-01T10:00:00Z", "Team A", "Team B", "Team A", "BO3", "Mirage", "13", "9", "0", "source name", "2026-05-01T10:00:00Z", "current_roster_h2h", "0", "0"],
    coveredBlock: "h2h",
    description: "Optional matchup context. Не является hard blocker для первого real forecast."
  },
  news_events: {
    sheetType: "news_events",
    title: "News/events sheet",
    filename: "news_events.csv",
    columns: ["matchId", "sourceName", "sourceType", "title", "summary", "publishedAt", "affectedTeam", "affectedPlayer", "eventType", "reliability", "impactScore", "confidence"],
    placeholderRow: ["pandascore_match_1474573", "source name", "official", "Roster update", "Short official note", "2026-05-01T10:00:00Z", "Team A", "player_name", "roster", "official", "0", "0"],
    coveredBlock: "news",
    description: "Manual official/reference events. Scraping не используется."
  }
};

export function buildAnalystSheetTemplate(sheetType: AnalystSheetType, delimiter = ",") {
  const template = analystSheetTemplates[sheetType];
  return `${template.columns.join(delimiter)}\n${template.placeholderRow.map((value) => quoteCsv(value, delimiter)).join(delimiter)}\n`;
}

export function quoteCsv(value: string, delimiter = ",") {
  const needsQuote = value.includes(delimiter) || value.includes("\"") || value.includes("\n") || value.includes("\r");
  const escaped = value.replace(/"/g, "\"\"");
  return needsQuote ? `"${escaped}"` : escaped;
}

export function analystSheetLabel(sheetType: AnalystSheetType) {
  return analystSheetTemplates[sheetType].title;
}
