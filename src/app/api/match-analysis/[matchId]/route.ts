import { NextResponse } from "next/server";
import { buildDeepMatchAnalysis } from "@/lib/math/deepMatchAnalysis";

export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "deep";
  if (mode !== "deep") return NextResponse.json({ ok: false, error: "Only mode=deep is supported." }, { status: 400 });
  const analysis = await buildDeepMatchAnalysis({
    matchId,
    version: Number(url.searchParams.get("v") ?? "1"),
    periodDays: Number(url.searchParams.get("periodDays") ?? "40"),
    decayDays: Number(url.searchParams.get("decayDays") ?? "14"),
    teamA: url.searchParams.get("teamA") ?? undefined,
    teamB: url.searchParams.get("teamB") ?? undefined,
    weights: {
      elo: Number(url.searchParams.get("eloWeight") ?? "0.34"),
      maps: Number(url.searchParams.get("mapsWeight") ?? "0.43"),
      synergy: Number(url.searchParams.get("synergyWeight") ?? "0.23")
    }
  });
  return NextResponse.json({ ok: true, analysis });
}
