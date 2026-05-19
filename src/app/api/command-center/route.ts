import { NextResponse } from "next/server";
import { getCommandCenterSummary } from "@/lib/data/matchSummaries";
import { timeAsync } from "@/lib/performance/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  return timeAsync("/api/command-center", "GET", async () => {
    const summary = await getCommandCenterSummary();
    return NextResponse.json({ ok: true, summary });
  }, () => 200);
}
