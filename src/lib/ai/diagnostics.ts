import type { AiExtractedSheet, LocalAiExtractionResult } from "./localAiExtraction";
import { analystSheetTypes, type AnalystSheetType } from "@/lib/analystSheetTemplates";

export type AiDiagnosticReason =
  | "disabled"
  | "ollama_connection"
  | "timeout"
  | "invalid_json"
  | "low_confidence"
  | "empty_sheets"
  | "validation_error"
  | "success"
  | "unknown_error";

export type AiExtractionDiagnostics = {
  reasonCode: AiDiagnosticReason;
  headline: string;
  tips: string[];
  missingBlocks: AnalystSheetType[];
  fieldIssues: Array<{ sheetType: AnalystSheetType; field?: string; severity: "error" | "warning"; message: string }>;
  ollamaHint?: string;
};

export function diagnosticsFromDisabled(): AiExtractionDiagnostics {
  return {
    reasonCode: "disabled",
    headline: "Local AI is disabled.",
    tips: [
      "Set ENABLE_LOCAL_AI=true in .env.local.",
      "Install and start Ollama locally on 127.0.0.1:11434.",
      "Run pnpm ai:setup to verify the local model."
    ],
    missingBlocks: [...analystSheetTypes],
    fieldIssues: [],
    ollamaHint: "Windows: install Ollama from ollama.com or run the documented PowerShell installer manually."
  };
}

export function diagnosticsFromError(error: unknown): AiExtractionDiagnostics {
  const message = error instanceof Error ? error.message : String(error || "Local AI extraction failed.");
  const lower = message.toLowerCase();
  if (lower.includes("abort") || lower.includes("timeout") || lower.includes("timed out")) {
    return {
      reasonCode: "timeout",
      headline: "Local AI request timed out.",
      tips: ["Try a shorter pasted text.", "Increase LOCAL_AI_TIMEOUT_MS.", "Use a smaller local model or let Ollama warm up first."],
      missingBlocks: [...analystSheetTypes],
      fieldIssues: [],
      ollamaHint: "Long first responses are normal when a model is cold-loaded."
    };
  }
  if (lower.includes("fetch failed") || lower.includes("econnrefused") || lower.includes("127.0.0.1") || lower.includes("ollama request failed")) {
    return {
      reasonCode: "ollama_connection",
      headline: "Cannot reach local Ollama.",
      tips: ["Start Ollama.", "Check LOCAL_AI_BASE_URL.", "Run pnpm ai:setup."],
      missingBlocks: [...analystSheetTypes],
      fieldIssues: [],
      ollamaHint: "The app only talks to local Ollama; no cloud AI fallback is used."
    };
  }
  if (lower.includes("non-json") || lower.includes("json")) {
    return {
      reasonCode: "invalid_json",
      headline: "Local AI returned invalid JSON.",
      tips: ["Retry with self-check enabled.", "Remove menus/banners from copied text.", "Use source-specific prompt hints."],
      missingBlocks: [...analystSheetTypes],
      fieldIssues: [],
      ollamaHint: "The prompt requires strict JSON, but small local models may occasionally include prose."
    };
  }
  return {
    reasonCode: "unknown_error",
    headline: message.slice(0, 160),
    tips: ["Check /admin/ai-dashboard logs.", "Try a shorter input or restart Ollama."],
    missingBlocks: [...analystSheetTypes],
    fieldIssues: []
  };
}

export function diagnosticsFromResult(result: LocalAiExtractionResult): AiExtractionDiagnostics {
  const missingBlocks = analystSheetTypes.filter((sheetType) => !result.sheets.some((sheet) => sheet.sheetType === sheetType));
  const fieldIssues = flattenIssues(result.sheets);
  if (!result.sheets.length) {
    return {
      reasonCode: "empty_sheets",
      headline: "AI did not find usable table rows.",
      tips: ["Paste a fuller page section with roster/stats/map/veto tables.", "Remove unrelated navigation text.", "Try a source-specific prompt variant."],
      missingBlocks,
      fieldIssues
    };
  }
  if (fieldIssues.some((issue) => issue.severity === "error")) {
    return {
      reasonCode: "validation_error",
      headline: "Some extracted rows failed normalized CSV validation.",
      tips: ["Fix highlighted cells before Apply.", "Check rating/ADR/KAST ranges and team names.", "Prefer real source rows over placeholders."],
      missingBlocks,
      fieldIssues
    };
  }
  if (result.confidence < 50) {
    return {
      reasonCode: "low_confidence",
      headline: "AI confidence is low.",
      tips: ["Review every table before Apply.", "Try text import instead of OCR.", "Run research gap-fill for missing blocks."],
      missingBlocks,
      fieldIssues
    };
  }
  return {
    reasonCode: "success",
    headline: "AI extraction produced valid normalized sheets.",
    tips: missingBlocks.length ? ["Review missing blocks and optionally run research gap-fill."] : ["Review and Apply when the tables look real."],
    missingBlocks,
    fieldIssues
  };
}

function flattenIssues(sheets: AiExtractedSheet[]) {
  return sheets.flatMap((sheet) => (sheet.validation.rowIssues || []).map((issue) => ({
    sheetType: sheet.sheetType,
    field: issue.field,
    severity: issue.severity,
    message: issue.message
  })));
}
