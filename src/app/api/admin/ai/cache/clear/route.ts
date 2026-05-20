import { NextResponse } from "next/server";
import { clearAiCache } from "@/lib/ai/admin";
import { logUserAction } from "@/lib/userActionLogger";

export const dynamic = "force-dynamic";

export async function POST() {
  const startedAt = Date.now();
  await logUserAction({ actionName: "local_ai_cache_clear", status: "started" }).catch(() => undefined);
  const cache = await clearAiCache();
  await logUserAction({ actionName: "local_ai_cache_clear", durationMs: Date.now() - startedAt, status: "completed", params: { count: cache.count } }).catch(() => undefined);
  return NextResponse.json({ ok: true, cache });
}
