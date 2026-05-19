import { NextResponse } from "next/server";
import { applyParsedDemoExport } from "@/lib/parsedDemoExport";
import { refreshForecastabilityCache } from "@/lib/data/matchSummaries";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = "payload" in body ? body.payload : body;
    const result = await applyParsedDemoExport(payload);
    const matchId = typeof (result as { matchId?: unknown }).matchId === "string" ? (result as { matchId: string }).matchId : "";
    if (result.ok && result.applied && matchId) {
      await refreshForecastabilityCache(matchId).catch(() => undefined);
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
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
