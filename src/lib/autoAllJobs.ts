import { randomUUID } from "node:crypto";
import { redactString } from "./security/redaction";
import { logUserAction } from "./userActionLogger";
import { runAutoFill, type AutoFillMode, type AutoFillProgressEvent, type AutoFillResult } from "../../tools/auto-fill";

export type AutoAllJobStatus = "queued" | "running" | "completed" | "error";

export type AutoAllJobProgress = AutoFillProgressEvent & {
  at: string;
};

export type AutoAllJob = {
  jobId: string;
  status: AutoAllJobStatus;
  matchId: string;
  teamNames: [string, string];
  mode: AutoFillMode;
  dryRun: boolean;
  progress: AutoAllJobProgress[];
  result?: AutoFillResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
};

export type AutoAllJobView = Omit<AutoAllJob, "expiresAt">;

export type StartAutoAllJobInput = {
  matchId: string;
  teamNames: [string, string];
  mode: AutoFillMode;
  dryRun?: boolean;
};

const ttlMs = 15 * 60 * 1000;
const jobs = new Map<string, AutoAllJob>();

export function startAutoAllJob(input: StartAutoAllJobInput) {
  cleanupJobs();
  const now = new Date();
  const job: AutoAllJob = {
    jobId: randomUUID(),
    status: "queued",
    matchId: input.matchId,
    teamNames: input.teamNames,
    mode: input.mode,
    dryRun: input.dryRun === true,
    progress: initialProgress(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: now.getTime() + ttlMs
  };
  jobs.set(job.jobId, job);
  void runJob(job.jobId);
  return serializeJob(job);
}

export function getAutoAllJob(jobId: string) {
  cleanupJobs();
  const job = jobs.get(jobId);
  return job ? serializeJob(job) : null;
}

async function runJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return;
  mutateJob(job, { status: "running" });
  const startedAt = Date.now();
  await logUserAction({
    actionName: "auto_all",
    matchId: job.matchId,
    params: { mode: job.mode, dryRun: job.dryRun, teamNames: job.teamNames },
    status: "started"
  }).catch(() => undefined);
  try {
    const result = await runAutoFill({
      matchId: job.matchId,
      teamNames: job.teamNames,
      mode: job.mode,
      dryRun: job.dryRun,
      onProgress: (event) => {
        const current = jobs.get(jobId);
        if (!current) return;
        upsertProgress(current, event);
      }
    });
    mutateJob(job, { status: "completed", result });
    await logUserAction({
      actionName: "auto_all",
      matchId: job.matchId,
      params: { mode: job.mode, dryRun: job.dryRun, writes: result.writes.length, stillMissing: result.stillMissing },
      durationMs: Date.now() - startedAt,
      status: "completed"
    }).catch(() => undefined);
  } catch (error) {
    const message = redactString(error instanceof Error ? error.message : "Auto-All failed.");
    mutateJob(job, { status: "error", error: message });
    await logUserAction({
      actionName: "auto_all",
      matchId: job.matchId,
      params: { mode: job.mode, dryRun: job.dryRun },
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: message
    }).catch(() => undefined);
  }
}

function initialProgress(now: Date): AutoAllJobProgress[] {
  const sources: Array<AutoFillProgressEvent["source"]> = ["csstats", "pandascore", "grid", "steam", "liquipedia", "private_inbox"];
  return sources.map((source) => ({
    source,
    status: "pending",
    message: "Waiting.",
    at: now.toISOString()
  }));
}

function upsertProgress(job: AutoAllJob, event: AutoFillProgressEvent) {
  const now = new Date();
  const index = job.progress.findIndex((entry) => entry.source === event.source);
  const next = { ...event, message: redactString(event.message), at: now.toISOString() };
  if (index >= 0) job.progress[index] = next;
  else job.progress.push(next);
  job.updatedAt = now.toISOString();
}

function mutateJob(job: AutoAllJob, updates: Partial<Pick<AutoAllJob, "status" | "result" | "error">>) {
  const now = new Date();
  Object.assign(job, updates, { updatedAt: now.toISOString(), expiresAt: now.getTime() + ttlMs });
}

function cleanupJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (job.expiresAt <= now) jobs.delete(jobId);
  }
}

function serializeJob(job: AutoAllJob): AutoAllJobView {
  return {
    jobId: job.jobId,
    status: job.status,
    matchId: job.matchId,
    teamNames: job.teamNames,
    mode: job.mode,
    dryRun: job.dryRun,
    progress: job.progress,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}
