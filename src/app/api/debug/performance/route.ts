import { NextResponse } from "next/server";
import { getPerformanceMetrics } from "@/lib/performance/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV !== "development" || process.env.ENABLE_DEBUG_API !== "true") {
    return NextResponse.json({ ok: false, error: "Debug performance API is disabled." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, metrics: getPerformanceMetrics() });
}
