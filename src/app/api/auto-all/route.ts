import { NextResponse } from "next/server";
import { getAutoAllSourceLineage } from "@/lib/autoAllLineage";
import { getAutoAllJob, startAutoAllJob } from "@/lib/autoAllJobs";
import { redactString } from "@/lib/security/redaction";
import type { AutoFillMode } from "../../../../tools/auto-fill";

export const dynamic = "force-dynamic";

type AutoAllRequest = {
  matchId?: string;
  teamA?: string;
  teamB?: string;
  mode?: AutoFillMode;
  dryRun?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as AutoAllRequest;
    const matchId = text(body.matchId);
    const teamA = text(body.teamA);
    const teamB = text(body.teamB);
    if (!matchId || !teamA || !teamB) {
      return NextResponse.json({ ok: false, error: "matchId, teamA and teamB are required." }, { status: 400 });
    }
    const job = startAutoAllJob({
      matchId,
      teamNames: [teamA, teamB],
      mode: mode(body.mode),
      dryRun: body.dryRun === true
    });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json({ ok: false, error: redactString(error instanceof Error ? error.message : "Auto-All start failed.") }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("view") === "lineage") {
      const result = await getAutoAllSourceLineage(searchParams.get("matchId") ?? undefined);
      return NextResponse.json({ ok: true, result });
    }
    const jobId = searchParams.get("jobId")?.trim();
    if (!jobId) return NextResponse.json({ ok: false, error: "jobId is required." }, { status: 400 });
    const job = getAutoAllJob(jobId);
    if (!job) return NextResponse.json({ ok: false, error: "Auto-All job not found or expired." }, { status: 404 });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json({ ok: false, error: redactString(error instanceof Error ? error.message : "Auto-All status failed.") }, { status: 500 });
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function mode(value: unknown): AutoFillMode {
  return value === "fast" || value === "max" ? value : "deeper";
}
