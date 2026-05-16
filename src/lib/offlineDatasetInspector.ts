export type OfflineDatasetType = "results" | "players" | "picks" | "economy";

export type OfflineDatasetProfile = {
  type: OfflineDatasetType;
  title: string;
  filename: string;
  description: string;
  expectedColumns: string[];
  mapColumns: string[];
  teamColumns: string[];
  eventColumns: string[];
  dateColumns: string[];
};

export type OfflineDatasetTopValue = {
  value: string;
  count: number;
};

export type OfflineDatasetInspection = {
  ok: boolean;
  datasetType: OfflineDatasetType;
  title: string;
  filename: string;
  role: "training/calibration only";
  liveForecastSource: false;
  canRaiseRealForecastReady: false;
  licenseCheckRequired: true;
  rows: number;
  columns: number;
  delimiter: "," | ";" | "\t";
  columnNames: string[];
  dateRange: { from: string | null; to: string | null };
  topMaps: OfflineDatasetTopValue[];
  topTeams: OfflineDatasetTopValue[];
  topEvents: OfflineDatasetTopValue[];
  warnings: string[];
  errors: string[];
};

export const offlineDatasetProfiles: Record<OfflineDatasetType, OfflineDatasetProfile> = {
  results: {
    type: "results",
    title: "Kaggle results.csv",
    filename: "results.csv",
    description: "Historical match/map results for offline feature research and calibration.",
    expectedColumns: ["date", "team_1", "team_2", "_map", "result_1", "result_2", "match_id", "event_id", "rank_1", "rank_2", "match_winner"],
    mapColumns: ["_map", "map", "mapName"],
    teamColumns: ["team_1", "team_2"],
    eventColumns: ["event_id", "event_name"],
    dateColumns: ["date"]
  },
  players: {
    type: "players",
    title: "Kaggle players.csv",
    filename: "players.csv",
    description: "Historical player performance rows for offline feature research and calibration.",
    expectedColumns: ["date", "player_name", "team", "opponent", "match_id", "event_id", "event_name", "kills", "deaths", "adr", "kast", "rating"],
    mapColumns: ["_map", "map", "mapName", "map_1", "map_2", "map_3"],
    teamColumns: ["team", "opponent"],
    eventColumns: ["event_name", "event_id"],
    dateColumns: ["date"]
  },
  picks: {
    type: "picks",
    title: "Kaggle picks.csv",
    filename: "picks.csv",
    description: "Historical pick/ban data for offline veto feature research and calibration.",
    expectedColumns: ["date", "team_1", "team_2", "match_id", "event_id", "best_of", "t1_removed_1", "t2_removed_1", "t1_picked_1", "t2_picked_1", "left_over"],
    mapColumns: ["t1_removed_1", "t1_removed_2", "t1_removed_3", "t2_removed_1", "t2_removed_2", "t2_removed_3", "t1_picked_1", "t2_picked_1", "left_over"],
    teamColumns: ["team_1", "team_2"],
    eventColumns: ["event_id", "event_name"],
    dateColumns: ["date"]
  },
  economy: {
    type: "economy",
    title: "Kaggle economy.csv",
    filename: "economy.csv",
    description: "Historical round economy rows for offline economy feature research and calibration.",
    expectedColumns: ["date", "team_1", "team_2", "_map", "match_id", "event_id"],
    mapColumns: ["_map", "map", "mapName"],
    teamColumns: ["team_1", "team_2"],
    eventColumns: ["event_id", "event_name"],
    dateColumns: ["date"]
  }
};

const delimiters = [",", ";", "\t"] as const;

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function countDelimiter(line: string, delimiter: "," | ";" | "\t") {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) count += 1;
  }
  return count;
}

export function detectOfflineDatasetDelimiter(text: string): "," | ";" | "\t" {
  const header = stripBom(text).split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  return delimiters
    .map((delimiter) => ({ delimiter, count: countDelimiter(header, delimiter) }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

export function parseOfflineDelimitedRows(text: string, delimiter = detectOfflineDatasetDelimiter(text)) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  const clean = stripBom(text);
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(current);
      current = "";
      continue;
    }
    if (!quoted && char === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    if (char !== "\r") current += char;
  }
  row.push(current);
  rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

function normalizedHeader(value: string) {
  return stripBom(value).trim();
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function cleanValue(value: string | undefined) {
  return (value ?? "").trim();
}

function increment(map: Map<string, number>, value: string | undefined) {
  const clean = cleanValue(value);
  if (!clean || clean.toLowerCase() === "nan" || clean.toLowerCase() === "null") return;
  map.set(clean, (map.get(clean) ?? 0) + 1);
}

function topValues(map: Map<string, number>, take = 8): OfflineDatasetTopValue[] {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, take);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseDate(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function profileFor(datasetType: string): OfflineDatasetProfile | null {
  return Object.values(offlineDatasetProfiles).find((profile) => profile.type === datasetType) ?? null;
}

export function inspectOfflineDatasetCsv(input: { datasetType: string; content: string; maxRows?: number }): OfflineDatasetInspection {
  const profile = profileFor(input.datasetType);
  const fallback = offlineDatasetProfiles.results;
  const datasetType = profile?.type ?? fallback.type;
  const activeProfile = profile ?? fallback;
  const warnings = [
    "Offline dataset: training/calibration only.",
    "Not live forecast source and cannot raise Real Forecast Ready.",
    "License check required before training/export usage."
  ];
  const errors: string[] = [];

  if (!profile) errors.push(`Unknown offline dataset type: ${input.datasetType}.`);
  if (!input.content.trim()) {
    return {
      ok: false,
      datasetType,
      title: activeProfile.title,
      filename: activeProfile.filename,
      role: "training/calibration only",
      liveForecastSource: false,
      canRaiseRealForecastReady: false,
      licenseCheckRequired: true,
      rows: 0,
      columns: 0,
      delimiter: ",",
      columnNames: [],
      dateRange: { from: null, to: null },
      topMaps: [],
      topTeams: [],
      topEvents: [],
      warnings,
      errors: [...errors, "CSV content is empty."]
    };
  }

  const delimiter = detectOfflineDatasetDelimiter(input.content);
  const table = parseOfflineDelimitedRows(input.content, delimiter);
  if (!table.length) {
    return {
      ok: false,
      datasetType,
      title: activeProfile.title,
      filename: activeProfile.filename,
      role: "training/calibration only",
      liveForecastSource: false,
      canRaiseRealForecastReady: false,
      licenseCheckRequired: true,
      rows: 0,
      columns: 0,
      delimiter,
      columnNames: [],
      dateRange: { from: null, to: null },
      topMaps: [],
      topTeams: [],
      topEvents: [],
      warnings,
      errors: [...errors, "CSV table has no rows."]
    };
  }

  const headers = table[0].map(normalizedHeader);
  const normalizedToHeader = new Map(headers.map((header) => [normalizeKey(header), header]));
  const missingColumns = activeProfile.expectedColumns.filter((column) => !normalizedToHeader.has(normalizeKey(column)));
  if (missingColumns.length) warnings.push(`Missing expected columns: ${missingColumns.join(", ")}.`);

  const topMaps = new Map<string, number>();
  const topTeams = new Map<string, number>();
  const topEvents = new Map<string, number>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  const rows = table.slice(1, input.maxRows ? input.maxRows + 1 : undefined);

  for (const cells of rows) {
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    for (const column of activeProfile.mapColumns) increment(topMaps, row[normalizedToHeader.get(normalizeKey(column)) ?? column]);
    for (const column of activeProfile.teamColumns) increment(topTeams, row[normalizedToHeader.get(normalizeKey(column)) ?? column]);
    for (const column of activeProfile.eventColumns) increment(topEvents, row[normalizedToHeader.get(normalizeKey(column)) ?? column]);
    for (const column of activeProfile.dateColumns) {
      const date = parseDate(row[normalizedToHeader.get(normalizeKey(column)) ?? column] ?? "");
      if (!date) continue;
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    }
  }

  if (!minDate || !maxDate) warnings.push("No usable date range detected.");
  if (input.maxRows && table.length - 1 > input.maxRows) warnings.push(`Only first ${input.maxRows} rows inspected from a larger file.`);

  return {
    ok: errors.length === 0,
    datasetType,
    title: activeProfile.title,
    filename: activeProfile.filename,
    role: "training/calibration only",
    liveForecastSource: false,
    canRaiseRealForecastReady: false,
    licenseCheckRequired: true,
    rows: table.length > 0 ? table.length - 1 : 0,
    columns: headers.length,
    delimiter,
    columnNames: headers,
    dateRange: { from: minDate ? dateOnly(minDate) : null, to: maxDate ? dateOnly(maxDate) : null },
    topMaps: topValues(topMaps),
    topTeams: topValues(topTeams),
    topEvents: topValues(topEvents),
    warnings,
    errors
  };
}
