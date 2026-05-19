import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analystSheetTemplates } from "../../src/lib/analystSheetTemplates";
import { inspectOfflineDatasetCsv, offlineDatasetProfiles, type OfflineDatasetType } from "../../src/lib/offlineDatasetInspector";
import { validateNormalizedFile } from "../../src/lib/validation/normalizedFileValidator";

type CliArgs = Record<string, string | boolean>;

export type CommunityDatasetRegistryEntry = {
  fileName: string;
  filePath: string;
  kind: "normalized_private_inbox" | "offline_dataset" | "unsupported";
  ok: boolean;
  rows: number;
  columns: number;
  role: "local research/training context";
  canRaiseRealForecastReady: false;
  warnings: string[];
  errors: string[];
  detectedType?: string;
};

export type CommunityDatasetRegistryReport = {
  generatedAt: string;
  rootPath: string;
  entries: CommunityDatasetRegistryEntry[];
  summary: {
    files: number;
    ok: number;
    warnings: number;
    errors: number;
  };
};

const normalizedFileNames = new Set(Object.values(analystSheetTemplates).map((template) => template.filename.toLowerCase()));
const offlineByFileName = new Map(Object.values(offlineDatasetProfiles).map((profile) => [profile.filename.toLowerCase(), profile.type]));

export async function scanCommunityDatasetRegistry(options: { rootPath?: string; maxRows?: number } = {}): Promise<CommunityDatasetRegistryReport> {
  const rootPath = path.resolve(process.cwd(), options.rootPath ?? path.join("data", "community-datasets"));
  let fileNames: string[] = [];
  try {
    fileNames = (await readdir(rootPath)).filter((fileName) => fileName.toLowerCase().endsWith(".csv")).sort((a, b) => a.localeCompare(b));
  } catch {
    fileNames = [];
  }
  const entries: CommunityDatasetRegistryEntry[] = [];
  for (const fileName of fileNames) {
    const filePath = path.join(rootPath, fileName);
    const content = await readFile(filePath, "utf8");
    entries.push(inspectCommunityDatasetFile({ fileName, filePath, content, maxRows: options.maxRows }));
  }
  return {
    generatedAt: new Date().toISOString(),
    rootPath,
    entries,
    summary: {
      files: entries.length,
      ok: entries.filter((entry) => entry.ok).length,
      warnings: entries.reduce((sum, entry) => sum + entry.warnings.length, 0),
      errors: entries.reduce((sum, entry) => sum + entry.errors.length, 0)
    }
  };
}

export function inspectCommunityDatasetFile(input: { fileName: string; filePath?: string; content: string; maxRows?: number }): CommunityDatasetRegistryEntry {
  const lower = input.fileName.toLowerCase();
  if (normalizedFileNames.has(lower)) {
    const validation = validateNormalizedFile({ fileName: input.fileName, content: input.content });
    return {
      fileName: input.fileName,
      filePath: input.filePath ?? input.fileName,
      kind: "normalized_private_inbox",
      ok: validation.isValid,
      rows: validation.rowsParsed,
      columns: input.content.split(/\r?\n/).find((line) => line.trim())?.split(",").length ?? 0,
      role: "local research/training context",
      canRaiseRealForecastReady: false,
      warnings: [
        "Community dataset registry does not Apply files. Copy validated rows to private-inbox and review in /admin/imports.",
        ...validation.warnings
      ],
      errors: validation.errors,
      detectedType: validation.detectedType
    };
  }
  const offlineType = offlineByFileName.get(lower);
  if (offlineType) {
    const inspection = inspectOfflineDatasetCsv({ datasetType: offlineType as OfflineDatasetType, content: input.content, maxRows: input.maxRows });
    return {
      fileName: input.fileName,
      filePath: input.filePath ?? input.fileName,
      kind: "offline_dataset",
      ok: inspection.ok,
      rows: inspection.rows,
      columns: inspection.columns,
      role: "local research/training context",
      canRaiseRealForecastReady: false,
      warnings: inspection.warnings,
      errors: inspection.errors,
      detectedType: inspection.datasetType
    };
  }
  return {
    fileName: input.fileName,
    filePath: input.filePath ?? input.fileName,
    kind: "unsupported",
    ok: false,
    rows: 0,
    columns: 0,
    role: "local research/training context",
    canRaiseRealForecastReady: false,
    warnings: ["Unsupported community dataset filename. Use accepted normalized CSV names or offline dataset profile names."],
    errors: ["Unsupported community dataset schema."],
    detectedType: "unsupported"
  };
}

export async function runCommunityDatasetRegistryCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = await scanCommunityDatasetRegistry({
    rootPath: stringArg(args, "root") || undefined,
    maxRows: numberArg(args, "maxRows", 1000)
  });
  console.log(JSON.stringify(report, null, 2));
}

function parseArgs(argv: string[]) {
  const parsed: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
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

function stringArg(args: CliArgs, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function numberArg(args: CliArgs, key: string, fallback: number) {
  const value = Number(stringArg(args, key));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runCommunityDatasetRegistryCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
