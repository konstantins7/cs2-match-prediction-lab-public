import { NextResponse } from "next/server";
import { applyAnalystSheetImport } from "@/lib/analystSheetImport";
import { refreshForecastabilityCache } from "@/lib/data/matchSummaries";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await applyAnalystSheetImport({
      matchId: typeof body.matchId === "string" ? body.matchId : "",
      sheets: Array.isArray(body.sheets) ? body.sheets : []
    });
    if (result.ok && result.applied && typeof body.matchId === "string") {
      await refreshForecastabilityCache(body.matchId).catch(() => undefined);
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, applied: false, errors: [error instanceof Error ? error.message : "Analyst sheet apply failed."], warnings: [] },
      { status: 500 }
    );
  }
}
