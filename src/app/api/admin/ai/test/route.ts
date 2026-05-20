import { NextResponse } from "next/server";
import { runAiTest } from "@/lib/ai/admin";
import { logUserAction } from "@/lib/userActionLogger";

export const dynamic = "force-dynamic";

export async function POST() {
  const startedAt = Date.now();
  await logUserAction({ actionName: "local_ai_test", status: "started" }).catch(() => undefined);
  const result = await runAiTest();
  await logUserAction({
    actionName: "local_ai_test",
    durationMs: Date.now() - startedAt,
    status: result.ok ? "completed" : "error",
    errorMessage: result.ok ? undefined : result.error
  }).catch(() => undefined);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
