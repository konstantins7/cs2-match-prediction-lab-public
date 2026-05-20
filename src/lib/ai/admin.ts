import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { acceptedExampleStats, historyStats } from "./historyStore";
import {
  aiResponseCacheStats,
  clearLocalAICache,
  getLocalAIQueueStats,
  isLocalAIEnabled,
  listLocalAIModels,
  localAIConfig,
  readLocalAIUsageStats,
  testLocalAIConnection
} from "./localAIClient";
import { redactString } from "@/lib/security/redaction";

export type FineTuneAction = "prepare" | "run" | "activate" | "reset";

const root = process.cwd();
const settingsPath = path.join(root, "data", "model", "local-ai-settings.json");
const finetuneLogDir = path.join(root, "data", "logs", "ai-finetune");
const finetuneStateDir = path.join(root, "data", "cache", "ai-finetune-jobs");

export async function aiDashboardSnapshot() {
  const config = localAIConfig();
  const models = await listLocalAIModels();
  const activeSettings = await readLocalAISettings();
  const cache = await aiResponseCacheStats();
  const usage = await readLocalAIUsageStats(24);
  const history = await historyStats();
  const accepted = await acceptedExampleStats();
  return {
    ok: true,
    enabled: isLocalAIEnabled(),
    config: {
      baseUrl: config.baseUrl,
      model: config.model,
      fineTunedModel: config.fineTunedModel,
      timeoutMs: config.timeoutMs,
      activeModel: activeSettings.activeModel || config.model
    },
    models,
    runtime: getLocalAIQueueStats(),
    cache,
    usage,
    history,
    acceptedExamples: accepted,
    fineTuning: {
      allowRun: process.env.AI_FINETUNE_ALLOW_RUN === "true",
      commandConfigured: Boolean(process.env.AI_FINETUNE_COMMAND),
      latestJob: await latestFineTuneJob()
    }
  };
}

export async function runAiTest() {
  return testLocalAIConnection({ prompt: "{\"test\":\"ok\"}" });
}

export async function clearAiCache() {
  await clearLocalAICache();
  return aiResponseCacheStats();
}

export async function handleFineTuneAction(action: FineTuneAction, options: { deleteAccepted?: boolean } = {}) {
  if (action === "prepare") {
    return runScriptJob("prepare", ["scripts/ai-prepare-dataset.ts"], 120_000);
  }
  if (action === "run") {
    if (process.env.AI_FINETUNE_ALLOW_RUN !== "true") {
      return {
        ok: false,
        skipped: true,
        reason: "AI_FINETUNE_ALLOW_RUN is not true.",
        next: "Set AI_FINETUNE_ALLOW_RUN=true and AI_FINETUNE_COMMAND to your local trainer command after installing Python/tooling."
      };
    }
    if (!process.env.AI_FINETUNE_COMMAND) {
      return {
        ok: false,
        skipped: true,
        reason: "AI_FINETUNE_COMMAND is not configured.",
        next: "Prepare a local Unsloth/Axolotl workflow and set AI_FINETUNE_COMMAND. No dependencies are installed automatically."
      };
    }
    const result = await runScriptJob("run", ["scripts/ai-finetune.ts"], 6 * 60 * 60_000);
    if (result.ok && options.deleteAccepted) await clearAcceptedExamples();
    return result;
  }
  if (action === "activate") {
    const config = localAIConfig();
    const modelfile = path.join(root, "data", "model", "lora", "Modelfile");
    const result = await runCommandJob("activate", "ollama", ["create", config.fineTunedModel, "-f", modelfile], 10 * 60_000);
    if (result.ok) await writeLocalAISettings({ activeModel: config.fineTunedModel, updatedAt: new Date().toISOString() });
    return result;
  }
  if (action === "reset") {
    await writeLocalAISettings({ activeModel: "", updatedAt: new Date().toISOString() });
    return { ok: true, action: "reset", message: "Local AI model preference reset to base model." };
  }
  return { ok: false, error: "Unsupported fine-tuning action." };
}

export async function readLocalAISettings(): Promise<{ activeModel?: string; updatedAt?: string }> {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8")) as { activeModel?: string; updatedAt?: string };
  } catch {
    return {};
  }
}

async function writeLocalAISettings(settings: { activeModel?: string; updatedAt?: string }) {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

async function runScriptJob(action: string, scriptArgs: string[], timeoutMs: number) {
  return runCommandJob(action, process.execPath, ["node_modules/tsx/dist/cli.mjs", ...scriptArgs], timeoutMs);
}

async function runCommandJob(action: string, command: string, args: string[], timeoutMs: number) {
  const jobId = `${Date.now()}-${action}`;
  await mkdir(finetuneLogDir, { recursive: true });
  await mkdir(finetuneStateDir, { recursive: true });
  const logPath = path.join(finetuneLogDir, `${jobId}.log`);
  const statePath = path.join(finetuneStateDir, `${jobId}.json`);
  await writeFile(statePath, JSON.stringify({ jobId, action, status: "running", startedAt: new Date().toISOString() }, null, 2), "utf8");
  const startedAt = Date.now();
  const output = await spawnCapture(command, args, timeoutMs);
  const redactedOutput = redactString(output.output).slice(-20_000);
  await writeFile(logPath, redactedOutput, "utf8");
  const state = {
    jobId,
    action,
    status: output.ok ? "completed" : "error",
    ok: output.ok,
    durationMs: Date.now() - startedAt,
    logPath,
    outputTail: redactedOutput.slice(-2000),
    completedAt: new Date().toISOString()
  };
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  return state;
}

function spawnCapture(command: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: process.platform === "win32", cwd: root });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: Buffer.concat(chunks).toString("utf8") });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, output: error.message });
    });
  });
}

async function latestFineTuneJob() {
  const files = await readdir(finetuneStateDir).catch(() => []);
  const latest = files.filter((file) => file.endsWith(".json")).sort().at(-1);
  if (!latest) return null;
  try {
    return JSON.parse(await readFile(path.join(finetuneStateDir, latest), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function clearAcceptedExamples() {
  const acceptedDir = path.join(root, "data", "cache", "ai-responses", "accepted");
  await rm(acceptedDir, { recursive: true, force: true });
  await mkdir(acceptedDir, { recursive: true });
}
