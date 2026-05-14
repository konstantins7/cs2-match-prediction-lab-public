import { NextResponse } from "next/server";
import { resetManualRealForMatch } from "@/lib/manualEnrichment";
import { redactSecrets } from "@/lib/security/redaction";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { matchId?: string };
    const matchId = body.matchId ?? "";
    if (!matchId) return NextResponse.json({ ok: false, errors: ["matchId is required."] }, { status: 400 });
    const result = await resetManualRealForMatch(matchId);
    return NextResponse.json(redactSecrets(result), { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, errors: [redactSecrets(error instanceof Error ? error.message : "Reset manual_real failed.")] }, { status: 400 });
  }
}
