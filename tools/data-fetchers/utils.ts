import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analystSheetTemplates, quoteCsv, type AnalystSheetType } from "../../src/lib/analystSheetTemplates";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type FetcherEnv = Record<string, string | undefined>;

export type CliArgs = Record<string, string | boolean>;

export type FetcherRunOptions = {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  now?: Date;
  dryRun?: boolean;
  force?: boolean;
  inboxPath?: string;
};

export type CsvMergeResult = {
  fileName: string;
  filePath: string;
  rowsReceived: number;
  rowsInserted: number;
  rowsSkipped: number;
  dryRun: boolean;
};

export type FetcherReport = {
  source: string;
  status: "success" | "partial" | "skipped" | "failed";
  fetched: Record<string, number>;
  writes: CsvMergeResult[];
  warnings: string[];
  errors: string[];
};

export const safeDalSheetTypes = ["roster", "player_stats", "map_stats", "veto_history", "h2h", "news_events"] as const satisfies AnalystSheetType[];

export function privateInboxPath(env: FetcherEnv = process.env, override?: string) {
  return path.resolve(process.cwd(), override ?? env.PRIVATE_INBOX_PATH ?? path.join("data", "private-inbox"));
}

export function getISODate(now = new Date()) {
  return now.toISOString();
}

export function envFlag(env: FetcherEnv, key: string, fallback = false) {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

export function parseCliArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (["dry-run", "force"].includes(key)) {
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

export function stringArg(args: CliArgs, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

export function listArg(args: CliArgs, key: string) {
  return stringArg(args, key).split(",").map((value) => value.trim()).filter(Boolean);
}

export function rowsFromPayload(payload: unknown, keys: string[] = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function valueAt(record: unknown, paths: string[]) {
  for (const candidate of paths) {
    const value = candidate.split(".").reduce<unknown>((current, part) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[part];
    }, record);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

export function textAt(record: unknown, paths: string[]) {
  const value = valueAt(record, paths);
  return value === "" ? "" : String(value).trim();
}

export function numberAt(record: unknown, paths: string[]) {
  const raw = textAt(record, paths).replace("%", "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function stableSlug(value: string) {
  return value.trim().toLowerCase().replace(/^de[_-]?/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export async function fetchJson(url: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText} for ${redactUrl(url)}`);
  return response.json() as Promise<unknown>;
}

export async function fetchText(url: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText} for ${redactUrl(url)}`);
  return response.text();
}

export async function mergeSheetRows(
  sheetType: AnalystSheetType,
  rows: Array<Record<string, unknown>>,
  uniqueColumns: string[],
  options: FetcherRunOptions = {}
): Promise<CsvMergeResult> {
  const template = analystSheetTemplates[sheetType];
  const filePath = path.join(privateInboxPath(options.env, options.inboxPath), template.filename);
  const normalizedRows = rows.map((row) => normalizeRow(template.columns, row));
  const incoming = uniqueBy(normalizedRows, uniqueColumns);
  const existingContent = await readIfExists(filePath);
  const existingRows = existingContent ? parseCsv(existingContent) : [];
  const seen = new Set(existingRows.map((row) => stableKey(row, uniqueColumns)));
  const rowsToInsert = incoming.filter((row) => !seen.has(stableKey(row, uniqueColumns)));
  if (!options.dryRun && rowsToInsert.length) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const merged = [...existingRows, ...rowsToInsert];
    await writeFile(filePath, toCsv(template.columns, merged), "utf8");
  }
  return {
    fileName: template.filename,
    filePath,
    rowsReceived: rows.length,
    rowsInserted: rowsToInsert.length,
    rowsSkipped: incoming.length - rowsToInsert.length,
    dryRun: Boolean(options.dryRun)
  };
}

export function makeReport(source: string, patch: Partial<FetcherReport> = {}): FetcherReport {
  const warnings = patch.warnings ?? [];
  const errors = patch.errors ?? [];
  return {
    source,
    status: patch.status ?? (errors.length ? "failed" : warnings.length ? "partial" : "success"),
    fetched: patch.fetched ?? {},
    writes: patch.writes ?? [],
    warnings,
    errors
  };
}

export function printReport(report: FetcherReport) {
  console.log(`${report.status.toUpperCase()}: ${report.source}`);
  for (const [key, count] of Object.entries(report.fetched)) console.log(`Fetched ${key}: ${count}`);
  for (const write of report.writes) {
    console.log(`${write.dryRun ? "Dry run" : "Wrote"} ${write.fileName}: inserted=${write.rowsInserted}, skipped=${write.rowsSkipped}`);
  }
  for (const warning of report.warnings) console.warn(`Warning: ${warning}`);
  for (const error of report.errors) console.error(`Error: ${error}`);
}

export function shouldRun(env: FetcherEnv, flagName: string, force = false) {
  return force || envFlag(env, flagName);
}

export async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function redactUrl(url: string) {
  return url.replace(/([?&](?:token|key|api_key|authorization)=)[^&]+/gi, "$1[redacted]");
}

async function readIfExists(filePath: string) {
  try {
    await access(filePath);
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function normalizeRow(columns: string[], row: Record<string, unknown>) {
  return Object.fromEntries(columns.map((column) => [column, stringify(row[column])]));
}

function stringify(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function uniqueBy(rows: Array<Record<string, string>>, uniqueColumns: string[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = stableKey(row, uniqueColumns);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableKey(row: Record<string, string>, uniqueColumns: string[]) {
  return uniqueColumns.map((column) => stableSlug(row[column] ?? "")).join("|");
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => quoteCsv(row[header] ?? "")).join(",")).join("\n")}${rows.length ? "\n" : ""}`;
}

function parseCsv(content: string) {
  const table = parseDelimited(content);
  const headers = table[0] ?? [];
  return table.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function parseDelimited(content: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === ",") {
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
