import { NextResponse } from "next/server";
import { previewAnalystSheetImport, validateAnalystSheetImport } from "@/lib/analystSheetImport";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = {
      matchId: typeof body.matchId === "string" ? body.matchId : "",
      sheets: Array.isArray(body.sheets) ? body.sheets : []
    };
    const result = body.mode === "preview" ? await previewAnalystSheetImport(payload) : await validateAnalystSheetImport(payload);
    return NextResponse.json(result, { status: result.sheetValid ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, sheetValid: false, manualRealPackValid: false, errors: [error instanceof Error ? error.message : "Analyst sheet validation failed."], warnings: [] },
      { status: 500 }
    );
  }
}
