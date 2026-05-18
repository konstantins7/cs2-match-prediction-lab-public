import { NextResponse } from "next/server";
import { buildDataQualityDashboardSummary } from "@/lib/dataQualityDashboard";
import { redactString } from "@/lib/security/redaction";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await buildDataQualityDashboardSummary({
      includeProblemMatches: searchParams.get("includeProblemMatches") === "true"
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: redactString(error instanceof Error ? error.message : "Data quality summary failed.") },
      { status: 500 }
    );
  }
}
