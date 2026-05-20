import { NextResponse } from "next/server";
import { handleFineTuneAction, type FineTuneAction } from "@/lib/ai/admin";
import { logUserAction } from "@/lib/userActionLogger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action as FineTuneAction : "prepare";
  await logUserAction({ actionName: "local_ai_finetune", params: { action }, status: "started" }).catch(() => undefined);
  const result = await handleFineTuneAction(action, { deleteAccepted: body.deleteAccepted === true });
  await logUserAction({
    actionName: "local_ai_finetune",
    params: { action, ok: Boolean((result as { ok?: boolean }).ok) },
    durationMs: Date.now() - startedAt,
    status: (result as { ok?: boolean }).ok ? "completed" : "error",
    errorMessage: (result as { ok?: boolean; reason?: string; error?: string }).ok ? undefined : ((result as { reason?: string; error?: string }).reason || (result as { error?: string }).error)
  }).catch(() => undefined);
  return NextResponse.json(result, { status: (result as { ok?: boolean; skipped?: boolean }).ok || (result as { skipped?: boolean }).skipped ? 200 : 400 });
}
