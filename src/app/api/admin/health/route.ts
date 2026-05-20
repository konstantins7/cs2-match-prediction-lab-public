import { NextResponse } from "next/server";
import { getAdminHealthSnapshot } from "@/lib/automation/doctor";
import { redactJson } from "@/lib/automation/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(redactJson(await getAdminHealthSnapshot()));
}
