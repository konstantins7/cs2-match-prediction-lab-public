import { NextResponse } from "next/server";
import { runAutomationOnce, type AutomationJobName } from "@/lib/automation/runner";
import { redactJson } from "@/lib/automation/notifications";

export const dynamic = "force-dynamic";

const allowed = new Set<AutomationJobName>(["auto-pipeline", "source-sync", "match-features", "ai-dataset", "ai-finetune", "cleanup"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { dryRun?: boolean; jobs?: string[] | string };
  const jobs = normalizeJobs(body.jobs);
  const result = await runAutomationOnce({ dryRun: body.dryRun !== false, jobs });
  return NextResponse.json(redactJson(result), { status: result.ok ? 200 : 500 });
}

function normalizeJobs(value: string[] | string | undefined): AutomationJobName[] | undefined {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const jobs = items.map((item) => item.trim()).filter((item): item is AutomationJobName => allowed.has(item as AutomationJobName));
  return jobs.length ? jobs : undefined;
}
