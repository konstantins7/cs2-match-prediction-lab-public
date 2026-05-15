import { NextResponse } from "next/server";
import { applyAnalystSheetImport } from "@/lib/analystSheetImport";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await applyAnalystSheetImport({
      matchId: typeof body.matchId === "string" ? body.matchId : "",
      sheets: Array.isArray(body.sheets) ? body.sheets : []
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, applied: false, errors: [error instanceof Error ? error.message : "Analyst sheet apply failed."], warnings: [] },
      { status: 500 }
    );
  }
}
