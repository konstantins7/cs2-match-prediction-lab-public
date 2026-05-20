import { NextResponse } from "next/server";
import { aiDashboardSnapshot } from "@/lib/ai/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await aiDashboardSnapshot());
}
