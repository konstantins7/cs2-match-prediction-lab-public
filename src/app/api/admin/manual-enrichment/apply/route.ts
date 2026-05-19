import { NextResponse } from "next/server";
import { applyManualEnrichment } from "@/lib/manualEnrichment";
import { redactSecrets } from "@/lib/security/redaction";
import { refreshForecastabilityCache } from "@/lib/data/matchSummaries";
import { logUserAction } from "@/lib/userActionLogger";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let matchId = "";
  try {
    const body = (await request.json()) as { payload?: string };
    await logUserAction({ actionName: "apply_manual_real_pack", params: { payloadLength: body.payload?.length ?? 0 }, status: "started" }).catch(() => undefined);
    const result = await applyManualEnrichment(body.payload ?? "");
    matchId = typeof (result as { matchId?: unknown }).matchId === "string" ? (result as { matchId: string }).matchId : "";
    if (result.ok && (result as { applied?: boolean }).applied && matchId) {
      await refreshForecastabilityCache(matchId).catch(() => undefined);
    }
    await logUserAction({ actionName: "apply_manual_real_pack", matchId, durationMs: Date.now() - startedAt, status: result.ok ? "completed" : "error" }).catch(() => undefined);
    return NextResponse.json(redactSecrets(result), { status: result.ok ? 200 : 400 });
  } catch (error) {
    await logUserAction({ actionName: "apply_manual_real_pack", matchId, durationMs: Date.now() - startedAt, status: "error", errorMessage: error instanceof Error ? error.message : "Apply failed." }).catch(() => undefined);
    return NextResponse.json({ ok: false, errors: [redactSecrets(error instanceof Error ? error.message : "Apply failed.")] }, { status: 400 });
  }
}
