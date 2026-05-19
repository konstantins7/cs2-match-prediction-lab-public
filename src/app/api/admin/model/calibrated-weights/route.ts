import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const filePath = path.join(process.cwd(), "data", "model", "calibrated_weights.json");

export async function GET() {
  try {
    const payload = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return NextResponse.json({ ok: true, configured: true, payload });
  } catch {
    return NextResponse.json({ ok: true, configured: false, payload: null });
  }
}

export async function DELETE() {
  try {
    await rm(filePath, { force: true });
    return NextResponse.json({ ok: true, configured: false });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to reset calibrated weights." }, { status: 500 });
  }
}
