import { NextResponse } from "next/server";
import { getLatestFeatureSnapshot } from "@/lib/features/matchFeatureSnapshot";
import { redactString } from "@/lib/security/redaction";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await context.params;
    const snapshot = await getLatestFeatureSnapshot(matchId);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: redactString(error instanceof Error ? error.message : "Match features lookup failed.") },
      { status: 500 }
    );
  }
}
