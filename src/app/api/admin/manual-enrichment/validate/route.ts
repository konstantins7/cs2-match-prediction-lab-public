import { NextResponse } from "next/server";
import { validateManualEnrichment } from "@/lib/manualEnrichment";
import { redactSecrets } from "@/lib/security/redaction";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { payload?: string };
    const result = await validateManualEnrichment(body.payload ?? "");
    return NextResponse.json(redactSecrets(result));
  } catch (error) {
    return NextResponse.json({ ok: false, errors: [redactSecrets(error instanceof Error ? error.message : "Validation failed.")] }, { status: 400 });
  }
}

