import { NextResponse } from "next/server";
import { runCleanup } from "@/lib/automation/cleanup";
import { redactJson } from "@/lib/automation/notifications";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { write?: boolean };
  const result = await runCleanup({ write: body.write === true });
  return NextResponse.json(redactJson(result));
}
