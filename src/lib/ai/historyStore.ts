import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalystSheetType } from "@/lib/analystSheetTemplates";
import { redactString } from "@/lib/security/redaction";

export type AiHistoryStatus = "success" | "error" | "disabled" | "partial";

export type AiHistoryRecord = {
  id: string;
  timestamp: string;
  matchId?: string;
  teamA?: string;
  teamB?: string;
  status: AiHistoryStatus;
  sourceHint?: string;
  sourceSite?: string;
  detectedSource?: string;
  promptVersion?: string;
  promptVariant?: string;
  model?: string;
  confidence?: number;
  durationMs?: number;
  cached?: boolean;
  sheetCounts: Partial<Record<AnalystSheetType, number>>;
  warnings: string[];
  errors: string[];
  inputPreview?: string;
  rawOutput?: unknown;
  badExample?: boolean;
  excludedFromFineTuning?: boolean;
};

export type AiHistoryQuery = {
  page?: number;
  pageSize?: number;
  matchId?: string;
  status?: string;
  source?: string;
  from?: string;
  to?: string;
};

export type AiHistoryPage = {
  records: AiHistoryRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const root = path.join(process.cwd(), "data", "cache", "ai-history");
const historyPath = path.join(root, "history.jsonl");
const archiveDir = path.join(root, "archive");
const maxActiveRecords = 1000;

export function aiHistoryConfig(env: Record<string, string | undefined> = process.env) {
  return {
    retainDays: Math.max(1, Number(env.AI_HISTORY_RETAIN_DAYS || 30)),
    inputChars: Math.max(0, Number(env.AI_HISTORY_INPUT_CHARS || 500)),
    fullInput: env.AI_HISTORY_FULL_INPUT === "true"
  };
}

export function buildAiHistoryRecord(input: Partial<AiHistoryRecord> & { inputText?: string; rawOutput?: unknown }, env: Record<string, string | undefined> = process.env): AiHistoryRecord {
  const config = aiHistoryConfig(env);
  const timestamp = input.timestamp || new Date().toISOString();
  const id = input.id || hash(`${timestamp}:${input.matchId ?? ""}:${input.promptVersion ?? ""}:${input.durationMs ?? ""}:${Math.random()}`);
  const inputPreview = input.inputText
    ? redactString(config.fullInput ? input.inputText : input.inputText.slice(0, config.inputChars))
    : input.inputPreview;
  return {
    id,
    timestamp,
    matchId: input.matchId,
    teamA: input.teamA,
    teamB: input.teamB,
    status: input.status || "partial",
    sourceHint: input.sourceHint,
    sourceSite: input.sourceSite,
    detectedSource: input.detectedSource,
    promptVersion: input.promptVersion,
    promptVariant: input.promptVariant,
    model: input.model,
    confidence: finiteNumber(input.confidence),
    durationMs: finiteNumber(input.durationMs),
    cached: input.cached,
    sheetCounts: input.sheetCounts || {},
    warnings: (input.warnings || []).map((item) => redactString(String(item))).filter(Boolean),
    errors: (input.errors || []).map((item) => redactString(String(item))).filter(Boolean),
    inputPreview,
    rawOutput: input.rawOutput === undefined ? undefined : redactDeep(input.rawOutput),
    badExample: Boolean(input.badExample),
    excludedFromFineTuning: Boolean(input.excludedFromFineTuning)
  };
}

export function logAiHistory(input: Partial<AiHistoryRecord> & { inputText?: string; rawOutput?: unknown }) {
  const record = buildAiHistoryRecord(input);
  void appendHistoryRecord(record).catch(() => undefined);
  return record;
}

export async function appendHistoryRecord(record: AiHistoryRecord) {
  await mkdir(root, { recursive: true });
  await appendFile(historyPath, `${JSON.stringify(record)}\n`, "utf8");
  await rotateHistory().catch(() => undefined);
}

export async function readAiHistory(query: AiHistoryQuery = {}): Promise<AiHistoryPage> {
  const records = filterRecords(await readAllRecords(), query).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const pageSize = clampInt(query.pageSize, 1, 100, 50);
  const page = clampInt(query.page, 1, Math.max(1, Math.ceil(records.length / pageSize)), 1);
  const start = (page - 1) * pageSize;
  return {
    records: records.slice(start, start + pageSize),
    total: records.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(records.length / pageSize))
  };
}

export async function getAiHistoryRecord(id: string) {
  return (await readAllRecords()).find((record) => record.id === id) ?? null;
}

export async function markAiHistoryBad(id: string, badExample = true) {
  const records = await readAllRecords();
  const next = records.map((record) => record.id === id ? { ...record, badExample, excludedFromFineTuning: badExample } : record);
  await writeRecords(next);
  return next.find((record) => record.id === id) ?? null;
}

export async function clearAiHistory() {
  await mkdir(archiveDir, { recursive: true });
  try {
    await rename(historyPath, path.join(archiveDir, `history-cleared-${safeTimestamp()}.jsonl`));
  } catch {
    await writeFile(historyPath, "", "utf8");
  }
  await mkdir(root, { recursive: true });
  await writeFile(historyPath, "", "utf8");
}

export async function exportAiHistoryCsv(query: AiHistoryQuery = {}) {
  const page = await readAiHistory({ ...query, page: 1, pageSize: 1000 });
  const headers = ["timestamp", "matchId", "status", "source", "promptVersion", "confidence", "durationMs", "cached", "sheetCounts", "warnings", "errors"];
  const rows = page.records.map((record) => [
    record.timestamp,
    record.matchId ?? "",
    record.status,
    record.detectedSource || record.sourceSite || "",
    record.promptVersion ?? "",
    String(record.confidence ?? ""),
    String(record.durationMs ?? ""),
    String(Boolean(record.cached)),
    Object.entries(record.sheetCounts).map(([key, value]) => `${key}:${value}`).join("|"),
    record.warnings.join("; "),
    record.errors.join("; ")
  ]);
  return `${headers.join(",")}\n${rows.map((row) => row.map(csv).join(",")).join("\n")}\n`;
}

export async function historyStats() {
  const records = await readAllRecords();
  const total = records.length;
  const success = records.filter((record) => record.status === "success").length;
  const errors = records.filter((record) => record.status === "error").length;
  const confidenceValues = records.map((record) => record.confidence).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const sources = countBy(records.map((record) => record.detectedSource || record.sourceSite || "unknown"));
  return {
    total,
    success,
    errors,
    disabled: records.filter((record) => record.status === "disabled").length,
    averageConfidence: confidenceValues.length ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) : 0,
    sources,
    recent: records.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10)
  };
}

export function sheetCountsFromSheets(sheets: Array<{ sheetType: AnalystSheetType; rows?: unknown[]; content?: string }>) {
  return Object.fromEntries(sheets.map((sheet) => [sheet.sheetType, Array.isArray(sheet.rows) ? sheet.rows.length : rowsFromCsv(sheet.content || "")])) as Partial<Record<AnalystSheetType, number>>;
}

export async function acceptedExampleStats() {
  const acceptedDir = path.join(process.cwd(), "data", "cache", "ai-responses", "accepted");
  try {
    const files = await import("node:fs/promises").then((fs) => fs.readdir(acceptedDir));
    return { count: files.filter((file) => file.endsWith(".json")).length, path: acceptedDir };
  } catch {
    return { count: 0, path: acceptedDir };
  }
}

async function readAllRecords() {
  try {
    const lines = (await readFile(historyPath, "utf8")).split(/\r?\n/).filter(Boolean);
    return lines.map((line) => JSON.parse(line) as AiHistoryRecord).filter((record) => record && typeof record.id === "string");
  } catch {
    return [];
  }
}

async function writeRecords(records: AiHistoryRecord[]) {
  await mkdir(root, { recursive: true });
  await writeFile(historyPath, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), "utf8");
}

async function rotateHistory() {
  const records = await readAllRecords();
  if (!records.length) return;
  const config = aiHistoryConfig();
  const cutoff = Date.now() - config.retainDays * 24 * 60 * 60 * 1000;
  const sorted = records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const keepByAge = sorted.filter((record) => new Date(record.timestamp).getTime() >= cutoff);
  const keep = keepByAge.slice(-maxActiveRecords);
  const archive = sorted.filter((record) => !keep.some((candidate) => candidate.id === record.id));
  if (!archive.length) return;
  await mkdir(archiveDir, { recursive: true });
  await writeFile(path.join(archiveDir, `history-archive-${safeTimestamp()}.jsonl`), archive.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  await writeRecords(keep);
}

function filterRecords(records: AiHistoryRecord[], query: AiHistoryQuery) {
  const matchId = (query.matchId || "").trim().toLowerCase();
  const status = (query.status || "").trim().toLowerCase();
  const source = (query.source || "").trim().toLowerCase();
  const from = query.from ? new Date(query.from).getTime() : null;
  const to = query.to ? new Date(query.to).getTime() : null;
  return records.filter((record) => {
    const time = new Date(record.timestamp).getTime();
    if (matchId && !String(record.matchId || "").toLowerCase().includes(matchId)) return false;
    if (status && record.status !== status) return false;
    if (source && !`${record.detectedSource || ""} ${record.sourceSite || ""}`.toLowerCase().includes(source)) return false;
    if (from && time < from) return false;
    if (to && time > to) return false;
    return true;
  });
}

function redactDeep(value: unknown): unknown {
  if (typeof value === "string") return redactString(value).slice(0, 20_000);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      /(key|token|secret|password|authorization|bearer)/i.test(key) ? "[REDACTED]" : redactDeep(nested)
    ]));
  }
  return value;
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function rowsFromCsv(content: string) {
  return content.trim().split(/\r?\n/).filter(Boolean).length > 1 ? content.trim().split(/\r?\n/).length - 1 : 0;
}

function csv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
