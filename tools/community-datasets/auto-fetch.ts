import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analystSheetTemplates, type AnalystSheetType } from "../../src/lib/analystSheetTemplates";
import { validateNormalizedFile } from "../../src/lib/validation/normalizedFileValidator";
import { fetchText, getISODate, mergeSheetRows, parseCliArgs, type CsvMergeResult, type FetchLike, type FetcherEnv } from "../data-fetchers/utils";

type CommunityDatasetRegistrySource = {
  id: string;
  url: string;
  fileName: string;
  updatedAt?: string;
  maxAgeDays?: number;
};

export type CommunityDatasetAutoFetchOptions = {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  registryPath?: string;
  inboxPath?: string;
  dryRun?: boolean;
  now?: Date;
  target?: {
    matchId: string;
    teamNames: string[];
    matchStartTime: Date;
  };
};

export type CommunityDatasetAutoFetchReport = {
  source: "community-datasets-auto-fetch";
  status: "success" | "partial" | "skipped" | "failed";
  dryRun: boolean;
  checked: number;
  writes: CsvMergeResult[];
  warnings: string[];
  errors: string[];
};

const uniqueColumnsBySheet: Record<AnalystSheetType, string[]> = {
  roster: ["matchId", "teamName", "nickname", "sourceName"],
  player_stats: ["matchId", "teamName", "nickname", "sourceName", "period"],
  map_stats: ["matchId", "teamName", "mapName", "sourceName", "period"],
  veto_history: ["matchId", "teamName", "mapName", "sourceName", "period"],
  h2h: ["matchId", "date", "teamA", "teamB", "mapName", "sourceName"],
  news_events: ["matchId", "sourceName", "title", "publishedAt"]
};

export async function runCommunityDatasetAutoFetch(options: CommunityDatasetAutoFetchOptions = {}): Promise<CommunityDatasetAutoFetchReport> {
  const env = options.env ?? process.env;
  const warnings: string[] = [];
  const errors: string[] = [];
  const writes: CsvMergeResult[] = [];
  if (env.ENABLE_COMMUNITY_DATASETS !== "true") {
    return { source: "community-datasets-auto-fetch", status: "skipped", dryRun: Boolean(options.dryRun), checked: 0, writes, warnings: ["ENABLE_COMMUNITY_DATASETS=true is required."], errors };
  }
  const registry = await loadRegistry(options.registryPath);
  for (const entry of registry) {
    const sheetType = sheetTypeFromFileName(entry.fileName);
    if (!sheetType) {
      warnings.push(`${entry.id}: unsupported target file ${entry.fileName}.`);
      continue;
    }
    if (!isAllowedCommunityDatasetUrl(entry.url)) {
      warnings.push(`${entry.id}: URL host is not allowlisted.`);
      continue;
    }
    if (isStale(entry.updatedAt, entry.maxAgeDays, options.now ?? new Date())) {
      warnings.push(`${entry.id}: registry entry is stale.`);
      continue;
    }
    try {
      const content = await fetchText(entry.url, {
        headers: {
          Accept: "application/json,text/csv,text/plain,*/*",
          "User-Agent": "CS2MatchPredictionLab/1.0-research community dataset sync"
        }
      }, options.fetchImpl);
      const normalized = normalizeCommunityPayload(content);
      const leakage = filterForTarget(normalized.rows, options.target);
      warnings.push(...leakage.warnings.map((warning) => `${entry.id}: ${warning}`));
      if (!leakage.ok) continue;
      const validation = validateNormalizedFile({ fileName: entry.fileName, rows: leakage.rows, content: rowsToCsv(leakage.rows) || normalized.content });
      warnings.push(...validation.warnings.map((warning) => `${entry.id}: ${warning}`));
      if (!validation.isValid || !leakage.rows.length) {
        warnings.push(`${entry.id}: dataset did not validate against ${entry.fileName}.`);
        continue;
      }
      writes.push(await mergeSheetRows(sheetType, leakage.rows, uniqueColumnsBySheet[sheetType], {
        dryRun: options.dryRun,
        inboxPath: options.inboxPath,
        env
      }));
    } catch (error) {
      errors.push(`${entry.id}: ${error instanceof Error ? error.message : "community dataset fetch failed"}`);
    }
  }
  return {
    source: "community-datasets-auto-fetch",
    status: errors.length ? "failed" : writes.length ? "success" : warnings.length ? "partial" : "skipped",
    dryRun: Boolean(options.dryRun),
    checked: registry.length,
    writes,
    warnings,
    errors
  };
}

function filterForTarget(rows: Array<Record<string, unknown>>, target: CommunityDatasetAutoFetchOptions["target"]) {
  if (!target) return { ok: true, rows, warnings: [] };
  const warnings: string[] = [];
  const targetTeams = target.teamNames.map((team) => team.trim().toLowerCase()).filter(Boolean);
  const filtered: Array<Record<string, unknown>> = [];
  let leakageViolation = false;
  for (const row of rows) {
    if (String(row.matchId ?? target.matchId) !== target.matchId && row.matchId) continue;
    const rowTeams = [row.teamName, row.team, row.teamA, row.teamB, row.affectedTeam].map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
    if (targetTeams.length && rowTeams.length && !rowTeams.some((team) => targetTeams.includes(team))) continue;
    const rawDate = row.sourceDate ?? row.collectedAt ?? row.date ?? row.publishedAt;
    if (!rawDate) {
      warnings.push("row missing sourceDate/collectedAt; rejected for pre-match evidence.");
      leakageViolation = true;
      continue;
    }
    const timestamp = new Date(String(rawDate)).getTime();
    if (!Number.isFinite(timestamp) || timestamp > target.matchStartTime.getTime()) {
      warnings.push("row sourceDate/collectedAt is after match start; rejected to prevent data leakage.");
      leakageViolation = true;
      continue;
    }
    filtered.push({ ...row, matchId: target.matchId });
  }
  if (leakageViolation) return { ok: false, rows: [], warnings: [...new Set(warnings), "dataset skipped because at least one target row violates pre-match leakage rules."] };
  return { ok: true, rows: filtered, warnings };
}

function rowsToCsv(rows: Array<Record<string, unknown>>) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!headers.length) return "";
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\n")}\n`;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function normalizeCommunityPayload(content: string) {
  const payload = parseJson(content);
  if (payload) {
    const rows = rowsFromJson(payload);
    return { rows, content: "" };
  }
  return { rows: parseCsvRows(content), content };
}

async function loadRegistry(registryPath?: string): Promise<CommunityDatasetRegistrySource[]> {
  const resolved = path.resolve(process.cwd(), registryPath ?? path.join("tools", "community-datasets", "registry.json"));
  const parsed = JSON.parse(await readFile(resolved, "utf8")) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is CommunityDatasetRegistrySource => Boolean(entry && typeof entry === "object" && typeof (entry as CommunityDatasetRegistrySource).id === "string" && typeof (entry as CommunityDatasetRegistrySource).url === "string" && typeof (entry as CommunityDatasetRegistrySource).fileName === "string"))
    : [];
}

function sheetTypeFromFileName(fileName: string) {
  return (Object.entries(analystSheetTemplates).find(([, template]) => template.filename.toLowerCase() === fileName.toLowerCase())?.[0] ?? "") as AnalystSheetType | "";
}

function isAllowedCommunityDatasetUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && ["raw.githubusercontent.com", "gist.githubusercontent.com"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isStale(updatedAt: string | undefined, maxAgeDays: number | undefined, now: Date) {
  if (!updatedAt || !maxAgeDays) return false;
  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return now.getTime() - timestamp > maxAgeDays * 24 * 60 * 60 * 1000;
}

function parseJson(content: string) {
  const trimmed = content.trim();
  if (!/^[{[]/.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function rowsFromJson(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ["rows", "data", "records", "items"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseCsvRows(content: string) {
  const rows = parseDelimited(content);
  const headers = rows[0] ?? [];
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
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

export async function runCommunityDatasetAutoFetchCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const report = await runCommunityDatasetAutoFetch({
    dryRun: Boolean(args["dry-run"]),
    registryPath: typeof args.registry === "string" ? args.registry : undefined,
    inboxPath: typeof args.inbox === "string" ? args.inbox : undefined,
    target: typeof args.matchId === "string" && typeof args.matchStartTime === "string"
      ? {
        matchId: args.matchId,
        teamNames: [typeof args.teamA === "string" ? args.teamA : "", typeof args.teamB === "string" ? args.teamB : ""].filter(Boolean),
        matchStartTime: new Date(args.matchStartTime)
      }
      : undefined,
    now: new Date(getISODate())
  });
  console.log(JSON.stringify(report, null, 2));
}

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runCommunityDatasetAutoFetchCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
