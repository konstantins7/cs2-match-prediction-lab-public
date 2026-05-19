import { NextResponse } from "next/server";
import { applyAnalystSheetImport, type AnalystSheetInput } from "@/lib/analystSheetImport";
import { persistAcceptedExtraction, readPersistedExtraction } from "@/lib/ai/localAiExtraction";
import { isLocalAIEnabled } from "@/lib/ai/localAIClient";
import { refreshForecastabilityCache } from "@/lib/data/matchSummaries";
import { logUserAction } from "@/lib/userActionLogger";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let matchId = "";
  try {
    const body = await request.json().catch(() => ({}));
    matchId = typeof body.matchId === "string" ? body.matchId : "";
    if (!isLocalAIEnabled()) {
      return NextResponse.json({
        ok: false,
        applied: false,
        disabled: true,
        errors: ["Local AI is disabled. Set ENABLE_LOCAL_AI=true before applying AI extracted sheets."],
        warnings: []
      });
    }
    const extractionId = typeof body.extractionId === "string" ? body.extractionId : "";
    const sheets = await resolveSheets(body.sheets, extractionId);
    await logUserAction({
      actionName: "local_ai_apply",
      matchId,
      params: { extractionId, sheets: sheets.length },
      status: "started"
    }).catch(() => undefined);
    const result = await applyAnalystSheetImport({ matchId, sheets });
    if (result.ok && result.applied && matchId) {
      await refreshForecastabilityCache(matchId).catch(() => undefined);
      await persistAcceptedExtraction({ extractionId: extractionId || `manual-${Date.now()}`, matchId, sheets }).catch(() => undefined);
    }
    await logUserAction({
      actionName: "local_ai_apply",
      matchId,
      params: { extractionId, applied: result.applied, sheets: sheets.length },
      durationMs: Date.now() - startedAt,
      status: result.ok ? "completed" : "error",
      errorMessage: result.ok ? undefined : result.errors.join("; ")
    }).catch(() => undefined);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    await logUserAction({
      actionName: "local_ai_apply",
      matchId,
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Local AI apply failed."
    }).catch(() => undefined);
    return NextResponse.json({
      ok: false,
      applied: false,
      errors: [error instanceof Error ? error.message : "Local AI apply failed."],
      warnings: []
    }, { status: 500 });
  }
}

async function resolveSheets(rawSheets: unknown, extractionId: string): Promise<AnalystSheetInput[]> {
  if (Array.isArray(rawSheets)) {
    return rawSheets
      .filter((sheet): sheet is AnalystSheetInput => Boolean(sheet) && typeof sheet === "object" && typeof sheet.sheetType === "string" && typeof sheet.content === "string")
      .map((sheet) => ({ sheetType: sheet.sheetType, content: sheet.content }));
  }
  if (extractionId) {
    const persisted = await readPersistedExtraction(extractionId);
    return persisted.sheets.map((sheet) => ({ sheetType: sheet.sheetType, content: sheet.content }));
  }
  return [];
}
