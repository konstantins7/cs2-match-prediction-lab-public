import { analystSheetTemplates, type AnalystSheetType } from "../analystSheetTemplates";
import { isPlaceholderText, parseEvidenceDate } from "../realData/dataRole";

export type NormalizedFileType = AnalystSheetType | "team_form" | "unsupported";

export type NormalizedFileRowIssue = {
  rowIndex: number;
  lineNumber: number;
  field?: string;
  severity: "error" | "warning";
  message: string;
};

export type NormalizedFileValidationResult = {
  isValid: boolean;
  detectedType: NormalizedFileType;
  rowsParsed: number;
  coveredBlock: string;
  missingColumns: string[];
  errors: string[];
  warnings: string[];
  rowIssues: NormalizedFileRowIssue[];
};

export type NormalizedFileValidationInput = {
  fileName: string;
  content?: string;
  rows?: Array<Record<string, unknown>>;
  expectedMatchId?: string;
  allowedTeamNames?: string[];
  activeMaps?: string[];
};

const csvFileTypes: Record<string, NormalizedFileType> = {
  "roster.csv": "roster",
  "player_stats.csv": "player_stats",
  "map_stats.csv": "map_stats",
  "veto_history.csv": "veto_history",
  "h2h.csv": "h2h",
  "news_events.csv": "news_events",
  "team_form.csv": "team_form"
};

const defaultActiveMaps = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];
const sourceUrlColumn = "sourceUrl";

export function detectNormalizedFileType(fileName: string): NormalizedFileType {
  return csvFileTypes[fileName.trim().toLowerCase()] ?? "unsupported";
}

export function validateNormalizedFile(input: NormalizedFileValidationInput): NormalizedFileValidationResult {
  const detectedType = detectNormalizedFileType(input.fileName);
  if (detectedType === "unsupported") {
    return finalize({
      detectedType,
      rowsParsed: 0,
      coveredBlock: "unsupported",
      missingColumns: [],
      issues: [{ rowIndex: 0, lineNumber: 1, severity: "error", message: "Unsupported normalized file name." }]
    });
  }
  if (detectedType === "team_form") {
    const parsed = parseInputRows(input);
    return finalize({
      detectedType,
      rowsParsed: parsed.rows.length,
      coveredBlock: "team_form",
      missingColumns: [],
      issues: [{ rowIndex: 0, lineNumber: 1, severity: "warning", message: "team_form.csv is accepted by private inbox contract but has no standalone Apply path yet." }]
    });
  }

  const template = analystSheetTemplates[detectedType];
  const parsed = parseInputRows(input);
  const missingColumns = template.columns.filter((column) => !parsed.headers.includes(column));
  const issues: NormalizedFileRowIssue[] = missingColumns.map((column) => ({
    rowIndex: 0,
    lineNumber: 1,
    field: column,
    severity: "error" as const,
    message: `${template.filename}: missing column ${column}.`
  }));
  if (!parsed.headers.includes(sourceUrlColumn)) {
    issues.push({ rowIndex: 0, lineNumber: 1, field: sourceUrlColumn, severity: "warning", message: "sourceUrl missing lowers source confidence but is not a hard blocker." });
  }
  if (!parsed.rows.length) {
    issues.push({ rowIndex: 0, lineNumber: 1, severity: "error", message: "CSV has no data rows." });
  }

  for (const row of parsed.rows) {
    issues.push(...validateRow({
      sheetType: detectedType,
      row,
      expectedMatchId: input.expectedMatchId,
      allowedTeamNames: input.allowedTeamNames,
      activeMaps: input.activeMaps ?? defaultActiveMaps
    }));
  }

  return finalize({
    detectedType,
    rowsParsed: parsed.rows.length,
    coveredBlock: template.coveredBlock,
    missingColumns,
    issues
  });
}

export function parseNormalizedCsv(content: string) {
  const delimiter = detectDelimiter(content);
  const rows = parseDelimited(content, delimiter);
  const headers = (rows[0] ?? []).map((header) => header.trim().replace(/^\uFEFF/, ""));
  return {
    headers,
    rows: rows.slice(1).map((cells, index) => ({
      rowIndex: index,
      lineNumber: index + 2,
      values: Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? ""]))
    })).filter((row) => Object.values(row.values).some((value) => value.trim().length > 0))
  };
}

function parseInputRows(input: NormalizedFileValidationInput) {
  if (input.rows) {
    const headers = [...new Set(input.rows.flatMap((row) => Object.keys(row)))];
    return {
      headers,
      rows: input.rows.map((row, index) => ({
        rowIndex: index,
        lineNumber: index + 2,
        values: Object.fromEntries(headers.map((header) => [header, stringify(row[header])]))
      }))
    };
  }
  return parseNormalizedCsv(input.content ?? "");
}

function validateRow(params: {
  sheetType: AnalystSheetType;
  row: { rowIndex: number; lineNumber: number; values: Record<string, string> };
  expectedMatchId?: string;
  allowedTeamNames?: string[];
  activeMaps: string[];
}) {
  const issues: NormalizedFileRowIssue[] = [];
  const { row, sheetType } = params;
  const add = (severity: "error" | "warning", message: string, field?: string) => {
    issues.push({ rowIndex: row.rowIndex, lineNumber: row.lineNumber, field, severity, message: `Row ${row.lineNumber}: ${message}` });
  };

  if (isPlaceholder(row.values.sourceName)) add("error", "sourceName is required and cannot be placeholder text.", "sourceName");
  if (!positive(row.values.confidence)) add("error", "confidence must be greater than 0.", "confidence");
  if (!row.values[sourceUrlColumn]) add("warning", "sourceUrl missing lowers source confidence but is not a hard blocker.", sourceUrlColumn);
  if (params.expectedMatchId && row.values.matchId !== params.expectedMatchId) add("error", "matchId does not match selected match.", "matchId");

  if (["roster", "player_stats", "map_stats", "veto_history"].includes(sheetType)) {
    if (isPlaceholder(row.values.teamName)) add("error", "teamName is required and cannot be placeholder text.", "teamName");
    if (params.allowedTeamNames?.length && row.values.teamName && !matchesAllowedTeam(row.values.teamName, params.allowedTeamNames)) {
      add("error", "teamName does not match selected match teams.", "teamName");
    }
    if (!positive(row.values.sampleSize)) add("error", "sampleSize must be greater than 0.", "sampleSize");
    if (!row.values.collectedAt || !parseEvidenceDate(row.values.collectedAt)) add("error", "collectedAt is required and must be a date.", "collectedAt");
    if (!row.values.period) add("error", "period is required.", "period");
  }

  if (sheetType === "roster" && isPlaceholder(row.values.nickname)) add("error", "nickname is required and cannot be placeholder text.", "nickname");
  if (sheetType === "player_stats") validatePlayerStats(row, add);
  if (sheetType === "map_stats") validateMapStats(row, add, params.activeMaps);
  if (sheetType === "veto_history") validateVeto(row, add, params.activeMaps);
  if (sheetType === "h2h") validateH2h(row, add, params.allowedTeamNames, params.activeMaps);
  if (sheetType === "news_events") validateNews(row, add, params.allowedTeamNames);
  return issues;
}

function validatePlayerStats(row: { values: Record<string, string> }, add: (severity: "error" | "warning", message: string, field?: string) => void) {
  if (isPlaceholder(row.values.nickname)) add("error", "nickname is required and cannot be placeholder text.", "nickname");
  for (const field of ["maps", "kd", "rating"]) {
    if (!positive(row.values[field])) add("error", `${field} must be greater than 0.`, field);
  }
  if (allZero(row.values, ["maps", "kills", "deaths", "assists", "kd", "rating", "adr", "kast", "impact"])) {
    add("error", "all-zero player stats look like fake or placeholder data.");
  }
}

function validateMapStats(row: { values: Record<string, string> }, add: (severity: "error" | "warning", message: string, field?: string) => void, activeMaps: string[]) {
  if (!normalizeMapName(row.values.mapName, activeMaps)) add("error", "mapName is not in active CS2 pool.", "mapName");
  if (!positive(row.values.mapsPlayed)) add("error", "mapsPlayed must be greater than 0.", "mapsPlayed");
  if (allZero(row.values, ["mapsPlayed", "wins", "losses", "winRate", "roundsWon", "roundsLost"])) {
    add("error", "all-zero map stats look like fake or placeholder data.");
  }
}

function validateVeto(row: { values: Record<string, string> }, add: (severity: "error" | "warning", message: string, field?: string) => void, activeMaps: string[]) {
  if (!normalizeMapName(row.values.mapName, activeMaps)) add("error", "mapName is not in active CS2 pool.", "mapName");
  if (!positive(row.values.sampleSize)) add("error", "sampleSize must be greater than 0.", "sampleSize");
  if (allZero(row.values, ["pickRate", "banRate", "deciderRate"])) add("error", "pickRate/banRate/deciderRate cannot all be zero.");
}

function validateH2h(row: { values: Record<string, string> }, add: (severity: "error" | "warning", message: string, field?: string) => void, allowedTeamNames: string[] | undefined, activeMaps: string[]) {
  if (!row.values.date || !parseEvidenceDate(row.values.date)) add("error", "date is required and must be a date.", "date");
  for (const field of ["teamA", "teamB"]) {
    if (isPlaceholder(row.values[field])) add("error", `${field} is required and cannot be placeholder text.`, field);
    if (allowedTeamNames?.length && row.values[field] && !matchesAllowedTeam(row.values[field], allowedTeamNames)) add("error", `${field} does not match selected match teams.`, field);
  }
  if (row.values.mapName && !normalizeMapName(row.values.mapName, activeMaps)) add("error", "mapName is not in active CS2 pool.", "mapName");
  if (!positive(row.values.sampleSize)) add("error", "sampleSize must be greater than 0.", "sampleSize");
}

function validateNews(row: { values: Record<string, string> }, add: (severity: "error" | "warning", message: string, field?: string) => void, allowedTeamNames: string[] | undefined) {
  if (isPlaceholder(row.values.title)) add("error", "title is required and cannot be placeholder text.", "title");
  if (isPlaceholder(row.values.summary)) add("error", "summary is required and cannot be placeholder text.", "summary");
  if (!row.values.publishedAt || !parseEvidenceDate(row.values.publishedAt)) add("error", "publishedAt is required and must be a date.", "publishedAt");
  if (row.values.affectedTeam && allowedTeamNames?.length && !matchesAllowedTeam(row.values.affectedTeam, allowedTeamNames)) {
    add("error", "affectedTeam does not match selected match teams.", "affectedTeam");
  }
}

function finalize(params: {
  detectedType: NormalizedFileType;
  rowsParsed: number;
  coveredBlock: string;
  missingColumns: string[];
  issues: NormalizedFileRowIssue[];
}): NormalizedFileValidationResult {
  const errors = params.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
  const warnings = params.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message);
  return {
    isValid: errors.length === 0,
    detectedType: params.detectedType,
    rowsParsed: params.rowsParsed,
    coveredBlock: params.coveredBlock,
    missingColumns: params.missingColumns,
    errors,
    warnings,
    rowIssues: params.issues
  };
}

function detectDelimiter(text: string): "," | ";" | "\t" {
  const header = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) ?? "";
  const ranked = ([",", ";", "\t"] as const).map((delimiter) => ({ delimiter, count: countDelimiter(header, delimiter) })).sort((a, b) => b.count - a.count);
  return ranked[0]?.count ? ranked[0].delimiter : ",";
}

function countDelimiter(line: string, delimiter: "," | ";" | "\t") {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") quoted = !quoted;
    if (!quoted && char === delimiter) count += 1;
  }
  return count;
}

function parseDelimited(text: string, delimiter: "," | ";" | "\t") {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  const clean = text.replace(/^\uFEFF/, "");
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
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    if (char !== "\r") current += char;
  }
  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function normalizeMapName(value: string | undefined, activeMaps: string[]) {
  const normalized = slug(value ?? "");
  return activeMaps.find((map) => slug(map) === normalized) ?? null;
}

function matchesAllowedTeam(value: string, allowed: string[]) {
  const normalized = slug(value);
  return allowed.some((team) => slug(team) === normalized);
}

function positive(value: string | undefined) {
  const parsed = parseNumber(value);
  return parsed !== null && parsed > 0;
}

function parseNumber(value: string | undefined) {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value.trim().replace("%", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function allZero(row: Record<string, string>, fields: string[]) {
  return fields.every((field) => {
    const parsed = parseNumber(row[field]);
    return parsed === null || parsed === 0;
  });
}

function isPlaceholder(value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return !normalized ||
    isPlaceholderText(value ?? "") ||
    ["player", "player_name", "nickname", "team a", "team b", "source", "source name", "example"].includes(normalized) ||
    normalized.includes("placeholder");
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/^de[_-]?/, "").replace(/[^a-z0-9]+/g, "");
}

function stringify(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value);
}
