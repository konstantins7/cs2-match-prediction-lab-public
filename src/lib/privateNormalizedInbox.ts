import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { applyAnalystSheetImport, validateAnalystSheetImport, type AnalystSheetInput, type AnalystSheetValidationResult } from "./analystSheetImport";
import { applyManualEnrichment, validateManualEnrichment } from "./manualEnrichment";
import { applyParsedDemoExport, validateParsedDemoExport } from "./parsedDemoExport";

export const PRIVATE_INBOX_DIR = path.join(process.cwd(), "data", "private-inbox");

export type PrivateInboxFileType =
  | "roster"
  | "player_stats"
  | "map_stats"
  | "veto_history"
  | "team_form"
  | "h2h"
  | "news_events"
  | "manual_real_pack"
  | "parsed_demo_export";

export type PrivateInboxFileReport = {
  fileName: string;
  fullPath: string;
  detectedType: PrivateInboxFileType | "unsupported";
  found: boolean;
  validationStatus: "not_checked" | "passed" | "failed" | "unsupported";
  applyEligible: boolean;
  autoApplied: boolean;
  rowsParsed: number;
  blocksCovered: string[];
  errors: string[];
  warnings: string[];
  recordsCreated: number;
  recordsUpdated: number;
  summary: string;
};

export type PrivateInboxScanResult = {
  inboxPath: string;
  trustedLocalImportsEnabled: boolean;
  filesFound: number;
  acceptedFiles: number;
  validationPassed: number;
  validationFailed: number;
  recordsCreated: number;
  recordsUpdated: number;
  reports: PrivateInboxFileReport[];
  warnings: string[];
};

const csvTypes: Record<string, PrivateInboxFileType> = {
  "roster.csv": "roster",
  "player_stats.csv": "player_stats",
  "map_stats.csv": "map_stats",
  "veto_history.csv": "veto_history",
  "team_form.csv": "team_form",
  "h2h.csv": "h2h",
  "news_events.csv": "news_events"
};

export function isTrustedLocalImportEnabled(env: Record<string, string | undefined> = process.env) {
  return String(env.ENABLE_TRUSTED_LOCAL_IMPORTS ?? "false").toLowerCase() === "true";
}

export function detectPrivateInboxFileType(fileName: string): PrivateInboxFileType | "unsupported" {
  const normalized = fileName.trim().toLowerCase();
  if (csvTypes[normalized]) return csvTypes[normalized];
  if (normalized === "manual_real_pack.json") return "manual_real_pack";
  if (normalized === "parsed_demo_export.json") return "parsed_demo_export";
  return "unsupported";
}

export function acceptedPrivateInboxFileNames() {
  return [...Object.keys(csvTypes), "manual_real_pack.json", "parsed_demo_export.json"];
}

export async function scanPrivateNormalizedInbox(matchId?: string, options: { trustedLocalImports?: boolean } = {}): Promise<PrivateInboxScanResult> {
  const trustedLocalImportsEnabled = options.trustedLocalImports ?? isTrustedLocalImportEnabled();
  const warnings: string[] = [];
  let entries: string[] = [];
  try {
    const folder = await stat(PRIVATE_INBOX_DIR);
    if (!folder.isDirectory()) warnings.push(`${PRIVATE_INBOX_DIR} exists but is not a directory.`);
    else entries = await readdir(PRIVATE_INBOX_DIR);
  } catch {
    warnings.push(`Private inbox folder not found: ${PRIVATE_INBOX_DIR}.`);
  }

  const reports: PrivateInboxFileReport[] = [];
  for (const fileName of entries.sort()) {
    const detectedType = detectPrivateInboxFileType(fileName);
    const fullPath = path.join(PRIVATE_INBOX_DIR, fileName);
    if (detectedType === "unsupported") {
      reports.push(baseReport({ fileName, fullPath, detectedType, validationStatus: "unsupported", summary: "Unsupported file ignored. Only normalized CSV/JSON files are accepted." }));
      continue;
    }
    const content = await readFile(fullPath, "utf8");
    reports.push(await validateAndMaybeApplyPrivateFile({
      fileName,
      fullPath,
      detectedType,
      content,
      matchId,
      trustedLocalImportsEnabled
    }));
  }

  return {
    inboxPath: PRIVATE_INBOX_DIR,
    trustedLocalImportsEnabled,
    filesFound: reports.length,
    acceptedFiles: reports.filter((report) => report.detectedType !== "unsupported").length,
    validationPassed: reports.filter((report) => report.validationStatus === "passed").length,
    validationFailed: reports.filter((report) => report.validationStatus === "failed").length,
    recordsCreated: reports.reduce((sum, report) => sum + report.recordsCreated, 0),
    recordsUpdated: reports.reduce((sum, report) => sum + report.recordsUpdated, 0),
    reports,
    warnings
  };
}

async function validateAndMaybeApplyPrivateFile(params: {
  fileName: string;
  fullPath: string;
  detectedType: PrivateInboxFileType;
  content: string;
  matchId?: string;
  trustedLocalImportsEnabled: boolean;
}): Promise<PrivateInboxFileReport> {
  if (!params.content.trim()) {
    return baseReport({ ...params, validationStatus: "failed", errors: ["File is empty."], summary: "Empty normalized file cannot be used." });
  }
  if (params.detectedType.endsWith("_pack") || params.detectedType === "parsed_demo_export") {
    return validateJsonDrop(params);
  }
  if (!params.matchId) {
    return baseReport({
      ...params,
      validationStatus: "not_checked",
      summary: "CSV detected. Add matchId to validate row/block coverage against a target match."
    });
  }
  if (params.detectedType === "team_form") {
    return baseReport({
      ...params,
      validationStatus: "not_checked",
      summary: "team_form.csv is accepted by the inbox contract, but existing apply flow does not yet expose a standalone team_form CSV importer."
    });
  }

  const sheetType = params.detectedType as AnalystSheetInput["sheetType"];
  const validation = await validateAnalystSheetImport({ matchId: params.matchId, sheets: [{ sheetType, content: params.content }] });
  const canApply = validation.ok && params.trustedLocalImportsEnabled;
  let recordsCreated = 0;
  const recordsUpdated = 0;
  let autoApplied = false;
  if (canApply) {
    const applied = await applyAnalystSheetImport({ matchId: params.matchId, sheets: [{ sheetType, content: params.content }] });
    autoApplied = Boolean(applied.applied);
    recordsCreated = countCreates(applied.recordsPreview);
  }
  return reportFromAnalystValidation(params, validation, {
    autoApplied,
    recordsCreated,
    recordsUpdated,
    summary: validation.ok
      ? params.trustedLocalImportsEnabled ? "Validation passed and trusted local imports allowed auto-apply." : "Validation passed; trusted local imports disabled, preview only."
      : "Validation failed; file cannot be applied."
  });
}

async function validateJsonDrop(params: {
  fileName: string;
  fullPath: string;
  detectedType: PrivateInboxFileType;
  content: string;
  trustedLocalImportsEnabled: boolean;
}) {
  if (params.detectedType === "manual_real_pack") {
    const validation = await validateManualEnrichment(params.content);
    const record = validation as Record<string, unknown>;
    const ok = Boolean(record.ok);
    let recordsCreated = 0;
    let autoApplied = false;
    if (ok && params.trustedLocalImportsEnabled) {
      const applied = await applyManualEnrichment(params.content) as Record<string, unknown>;
      autoApplied = Boolean(applied.applied);
      recordsCreated = countCreates(Array.isArray(applied.creates) ? applied.creates.map(String) : []);
    }
    return baseReport({
      ...params,
      validationStatus: ok ? "passed" : "failed",
      applyEligible: ok,
      autoApplied,
      rowsParsed: Number(record.rowsParsed ?? 0),
      blocksCovered: [],
      errors: Array.isArray(record.errors) ? record.errors.map(String) : [],
      warnings: Array.isArray(record.warnings) ? record.warnings.map(String) : [],
      recordsCreated,
      summary: ok ? "manual_real_pack.json validation passed." : "manual_real_pack.json validation failed."
    });
  }

  const validation = await validateParsedDemoExport(params.content);
  const ok = Boolean(validation.ok);
  let recordsCreated = 0;
  let autoApplied = false;
  if (ok && params.trustedLocalImportsEnabled) {
    const applied = await applyParsedDemoExport(params.content) as Record<string, unknown>;
    autoApplied = Boolean(applied.applied);
    recordsCreated = countCreates(Array.isArray(applied.creates) ? applied.creates.map(String) : []);
  }
  return baseReport({
    ...params,
    validationStatus: ok ? "passed" : "failed",
    applyEligible: ok,
    autoApplied,
    rowsParsed: 0,
    blocksCovered: [],
    errors: validation.errors,
    warnings: validation.warnings,
    recordsCreated,
    summary: ok ? "parsed_demo_export.json validation passed." : "parsed_demo_export.json validation failed."
  });
}

function reportFromAnalystValidation(
  params: { fileName: string; fullPath: string; detectedType: PrivateInboxFileType },
  validation: AnalystSheetValidationResult,
  extra: { autoApplied: boolean; recordsCreated: number; recordsUpdated: number; summary: string }
) {
  return baseReport({
    ...params,
    validationStatus: validation.ok ? "passed" : "failed",
    applyEligible: validation.ok,
    autoApplied: extra.autoApplied,
    rowsParsed: validation.rowsParsed,
    blocksCovered: validation.coveredBlocks,
    errors: validation.errors,
    warnings: validation.warnings,
    recordsCreated: extra.recordsCreated,
    recordsUpdated: extra.recordsUpdated,
    summary: extra.summary
  });
}

function baseReport(params: Partial<PrivateInboxFileReport> & { fileName: string; fullPath: string; detectedType: PrivateInboxFileReport["detectedType"] }): PrivateInboxFileReport {
  return {
    fileName: params.fileName,
    fullPath: params.fullPath,
    detectedType: params.detectedType,
    found: true,
    validationStatus: params.validationStatus ?? "not_checked",
    applyEligible: params.applyEligible ?? false,
    autoApplied: params.autoApplied ?? false,
    rowsParsed: params.rowsParsed ?? 0,
    blocksCovered: params.blocksCovered ?? [],
    errors: params.errors ?? [],
    warnings: params.warnings ?? [],
    recordsCreated: params.recordsCreated ?? 0,
    recordsUpdated: params.recordsUpdated ?? 0,
    summary: params.summary ?? "Not checked."
  };
}

function countCreates(preview: string[] | undefined) {
  return preview?.reduce((sum, row) => {
    const match = row.match(/(\d+)/);
    return sum + (match ? Number(match[1]) : 0);
  }, 0) ?? 0;
}
