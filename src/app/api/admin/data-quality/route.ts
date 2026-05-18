import { NextResponse } from "next/server";
import { buildDataQualityDashboardSummary } from "@/lib/dataQualityDashboard";
import { redactString } from "@/lib/security/redaction";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await buildDataQualityDashboardSummary();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: redactString(error instanceof Error ? error.message : "Data quality summary failed.") },
      { status: 500 }
    );
  }
}
