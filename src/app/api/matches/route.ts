import { NextResponse } from "next/server";
import { getLightweightMatchSummaries } from "@/lib/data/matchSummaries";
import { timeAsync } from "@/lib/performance/metrics";
import type { MatchFocusFilter } from "@/lib/data/matches";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return timeAsync("/api/matches", "GET", async () => {
    const url = new URL(request.url);
    const result = await getLightweightMatchSummaries({
      page: numberParam(url, "page", 1),
      limit: numberParam(url, "limit", 20),
      status: stringParam(url, "status"),
      focus: (stringParam(url, "focus") as MatchFocusFilter | undefined) ?? "pro",
      format: stringParam(url, "format"),
      top: optionalNumberParam(url, "top"),
      sourceMode: stringParam(url, "sourceMode"),
      sort: stringParam(url, "sort")
    });
    return NextResponse.json({ ok: true, ...result });
  }, () => 200);
}

function stringParam(url: URL, key: string) {
  const value = url.searchParams.get(key);
  return value ? value : undefined;
}

function numberParam(url: URL, key: string, fallback: number) {
  const value = Number(url.searchParams.get(key) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function optionalNumberParam(url: URL, key: string) {
  const value = url.searchParams.get(key);
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
