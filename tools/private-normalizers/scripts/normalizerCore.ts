import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analystSheetTemplates, quoteCsv, type AnalystSheetType } from "../../../src/lib/analystSheetTemplates";
import { validateNormalizedFile } from "../../../src/lib/validation/normalizedFileValidator";

export const normalizerSheetTypes = ["roster", "player_stats", "map_stats", "veto_history"] as const;
export type NormalizerSheetType = (typeof normalizerSheetTypes)[number];

export type NormalizerOptions = {
  type: NormalizerSheetType;
  matchId: string;
  teamName: string;
  sourceName: string;
  sourceUrl?: string;
  collectedAt: string;
  period: string;
  confidence: string | number;
  sampleSize?: string | number;
  inputText: string;
};

export type ValidationReport = {
  ok: boolean;
  rows: number;
  coveredBlock: string;
  errors: string[];
  warnings: string[];
};

export type WriteOptions = {
  outputPath?: string;
  append?: boolean;
  replace?: boolean;
  cwd?: string;
};

export type WriteResult = {
  outputPath: string;
  warnings: string[];
  rowsWritten: number;
};

const activeMaps = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];
const inboxDir = path.join("data", "private-inbox");
const acceptedInboxNames = new Set(["roster.csv", "player_stats.csv", "map_stats.csv", "veto_history.csv"]);
const sourceUrlColumn = "sourceUrl";

const aliases: Record<string, string[]> = {
  nickname: ["nickname", "nick", "player", "name", "ign"],
  role: ["role", "position"],
  country: ["country", "nationality"],
  maps: ["maps", "mapcount", "mapsplayed"],
  kills: ["kills", "k"],
  deaths: ["deaths", "d"],
  assists: ["assists", "a"],
  kd: ["kd", "k/d", "k-d", "kdratio"],
  rating: ["rating", "rating2.0", "rating2", "rtg"],
  adr: ["adr", "avgdamage", "damage"],
  kast: ["kast", "kast%"],
  impact: ["impact"],
  openingKills: ["openingkills", "opening kills", "entrykills", "entry kills", "opk", "fk"],
  openingDeaths: ["openingdeaths", "opening deaths", "entrydeaths", "entry deaths", "fd"],
  clutchesWon: ["clutcheswon", "clutches won", "clutchwon", "clutch wins"],
  clutchesAttempted: ["clutchesattempted", "clutches attempted", "clutchattempts"],
  mapName: ["map", "mapname"],
  mapsPlayed: ["mapsplayed", "maps", "played"],
  wins: ["wins", "w"],
  losses: ["losses", "l"],
  winRate: ["winrate", "win%", "win percentage", "wr"],
  roundsWon: ["roundswon", "rounds won", "rw"],
  roundsLost: ["roundslost", "rounds lost", "rl"],
  ctRoundWinRate: ["ctroundwinrate", "ct%", "ct win%", "ctwinrate"],
  tRoundWinRate: ["troundwinrate", "t%", "t win%", "twinrate"],
  pickRate: ["pickrate", "pick%", "pick rate"],
  banRate: ["banrate", "ban%", "ban rate"],
  deciderRate: ["deciderrate", "decider%", "decider rate"],
  sampleSize: ["samplesize", "sample", "n"]
};

const positionalColumns: Record<NormalizerSheetType, string[]> = {
  roster: ["nickname", "role", "country"],
  player_stats: ["nickname", "maps", "kills", "deaths", "assists", "kd", "rating", "adr", "kast", "impact", "openingKills", "openingDeaths", "clutchesWon", "clutchesAttempted"],
  map_stats: ["mapName", "mapsPlayed", "wins", "losses", "winRate", "roundsWon", "roundsLost", "ctRoundWinRate", "tRoundWinRate", "pickRate", "banRate", "deciderRate"],
  veto_history: ["mapName", "sampleSize", "pickRate", "banRate", "deciderRate"]
};

const rateFields = new Set(["winRate", "ctRoundWinRate", "tRoundWinRate", "pickRate", "banRate", "deciderRate", "kast", "confidence"]);

export function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

export function parseCliArgs(argv: string[]) {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (["append", "replace"].includes(key)) {
      parsed[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

export async function runGenericCli(argv: string[]) {
  const args = parseCliArgs(argv);
  const type = stringArg(args.type) as NormalizerSheetType;
  if (!isSupportedType(type)) throw new Error(`Unsupported --type. Use one of: ${normalizerSheetTypes.join(", ")}.`);
  const inputPath = requiredArg(args.input, "input");
  const inputText = await readFile(inputPath, "utf8");
  const result = normalizeTablePaste({
    type,
    matchId: requiredArg(args.matchId, "matchId"),
    teamName: requiredArg(args.teamName, "teamName"),
    sourceName: requiredArg(args.sourceName, "sourceName"),
    sourceUrl: stringArg(args.sourceUrl),
    collectedAt: requiredArg(args.collectedAt, "collectedAt"),
    period: requiredArg(args.period, "period"),
    confidence: requiredArg(args.confidence, "confidence"),
    sampleSize: stringArg(args.sampleSize),
    inputText
  });
  const validation = validateNormalizedCsv(type, result.csv);
  if (!validation.ok) throw new Error(`Validation failed:\n${validation.errors.join("\n")}`);
  const written = await writeNormalizedCsv(type, result.csv, {
    outputPath: stringArg(args.out),
    append: Boolean(args.append),
    replace: Boolean(args.replace)
  });
  printSummary(type, validation, [...result.warnings, ...validation.warnings, ...written.warnings], written);
}

export async function runHltvCli(argv: string[]) {
  const args = parseCliArgs(argv);
  const inputPath = requiredArg(args.input, "input");
  const inputText = await readFile(inputPath, "utf8");
  const requestedType = stringArg(args.type);
  const type = requestedType && requestedType !== "auto" ? requestedType as NormalizerSheetType : inferSheetType(inputText);
  if (!isSupportedType(type)) throw new Error("Could not infer table type. Pass --type roster|player_stats|map_stats|veto_history.");
  await runGenericCli(["--type", type, ...argv.filter((arg) => arg !== "--type" && arg !== requestedType)]);
}

export async function runValidateCli(argv: string[]) {
  const args = parseCliArgs(argv);
  const type = requiredArg(args.type, "type") as NormalizerSheetType;
  if (!isSupportedType(type)) throw new Error(`Unsupported --type. Use one of: ${normalizerSheetTypes.join(", ")}.`);
  const inputText = await readFile(requiredArg(args.input, "input"), "utf8");
  const validation = validateNormalizedCsv(type, inputText);
  printValidation(type, validation);
  if (!validation.ok) process.exitCode = 1;
}

export function normalizeTablePaste(options: NormalizerOptions) {
  const optionErrors = validateOptions(options);
  if (optionErrors.length) throw new Error(optionErrors.join("\n"));
  const parsed = parsePastedTable(options.inputText, options.type);
  if (!parsed.rows.length) throw new Error("Input table is empty.");
  const columns = outputColumns(options.type);
  const rows = parsed.rows.map((row) => normalizeRow(options, row));
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => quoteCsv(row[column] ?? "")).join(","))].join("\n") + "\n";
  return {
    csv,
    rows,
    warnings: parsed.usedHeader ? [] : ["No header detected; positional mapping was used."]
  };
}

export function validateNormalizedCsv(type: NormalizerSheetType, content: string): ValidationReport {
  const template = analystSheetTemplates[type as AnalystSheetType];
  const validation = validateNormalizedFile({ fileName: template.filename, content });
  return {
    ok: validation.isValid,
    rows: validation.rowsParsed,
    coveredBlock: template.coveredBlock,
    errors: validation.errors,
    warnings: validation.warnings
  };
}

export async function writeNormalizedCsv(type: NormalizerSheetType, csv: string, options: WriteOptions = {}): Promise<WriteResult> {
  if (options.append && options.replace) throw new Error("--append and --replace cannot be used together.");
  const cwd = options.cwd ?? process.cwd();
  const outputPath = resolveOutputPath(type, options.outputPath, cwd);
  const warnings = outputPathWarnings(outputPath, cwd);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const exists = await pathExists(outputPath);
  if (exists && !options.append && !options.replace) {
    throw new Error("Target file already exists. Use --append, --replace, or --out <filename>.");
  }
  if (options.append && exists) {
    const existing = await readFile(outputPath, "utf8");
    const existingHeader = existing.split(/\r?\n/)[0]?.trim();
    const nextHeader = csv.split(/\r?\n/)[0]?.trim();
    if (existingHeader !== nextHeader) throw new Error("Cannot append: existing CSV header does not match normalized output.");
    const body = csv.split(/\r?\n/).slice(1).filter((line) => line.trim()).join("\n");
    await writeFile(outputPath, `${existing.trimEnd()}\n${body}\n`, "utf8");
  } else {
    await writeFile(outputPath, csv, "utf8");
  }
  return { outputPath, warnings, rowsWritten: Math.max(0, csv.trim().split(/\r?\n/).length - 1) };
}

export function inferSheetType(text: string): NormalizerSheetType | null {
  const parsed = splitRows(text);
  const first = parsed[0] ?? [];
  const slugs = new Set(first.map(slug));
  if (hasAny(slugs, ["rating", "adr", "kast", "kd", "maps"])) return "player_stats";
  if (hasAny(slugs, ["winrate", "mapsplayed", "ctroundwinrate", "troundwinrate"])) return "map_stats";
  if (hasAny(slugs, ["pickrate", "banrate", "deciderrate"])) return "veto_history";
  if (hasAny(slugs, ["player", "nickname", "role", "country"])) return "roster";
  return null;
}

function parsePastedTable(text: string, type: NormalizerSheetType) {
  const rows = splitRows(text);
  if (!rows.length) return { rows: [] as Record<string, string>[], usedHeader: false };
  const first = rows[0];
  const usedHeader = looksLikeHeader(first);
  const headers = usedHeader ? first.map(slug) : positionalColumns[type].map(slug);
  const dataRows = usedHeader ? rows.slice(1) : rows;
  return {
    usedHeader,
    rows: dataRows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""])))
  };
}

function splitRows(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  return lines.map((line) => delimiter ? parseDelimitedLine(line, delimiter) : line.split(/\s{2,}|\t/).map((cell) => cell.trim()).filter(Boolean));
}

function detectDelimiter(line: string): "," | ";" | "\t" | null {
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  const ranked = candidates.map((delimiter) => ({ delimiter, count: countDelimiter(line, delimiter) })).sort((a, b) => b.count - a.count);
  return ranked[0] && ranked[0].count > 0 ? ranked[0].delimiter : null;
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

function parseDelimitedLine(line: string, delimiter: "," | ";" | "\t") {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
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
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeRow(options: NormalizerOptions, row: Record<string, string>) {
  const output: Record<string, string> = {};
  for (const column of outputColumns(options.type)) output[column] = "";
  output.matchId = options.matchId;
  output.teamName = options.teamName;
  output.sourceName = options.sourceName;
  output.collectedAt = options.collectedAt;
  output.period = options.period;
  output.confidence = normalizeConfidence(options.confidence);
  output[sourceUrlColumn] = options.sourceUrl ?? "";
  if (options.type === "roster") {
    output.nickname = value(row, "nickname");
    output.role = value(row, "role");
    output.country = value(row, "country");
    output.sampleSize = normalizePositive(options.sampleSize) || "1";
  }
  if (options.type === "player_stats") {
    for (const column of ["nickname", "maps", "kills", "deaths", "assists", "kd", "rating", "adr", "kast", "impact", "openingKills", "openingDeaths", "clutchesWon", "clutchesAttempted"]) {
      output[column] = column === "nickname" ? value(row, column) : normalizeField(column, value(row, column));
    }
    output.sampleSize = normalizePositive(options.sampleSize) || output.maps;
  }
  if (options.type === "map_stats") {
    for (const column of ["mapName", "mapsPlayed", "wins", "losses", "winRate", "roundsWon", "roundsLost", "ctRoundWinRate", "tRoundWinRate", "pickRate", "banRate", "deciderRate"]) {
      output[column] = column === "mapName" ? normalizeMapDisplay(value(row, column)) : normalizeField(column, value(row, column));
    }
    if (!output.winRate && output.wins && output.losses) output.winRate = ratio(Number(output.wins), Number(output.losses));
    output.sampleSize = normalizePositive(options.sampleSize) || output.mapsPlayed;
  }
  if (options.type === "veto_history") {
    for (const column of ["mapName", "sampleSize", "pickRate", "banRate", "deciderRate"]) {
      output[column] = column === "mapName" ? normalizeMapDisplay(value(row, column)) : normalizeField(column, value(row, column));
    }
    if (!output.sampleSize) output.sampleSize = normalizePositive(options.sampleSize);
  }
  return output;
}

function outputColumns(type: NormalizerSheetType) {
  return [...analystSheetTemplates[type as AnalystSheetType].columns, sourceUrlColumn];
}

function value(row: Record<string, string>, canonical: string) {
  const candidates = [canonical, ...(aliases[canonical] ?? [])].map(slug);
  for (const candidate of candidates) {
    const found = row[candidate];
    if (found !== undefined && found !== "") return found;
  }
  return "";
}

function validateOptions(options: NormalizerOptions) {
  const errors: string[] = [];
  if (!isSupportedType(options.type)) errors.push(`Unsupported type: ${options.type}.`);
  if (!options.matchId.trim()) errors.push("matchId is required.");
  if (!options.teamName.trim()) errors.push("teamName is required.");
  if (isPlaceholder(options.sourceName)) errors.push("sourceName is required and cannot be placeholder text.");
  if (!options.collectedAt.trim()) errors.push("collectedAt is required.");
  if (!options.period.trim()) errors.push("period is required.");
  if (!normalizePositive(options.confidence)) errors.push("confidence must be greater than 0.");
  if (!options.inputText.trim()) errors.push("input table is empty.");
  return errors;
}

function normalizeField(field: string, raw: string) {
  if (!raw.trim()) return "";
  if (field === "confidence") return normalizeConfidence(raw);
  if (rateFields.has(field)) return normalizeRate(raw);
  return normalizeNumber(raw);
}

function normalizeConfidence(raw: string | number) {
  const parsed = parseNumber(String(raw));
  if (parsed === null) return "";
  return formatNumber(parsed > 1 ? parsed / 100 : parsed);
}

function normalizeRate(raw: string) {
  const parsed = parseNumber(raw);
  if (parsed === null) return "";
  return formatNumber(raw.includes("%") || parsed > 1 ? parsed / 100 : parsed);
}

function normalizePositive(raw: string | number | undefined) {
  const parsed = parseNumber(String(raw ?? ""));
  return parsed !== null && parsed > 0 ? formatNumber(parsed) : "";
}

function normalizeNumber(raw: string) {
  const parsed = parseNumber(raw);
  return parsed === null ? "" : formatNumber(parsed);
}

function parseNumber(raw: string) {
  const cleaned = raw.trim().replace("%", "").replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number) {
  return Number(value.toFixed(4)).toString();
}

function ratio(wins: number, losses: number) {
  const total = wins + losses;
  return total > 0 ? formatNumber(wins / total) : "";
}

function normalizeMapDisplay(raw: string) {
  const normalized = slug(raw);
  return activeMaps.find((map) => slug(map) === normalized) ?? "";
}

function looksLikeHeader(cells: string[]) {
  const aliasSet = new Set(Object.values(aliases).flat().map(slug));
  return cells.some((cell) => aliasSet.has(slug(cell)));
}

function hasAny(values: Set<string>, expected: string[]) {
  return expected.some((item) => values.has(slug(item)));
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/^de[_-]?/, "").replace(/[^a-z0-9]+/g, "");
}

function isPlaceholder(value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return !normalized || ["player", "player_name", "nickname", "team a", "team b", "source", "source name", "example"].includes(normalized) || normalized.includes("placeholder");
}

function isSupportedType(value: unknown): value is NormalizerSheetType {
  return normalizerSheetTypes.includes(value as NormalizerSheetType);
}

function stringArg(value: string | boolean | undefined) {
  return typeof value === "string" ? value : "";
}

function requiredArg(value: string | boolean | undefined, name: string) {
  const result = stringArg(value).trim();
  if (!result) throw new Error(`--${name} is required.`);
  return result;
}

function resolveOutputPath(type: NormalizerSheetType, outputPath: string | undefined, cwd: string) {
  if (!outputPath) return path.resolve(cwd, inboxDir, analystSheetTemplates[type as AnalystSheetType].filename);
  if (!path.dirname(outputPath) || path.dirname(outputPath) === ".") return path.resolve(cwd, inboxDir, outputPath);
  return path.resolve(cwd, outputPath);
}

function outputPathWarnings(outputPath: string, cwd: string) {
  const warnings: string[] = [];
  const relative = path.relative(path.resolve(cwd, inboxDir), outputPath);
  const isInsideInbox = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (!isInsideInbox) warnings.push("Output is outside data/private-inbox; the app will not scan it automatically.");
  if (isInsideInbox && !acceptedInboxNames.has(path.basename(outputPath))) {
    warnings.push("Output filename is not an accepted private inbox basename; the app will ignore it unless renamed.");
  }
  return warnings;
}

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function printSummary(type: NormalizerSheetType, validation: ValidationReport, warnings: string[], written: WriteResult) {
  console.log(`OK: ${type} normalized.`);
  console.log(`Rows: ${validation.rows}`);
  console.log(`Output: ${written.outputPath}`);
  for (const warning of [...new Set(warnings)]) console.warn(`Warning: ${warning}`);
}

function printValidation(type: NormalizerSheetType, validation: ValidationReport) {
  console.log(`${validation.ok ? "OK" : "FAILED"}: ${type}`);
  console.log(`Rows: ${validation.rows}`);
  console.log(`Covered block: ${validation.coveredBlock}`);
  for (const warning of validation.warnings) console.warn(`Warning: ${warning}`);
  for (const error of validation.errors) console.error(`Error: ${error}`);
}
