import { NextResponse } from "next/server";
import { extractWithLocalAI } from "@/lib/ai/localAiExtraction";
import { isLocalAIEnabled } from "@/lib/ai/localAIClient";
import { logUserAction } from "@/lib/userActionLogger";

const maxInputChars = 120_000;

export async function POST(request: Request) {
  const startedAt = Date.now();
  let matchId = "";
  try {
    const body = await request.json().catch(() => ({}));
    matchId = typeof body.matchId === "string" ? body.matchId : "";
    if (!isLocalAIEnabled()) {
      return NextResponse.json({
        ok: false,
        disabled: true,
        errors: ["Local AI is disabled. Set ENABLE_LOCAL_AI=true and run Ollama locally."],
        warnings: []
      });
    }
    const inputText = typeof body.inputText === "string" ? body.inputText.trim() : "";
    if (!matchId || !inputText) {
      return NextResponse.json({ ok: false, errors: ["matchId and inputText are required."], warnings: [] }, { status: 400 });
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
    const result = await extractWithLocalAI({
      matchId,
      teamA: typeof body.teamA === "string" ? body.teamA : "",
      teamB: typeof body.teamB === "string" ? body.teamB : "",
      inputText,
      sourceHint: typeof body.sourceHint === "string" ? body.sourceHint : undefined,
      selfCheck: body.selfCheck === true
    });
    await logUserAction({
      actionName: "local_ai_extract",
      matchId,
      params: { sheets: result.sheets.length, confidence: result.confidence, cached: result.cached },
      durationMs: Date.now() - startedAt,
      status: result.ok ? "completed" : "error",
      errorMessage: result.ok ? undefined : result.suggestedNextAction
    }).catch(() => undefined);
    return NextResponse.json(result, { status: result.sheets.length ? 200 : 422 });
  } catch (error) {
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
      warnings: []
    }, { status: 500 });
  }
}
