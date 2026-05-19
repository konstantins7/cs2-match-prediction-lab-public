import { NextResponse } from "next/server";
import { applyParsedDemoExport } from "@/lib/parsedDemoExport";
import { refreshForecastabilityCache } from "@/lib/data/matchSummaries";
import { logUserAction } from "@/lib/userActionLogger";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let matchId = "";
  try {
    const body = await request.json().catch(() => ({}));
    const payload = "payload" in body ? body.payload : body;
    await logUserAction({ actionName: "apply_parsed_demo", params: { payloadType: typeof payload }, status: "started" }).catch(() => undefined);
    const result = await applyParsedDemoExport(payload);
    matchId = typeof (result as { matchId?: unknown }).matchId === "string" ? (result as { matchId: string }).matchId : "";
    if (result.ok && result.applied && matchId) {
      await refreshForecastabilityCache(matchId).catch(() => undefined);
    }
    await logUserAction({ actionName: "apply_parsed_demo", matchId, durationMs: Date.now() - startedAt, status: result.ok ? "completed" : "error" }).catch(() => undefined);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    await logUserAction({ actionName: "apply_parsed_demo", matchId, durationMs: Date.now() - startedAt, status: "error", errorMessage: error instanceof Error ? error.message : "Parsed demo export apply failed." }).catch(() => undefined);
    return NextResponse.json(
      {
        ok: false,
        applied: false,
        errors: [error instanceof Error ? error.message : "Parsed demo export apply failed."],
        warnings: []
      },
      { status: 500 }
    );
  }
}
