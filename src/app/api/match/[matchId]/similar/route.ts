import { NextResponse } from "next/server";
import { findSimilarMatches } from "@/lib/scientific/matchSimilarity";

export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(25, Number(url.searchParams.get("limit") ?? "10")));
  try {
    const matches = await findSimilarMatches(matchId, limit);
    return NextResponse.json({
      ok: true,
      matches,
      warnings: matches.length < Math.min(5, limit) ? ["Cached feature history has fewer than five similar candidates. Run pnpm sync:match-features after importing finished matches."] : []
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Similar match lookup failed." }, { status: 500 });
  }
}
