import { NextResponse } from "next/server";
import { applyParsedDemoExport } from "@/lib/parsedDemoExport";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = "payload" in body ? body.payload : body;
    const result = await applyParsedDemoExport(payload);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        applied: false,
        errors: [error instanceof Error ? error.message : "Parsed demo export apply failed."],
        warnings: []
      },
      { status: 500 }
    );
  }
}
