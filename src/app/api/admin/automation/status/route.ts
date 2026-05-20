import { NextResponse } from "next/server";
import { getAutomationStatus } from "@/lib/automation/runner";
import { redactJson } from "@/lib/automation/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(redactJson(await getAutomationStatus()));
}
