import { readFile } from "node:fs/promises";
import path from "node:path";
import { acceptedPrivateInboxFileNames, PRIVATE_INBOX_DIR, scanPrivateNormalizedInbox } from "./privateNormalizedInbox";
import { parseNormalizedCsv } from "./validation/normalizedFileValidator";

export type AutoAllLineageFile = {
  fileName: string;
  detectedType: string;
  validationStatus: string;
  rowsParsed: number;
  blocksCovered: string[];
  applyEligible: boolean;
  sourceNames: string[];
  confidenceValues: number[];
  sampleSizeTotal: number;
  warnings: string[];
  errors: string[];
  summary: string;
};

export type AutoAllLineageResult = {
  matchId?: string;
  inboxPath: string;
  files: AutoAllLineageFile[];
  nextAction: string;
};

export async function getAutoAllSourceLineage(matchId?: string): Promise<AutoAllLineageResult> {
  const scan = await scanPrivateNormalizedInbox(matchId, { trustedLocalImports: false });
  const files: AutoAllLineageFile[] = [];
  for (const report of scan.reports.filter((item) => acceptedPrivateInboxFileNames().includes(item.fileName))) {
    files.push({
      fileName: report.fileName,
      detectedType: report.detectedType,
      validationStatus: report.validationStatus,
      rowsParsed: report.rowsParsed,
      blocksCovered: report.blocksCovered,
      applyEligible: report.applyEligible,
      ...(await extractHints(report.fileName)),
      warnings: report.warnings.slice(0, 4),
      errors: report.errors.slice(0, 4),
      summary: report.summary
    });
  }
  const missing = ["map_stats.csv", "player_stats.csv", "veto_history.csv"].filter((fileName) => !files.some((file) => file.fileName === fileName && file.validationStatus === "passed"));
  return {
    matchId,
    inboxPath: scan.inboxPath,
    files,
    nextAction: missing.length
      ? `Still missing validated ${missing.join(", ")}. Use Auto-All, CSStats CSV, parsed demo, or manual templates.`
      : "Validated private-inbox files are present. Review /admin/imports before Apply."
  };
}

async function extractHints(fileName: string) {
  if (fileName.endsWith(".json")) return extractJsonHints(fileName);
  return extractCsvHints(fileName);
}

async function extractCsvHints(fileName: string) {
  try {
    const content = await readFile(path.join(PRIVATE_INBOX_DIR, fileName), "utf8");
    const parsed = parseNormalizedCsv(content);
    const values = parsed.rows.map((row) => row.values);
    return {
      sourceNames: unique(values.map((row) => row.sourceName).filter(Boolean)),
      confidenceValues: uniqueNumbers(values.map((row) => Number(row.confidence))),
      sampleSizeTotal: values.reduce((sum, row) => sum + numeric(row.sampleSize), 0)
    };
  } catch {
    return emptyHints();
  }
}

async function extractJsonHints(fileName: string) {
  try {
    const content = await readFile(path.join(PRIVATE_INBOX_DIR, fileName), "utf8");
    const json = JSON.parse(content) as Record<string, unknown>;
    const sourceNames = [json.sourceName, json.sourceTool].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    return {
      sourceNames: unique(sourceNames),
      confidenceValues: uniqueNumbers([Number(json.confidence)]),
      sampleSizeTotal: numeric(json.sampleSize)
    };
  } catch {
    return emptyHints();
  }
}

function emptyHints() {
  return { sourceNames: [], confidenceValues: [], sampleSizeTotal: 0 };
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 4);
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].slice(0, 4);
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
