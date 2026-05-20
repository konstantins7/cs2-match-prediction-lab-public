import { NextResponse } from "next/server";
import { diagnosticsFromDisabled, diagnosticsFromError, diagnosticsFromResult } from "@/lib/ai/diagnostics";
import { logAiHistory, sheetCountsFromSheets } from "@/lib/ai/historyStore";
import { extractWithLocalAI } from "@/lib/ai/localAiExtraction";
import { isLocalAIEnabled } from "@/lib/ai/localAIClient";
import { readLocalAISettings } from "@/lib/ai/admin";
import { logUserAction } from "@/lib/userActionLogger";

const maxInputChars = 120_000;

export async function POST(request: Request) {
  const startedAt = Date.now();
  let matchId = "";
  let inputText = "";
  let teamA = "";
  let teamB = "";
  try {
    const body = await request.json().catch(() => ({}));
    matchId = typeof body.matchId === "string" ? body.matchId : "";
    if (!isLocalAIEnabled()) {
      const diagnostics = diagnosticsFromDisabled();
      logAiHistory({
        matchId,
        teamA: typeof body.teamA === "string" ? body.teamA : "",
        teamB: typeof body.teamB === "string" ? body.teamB : "",
        status: "disabled",
        inputText: typeof body.inputText === "string" ? body.inputText : "",
        sourceHint: typeof body.sourceHint === "string" ? body.sourceHint : undefined,
        errors: diagnostics.tips,
        sheetCounts: {}
      });
      return NextResponse.json({
        ok: false,
        disabled: true,
        errors: ["Local AI is disabled. Set ENABLE_LOCAL_AI=true and run Ollama locally."],
        warnings: [],
        diagnostics
      });
    }
    inputText = typeof body.inputText === "string" ? body.inputText.trim() : "";
    teamA = typeof body.teamA === "string" ? body.teamA : "";
    teamB = typeof body.teamB === "string" ? body.teamB : "";
    if (!matchId || !inputText) {
      const diagnostics = diagnosticsFromError(new Error("matchId and inputText are required."));
      return NextResponse.json({ ok: false, errors: ["matchId and inputText are required."], warnings: [], diagnostics }, { status: 400 });
    }
    if (inputText.length > maxInputChars) {
      return NextResponse.json({ ok: false, errors: [`inputText is too large. Limit is ${maxInputChars} characters.`], warnings: [] }, { status: 413 });
    }
    await logUserAction({
      actionName: "local_ai_extract",
      matchId,
      params: { chars: inputText.length, selfCheck: Boolean(body.selfCheck), sourceHint: body.sourceHint },
      status: "started"
    }).catch(() => undefined);
    const settings = await readLocalAISettings();
    const result = await extractWithLocalAI({
      matchId,
      teamA,
      teamB,
      inputText,
      sourceHint: typeof body.sourceHint === "string" ? body.sourceHint : undefined,
      sourceSite: typeof body.sourceSite === "string" ? body.sourceSite : undefined,
      promptVariant: typeof body.promptVariant === "string" ? body.promptVariant : undefined,
      modelOverride: typeof body.modelOverride === "string" ? body.modelOverride : settings.activeModel || undefined,
      selfCheck: body.selfCheck === true,
      signal: request.signal
    });
    const diagnostics = diagnosticsFromResult(result);
    logAiHistory({
      matchId,
      teamA,
      teamB,
      status: result.ok ? "success" : "partial",
      inputText,
      sourceHint: typeof body.sourceHint === "string" ? body.sourceHint : undefined,
      sourceSite: result.sourceSite,
      detectedSource: result.detectedSource,
      promptVersion: result.promptVersion,
      promptVariant: result.promptVariant,
      confidence: result.confidence,
      durationMs: result.durationMs,
      cached: result.cached,
      sheetCounts: sheetCountsFromSheets(result.sheets),
      warnings: result.warnings,
      errors: result.ok ? [] : [result.suggestedNextAction],
      rawOutput: { sheets: result.sheets.map((sheet) => ({ sheetType: sheet.sheetType, rows: sheet.rows, validation: sheet.validation })) }
    });
    await logUserAction({
      actionName: "local_ai_extract",
      matchId,
      params: { sheets: result.sheets.length, confidence: result.confidence, cached: result.cached, detectedSource: result.detectedSource, promptVersion: result.promptVersion },
      durationMs: Date.now() - startedAt,
      status: result.ok ? "completed" : "error",
      errorMessage: result.ok ? undefined : result.suggestedNextAction
    }).catch(() => undefined);
    return NextResponse.json({ ...result, diagnostics }, { status: result.sheets.length ? 200 : 422 });
  } catch (error) {
    const diagnostics = diagnosticsFromError(error);
    logAiHistory({
      matchId,
      teamA,
      teamB,
      status: "error",
      inputText,
      durationMs: Date.now() - startedAt,
      errors: [error instanceof Error ? error.message : "Local AI extraction failed."],
      sheetCounts: {},
      rawOutput: { diagnostics }
    });
    await logUserAction({
      actionName: "local_ai_extract",
      matchId,
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Local AI extraction failed."
    }).catch(() => undefined);
    return NextResponse.json({
      ok: false,
      errors: [error instanceof Error ? error.message : "Local AI extraction failed."],
      warnings: [],
      diagnostics
    }, { status: 500 });
  }
}
