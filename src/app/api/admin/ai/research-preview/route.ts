import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { analystSheetTemplates, type AnalystSheetType } from "@/lib/analystSheetTemplates";
import { PRIVATE_INBOX_DIR } from "@/lib/privateNormalizedInbox";
import { validateNormalizedFile } from "@/lib/validation/normalizedFileValidator";

export const dynamic = "force-dynamic";

const sheetTypes = Object.keys(analystSheetTemplates) as AnalystSheetType[];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const matchId = url.searchParams.get("matchId") || "";
  const allowed = new Set((url.searchParams.get("focus") || "").split(",").map((item) => item.trim()).filter(Boolean));
  const sheets = [];
  for (const sheetType of sheetTypes) {
    if (allowed.size && !allowed.has(sheetType)) continue;
    const template = analystSheetTemplates[sheetType];
    const content = await readFile(path.join(PRIVATE_INBOX_DIR, template.filename), "utf8").catch(() => "");
    if (!content.trim()) continue;
    const validation = validateNormalizedFile({ fileName: template.filename, content, expectedMatchId: matchId || undefined });
    sheets.push({ sheetType, fileName: template.filename, content, validation });
  }
  return NextResponse.json({ ok: true, sheets });
}
