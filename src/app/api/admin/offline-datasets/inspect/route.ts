import { NextRequest, NextResponse } from "next/server";
import { inspectOfflineDatasetCsv } from "@/lib/offlineDatasetInspector";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { datasetType?: string; content?: string };
    const result = inspectOfflineDatasetCsv({
      datasetType: String(body.datasetType ?? ""),
      content: String(body.content ?? "")
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({
      ok: false,
      errors: ["Could not inspect offline dataset CSV."],
      warnings: ["No data was imported. Offline dataset inspection is read-only."]
    }, { status: 400 });
  }
}
