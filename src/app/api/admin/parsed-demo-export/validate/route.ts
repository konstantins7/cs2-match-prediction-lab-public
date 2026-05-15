import { NextResponse } from "next/server";
import { previewParsedDemoExport, validateParsedDemoExport } from "@/lib/parsedDemoExport";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = "payload" in body ? body.payload : body;
    const result = body?.mode === "preview" || body?.preview === true
      ? await previewParsedDemoExport(payload)
      : await validateParsedDemoExport(payload);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errors: [error instanceof Error ? error.message : "Parsed demo export validation failed."],
        warnings: []
      },
      { status: 500 }
    );
  }
}
