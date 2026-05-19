import { NextResponse } from "next/server";
import { applyManualEnrichment } from "@/lib/manualEnrichment";
import { redactSecrets } from "@/lib/security/redaction";
import { refreshForecastabilityCache } from "@/lib/data/matchSummaries";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { payload?: string };
    const result = await applyManualEnrichment(body.payload ?? "");
    const matchId = typeof (result as { matchId?: unknown }).matchId === "string" ? (result as { matchId: string }).matchId : "";
    if (result.ok && (result as { applied?: boolean }).applied && matchId) {
      await refreshForecastabilityCache(matchId).catch(() => undefined);
    }
    return NextResponse.json(redactSecrets(result), { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, errors: [redactSecrets(error instanceof Error ? error.message : "Apply failed.")] }, { status: 400 });
  }
}
