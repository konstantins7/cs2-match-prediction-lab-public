import { NextResponse } from "next/server";
import { applyAnalystSheetImport } from "@/lib/analystSheetImport";
import { refreshForecastabilityCache } from "@/lib/data/matchSummaries";
import { logUserAction } from "@/lib/userActionLogger";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let matchId = "";
  try {
    const body = await request.json().catch(() => ({}));
    matchId = typeof body.matchId === "string" ? body.matchId : "";
    await logUserAction({ actionName: "apply_analyst_sheet", matchId, params: { sheets: Array.isArray(body.sheets) ? body.sheets.length : 0 }, status: "started" }).catch(() => undefined);
    const result = await applyAnalystSheetImport({
      matchId,
      sheets: Array.isArray(body.sheets) ? body.sheets : []
    });
    if (result.ok && result.applied && typeof body.matchId === "string") {
      await refreshForecastabilityCache(body.matchId).catch(() => undefined);
    }
    await logUserAction({ actionName: "apply_analyst_sheet", matchId, params: { applied: result.applied }, durationMs: Date.now() - startedAt, status: result.ok ? "completed" : "error", errorMessage: result.ok ? undefined : result.errors.join("; ") }).catch(() => undefined);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    await logUserAction({ actionName: "apply_analyst_sheet", matchId, durationMs: Date.now() - startedAt, status: "error", errorMessage: error instanceof Error ? error.message : "Analyst sheet apply failed." }).catch(() => undefined);
    return NextResponse.json(
      { ok: false, applied: false, errors: [error instanceof Error ? error.message : "Analyst sheet apply failed."], warnings: [] },
      { status: 500 }
    );
  }
}
