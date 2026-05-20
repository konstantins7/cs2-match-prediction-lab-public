import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { refreshForecastabilityCacheForUpcoming } from "@/lib/data/matchSummaries";
import { rebuildMatchFeatureHistory } from "@/lib/scientific/matchFeatureHistory";
import { notifyAutomation } from "@/lib/automation/notifications";
import { runCleanup } from "@/lib/automation/cleanup";

export type AutomationJobName = "auto-pipeline" | "source-sync" | "match-features" | "ai-dataset" | "ai-finetune" | "cleanup";

export type AutomationJobResult = {
  job: AutomationJobName;
  status: "success" | "skipped" | "error";
  message: string;
  durationMs: number;
  details?: Record<string, unknown>;
};

export type AutomationState = {
  pid?: number;
  startedAt?: string;
  lastHeartbeat?: string;
  lastRuns: Partial<Record<AutomationJobName, AutomationJobResult & { finishedAt: string }>>;
};

const runtimeDir = path.join(process.cwd(), "data", "runtime");
const statePath = path.join(runtimeDir, "automation-state.json");
const pidPath = path.join(runtimeDir, "automation.pid");
const lockPath = path.join(runtimeDir, "automation.lock");

export async function getAutomationStatus() {
  const state = await readAutomationState();
  const pid = await readFile(pidPath, "utf8").then((value) => Number(value.trim())).catch(() => undefined);
  return {
    enabled: process.env.ENABLE_AUTO_PIPELINE === "true" || process.env.ENABLE_AUTO_SOURCE_SYNC === "true" || process.env.ENABLE_AUTO_FINETUNE === "true",
    pid: Number.isFinite(pid) ? pid : state.pid,
    statePath,
    pidPath,
    lastHeartbeat: state.lastHeartbeat,
    lastRuns: state.lastRuns
  };
}

export async function runAutomationOnce(input: {
  dryRun?: boolean;
  jobs?: AutomationJobName[];
  now?: Date;
  force?: boolean;
} = {}) {
  const jobs = input.jobs ?? ["auto-pipeline", "source-sync", "match-features", "ai-dataset", "ai-finetune", "cleanup"];
  const results: AutomationJobResult[] = [];
  await withAutomationLock(async () => {
    await writeRuntimeState({ pid: process.pid, startedAt: new Date().toISOString(), lastHeartbeat: new Date().toISOString() });
    for (const job of jobs) {
      const result = await runJob(job, input);
      results.push(result);
      await recordJobResult(result);
      await notifyAutomation({
        level: result.status === "error" ? "error" : result.status === "skipped" ? "info" : "info",
        source: job,
        message: result.message,
        details: result.details
      }).catch(() => undefined);
    }
  });
  return { ok: results.every((result) => result.status !== "error"), dryRun: Boolean(input.dryRun), results };
}

export async function startAutomationLoop(input: { intervalMs?: number; once?: boolean; dryRun?: boolean } = {}) {
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(pidPath, String(process.pid), "utf8");
  await writeRuntimeState({ pid: process.pid, startedAt: new Date().toISOString(), lastHeartbeat: new Date().toISOString() });
  const intervalMs = input.intervalMs ?? 60_000;
  let keepRunning = true;
  while (keepRunning) {
    await writeRuntimeState({ pid: process.pid, lastHeartbeat: new Date().toISOString() });
    await runAutomationOnce({ dryRun: input.dryRun }).catch((error) => notifyAutomation({
      level: "error",
      source: "automation-loop",
      message: error instanceof Error ? error.message : "Automation loop failed."
    }));
    keepRunning = !input.once;
    if (!keepRunning) break;
    await sleep(intervalMs);
  }
}

async function runJob(job: AutomationJobName, input: { dryRun?: boolean; force?: boolean; now?: Date }): Promise<AutomationJobResult> {
  const startedAt = Date.now();
  try {
    if (job === "auto-pipeline") return await runAutoPipeline(startedAt, input);
    if (job === "source-sync") return await runSourceSync(startedAt);
    if (job === "match-features") return await runMatchFeatures(startedAt, input);
    if (job === "ai-dataset") return await runAiDataset(startedAt);
    if (job === "ai-finetune") return await runAiFinetune(startedAt);
    return await runCleanupJob(startedAt, input);
  } catch (error) {
    return {
      job,
      status: "error",
      message: error instanceof Error ? error.message : "Automation job failed.",
      durationMs: Date.now() - startedAt
    };
  }
}

async function runAutoPipeline(startedAt: number, input: { dryRun?: boolean }): Promise<AutomationJobResult> {
  if (process.env.ENABLE_AUTO_PIPELINE !== "true") {
    return skipped("auto-pipeline", startedAt, "ENABLE_AUTO_PIPELINE is false.");
  }
  const { runAutoAllExtended } = await import("../../../scripts/auto-all-extended");
  const mode = process.env.AUTO_PIPELINE_MODE === "fast" || process.env.AUTO_PIPELINE_MODE === "deeper" ? process.env.AUTO_PIPELINE_MODE : "max";
  const dryRun = input.dryRun ?? process.env.AUTO_PIPELINE_DRY_RUN !== "false";
  const limit = Math.max(1, Math.min(50, Number(process.env.AUTO_PIPELINE_MATCH_LIMIT ?? 10)));
  const rows = await prisma.match.findMany({
    where: { status: "upcoming", isOfficial: true, sourceMode: { notIn: ["demo", "analyst_sample"] } },
    select: { id: true, teamA: { select: { name: true } }, teamB: { select: { name: true } } },
    orderBy: { startTime: "asc" },
    take: limit
  });
  const summaries = [];
  for (const row of rows) {
    const result = await runAutoAllExtended({ matchId: row.id, teamA: row.teamA.name, teamB: row.teamB.name, mode, dryRun });
    summaries.push({ matchId: row.id, writes: result.writes.length, researchEnabled: result.researchEnabled });
  }
  const cache = await refreshForecastabilityCacheForUpcoming().catch(() => ({ refreshed: 0, requested: 0 }));
  return {
    job: "auto-pipeline",
    status: "success",
    message: `Processed ${rows.length} upcoming match(es); manual Apply is still required.`,
    durationMs: Date.now() - startedAt,
    details: { dryRun, mode, matches: summaries, forecastabilityCache: cache }
  };
}

async function runSourceSync(startedAt: number): Promise<AutomationJobResult> {
  if (process.env.ENABLE_AUTO_SOURCE_SYNC !== "true") {
    return skipped("source-sync", startedAt, "ENABLE_AUTO_SOURCE_SYNC is false.");
  }
  const { runAllSync } = await import("@/lib/sources/sourceScheduler");
  const results = await runAllSync();
  return { job: "source-sync", status: "success", message: "Source sync completed.", durationMs: Date.now() - startedAt, details: { results } };
}

async function runMatchFeatures(startedAt: number, input: { dryRun?: boolean }): Promise<AutomationJobResult> {
  if (input.dryRun) return skipped("match-features", startedAt, "Dry-run: match feature history rebuild skipped.");
  const limit = Math.max(1, Math.min(500, Number(process.env.MATCH_FEATURE_SYNC_LIMIT ?? 100)));
  const result = await rebuildMatchFeatureHistory(limit);
  return { job: "match-features", status: "success", message: `Rebuilt feature history for ${result.created} match(es).`, durationMs: Date.now() - startedAt, details: result };
}

async function runAiDataset(startedAt: number): Promise<AutomationJobResult> {
  if (process.env.ENABLE_AUTO_FINETUNE !== "true") {
    return skipped("ai-dataset", startedAt, "ENABLE_AUTO_FINETUNE is false.");
  }
  const { prepareFineTuningDataset } = await import("@/lib/ai/finetune");
  const result = await prepareFineTuningDataset();
  return { job: "ai-dataset", status: "success", message: `Prepared ${result.examples} fine-tuning example(s).`, durationMs: Date.now() - startedAt, details: result };
}

async function runAiFinetune(startedAt: number): Promise<AutomationJobResult> {
  if (process.env.ENABLE_AUTO_FINETUNE !== "true" || process.env.AI_FINETUNE_ALLOW_RUN !== "true") {
    return skipped("ai-finetune", startedAt, "Auto fine-tuning requires ENABLE_AUTO_FINETUNE=true and AI_FINETUNE_ALLOW_RUN=true.");
  }
  return skipped("ai-finetune", startedAt, "Guided fine-tuning remains manual via AI dashboard in v1.7.0.");
}

async function runCleanupJob(startedAt: number, input: { dryRun?: boolean }): Promise<AutomationJobResult> {
  const result = await runCleanup({ write: input.dryRun ? false : process.env.AUTO_CLEANUP_WRITE === "true" });
  return {
    job: "cleanup",
    status: "success",
    message: result.dryRun ? `Cleanup dry-run found ${result.candidates.length} candidate(s).` : `Cleanup removed ${result.removed} file(s).`,
    durationMs: Date.now() - startedAt,
    details: result
  };
}

function skipped(job: AutomationJobName, startedAt: number, message: string): AutomationJobResult {
  return { job, status: "skipped", message, durationMs: Date.now() - startedAt };
}

async function withAutomationLock<T>(run: () => Promise<T>): Promise<T> {
  await mkdir(runtimeDir, { recursive: true });
  try {
    await writeFile(lockPath, String(process.pid), { flag: "wx" });
  } catch {
    throw new Error("Automation runner is already active.");
  }
  try {
    return await run();
  } finally {
    await rm(lockPath, { force: true }).catch(() => undefined);
  }
}

async function readAutomationState(): Promise<AutomationState> {
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as AutomationState;
  } catch {
    return { lastRuns: {} };
  }
}

async function writeRuntimeState(patch: Partial<AutomationState>) {
  const current = await readAutomationState();
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(statePath, JSON.stringify({ ...current, ...patch, lastRuns: current.lastRuns ?? {} }, null, 2), "utf8");
}

async function recordJobResult(result: AutomationJobResult) {
  const current = await readAutomationState();
  await writeRuntimeState({
    lastRuns: {
      ...current.lastRuns,
      [result.job]: { ...result, finishedAt: new Date().toISOString() }
    }
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
