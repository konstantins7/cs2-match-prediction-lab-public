import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { aiResponseCacheStats, listLocalAIModels, localAIConfig, readLocalAIUsageStats, getLocalAIQueueStats } from "@/lib/ai/localAIClient";
import { redactString } from "@/lib/security/redaction";
import { getAutomationStatus } from "@/lib/automation/runner";

const execFileAsync = promisify(execFile);

export type DoctorCheck = {
  name: string;
  ok: boolean;
  severity: "info" | "warn" | "error";
  detail: string;
  fix?: string;
};

export type AdminHealthSnapshot = {
  ok: boolean;
  generatedAt: string;
  process: {
    uptimeSeconds: number;
    memoryMb: number;
    platform: string;
    node: string;
  };
  storage: {
    dbBytes: number;
    dataBytes: number;
    logBytes: number;
    cacheBytes: number;
    freeDiskHint: string;
  };
  ollama: {
    enabled: boolean;
    baseUrl: string;
    models: string[];
    fineTunedAvailable: boolean;
  };
  ai: {
    queue: ReturnType<typeof getLocalAIQueueStats>;
    usage: Awaited<ReturnType<typeof readLocalAIUsageStats>>;
    cache: Awaited<ReturnType<typeof aiResponseCacheStats>>;
  };
  automation: Awaited<ReturnType<typeof getAutomationStatus>>;
  checks: DoctorCheck[];
};

export async function runDoctor() {
  const checks: DoctorCheck[] = [];
  checks.push(checkNodeVersion());
  checks.push(await commandCheck("pnpm", ["--version"], "Install pnpm >= 8 or use corepack enable."));
  checks.push(await dbCheck());
  checks.push(await envCheck());
  checks.push(await ollamaCheck());
  checks.push(await diskCheck());
  return {
    ok: checks.every((check) => check.ok || check.severity !== "error"),
    checks
  };
}

export async function getAdminHealthSnapshot(): Promise<AdminHealthSnapshot> {
  const [doctor, storage, ollama, aiUsage, aiCache, automation] = await Promise.all([
    runDoctor(),
    storageStats(),
    listLocalAIModels(),
    readLocalAIUsageStats(24),
    aiResponseCacheStats(),
    getAutomationStatus()
  ]);
  const memory = process.memoryUsage();
  return {
    ok: doctor.ok,
    generatedAt: new Date().toISOString(),
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(memory.rss / 1024 / 1024),
      platform: `${os.platform()} ${os.release()}`,
      node: process.version
    },
    storage,
    ollama: {
      enabled: ollama.enabled,
      baseUrl: localAIConfig().baseUrl,
      models: ollama.models,
      fineTunedAvailable: ollama.fineTunedAvailable
    },
    ai: {
      queue: getLocalAIQueueStats(),
      usage: aiUsage,
      cache: aiCache
    },
    automation,
    checks: doctor.checks
  };
}

function checkNodeVersion(): DoctorCheck {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    name: "node",
    ok: major >= 20,
    severity: major >= 20 ? "info" : "error",
    detail: `Node ${process.version}`,
    fix: major >= 20 ? undefined : "Install Node.js 20 or newer."
  };
}

async function commandCheck(command: string, args: string[], fix: string): Promise<DoctorCheck> {
  try {
    const resolved = resolveCommand(command, args);
    const result = await execFileAsync(resolved.command, resolved.args, { timeout: 5000, windowsHide: true });
    return { name: command, ok: true, severity: "info", detail: redactString(result.stdout.trim() || "available") };
  } catch (error) {
    return { name: command, ok: false, severity: "warn", detail: error instanceof Error ? redactString(error.message) : "not available", fix };
  }
}

function resolveCommand(command: string, args: string[]) {
  if (command === "pnpm" && process.env.npm_execpath) return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
  if (command === "pnpm" && process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\pnpm\\pnpm.cmd` : "";
    if (local && existsSync(local)) return { command: local, args };
  }
  return { command, args };
}

async function dbCheck(): Promise<DoctorCheck> {
  try {
    await prisma.match.count();
    return { name: "database", ok: true, severity: "info", detail: "Prisma database is reachable." };
  } catch (error) {
    return {
      name: "database",
      ok: false,
      severity: "error",
      detail: error instanceof Error ? redactString(error.message) : "Database check failed.",
      fix: "Run pnpm prisma:migrate && pnpm prisma:seed, or pnpm setup:all."
    };
  }
}

async function envCheck(): Promise<DoctorCheck> {
  const envPath = path.join(process.cwd(), ".env.local");
  try {
    await access(envPath);
    return { name: "env.local", ok: true, severity: "info", detail: ".env.local exists." };
  } catch {
    return { name: "env.local", ok: false, severity: "warn", detail: ".env.local is missing.", fix: "Run pnpm setup:all." };
  }
}

async function ollamaCheck(): Promise<DoctorCheck> {
  if (process.env.ENABLE_LOCAL_AI !== "true") {
    return { name: "ollama", ok: true, severity: "info", detail: "Local AI is disabled." };
  }
  const models = await listLocalAIModels();
  return {
    name: "ollama",
    ok: models.models.length > 0,
    severity: models.models.length ? "info" : "warn",
    detail: models.models.length ? `Models: ${models.models.join(", ")}` : "Ollama is enabled but no models were listed.",
    fix: models.models.length ? undefined : "Start Ollama and run pnpm ai:setup -- --pull."
  };
}

async function diskCheck(): Promise<DoctorCheck> {
  const dataPath = path.join(process.cwd(), "data");
  await access(dataPath).catch(() => undefined);
  return { name: "disk", ok: true, severity: "info", detail: "Disk free-space probing is platform-dependent; data path is checked by admin health." };
}

async function storageStats() {
  const root = process.cwd();
  const dbPath = path.join(root, "prisma", "dev.db");
  return {
    dbBytes: await fileSize(dbPath),
    dataBytes: await dirSize(path.join(root, "data")),
    logBytes: await dirSize(path.join(root, "data", "logs")),
    cacheBytes: await dirSize(path.join(root, "data", "cache")),
    freeDiskHint: "Use pnpm cleanup -- --dry-run for reclaimable local files."
  };
}

async function fileSize(file: string) {
  return (await stat(file).catch(() => null))?.size ?? 0;
}

async function dirSize(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else total += await fileSize(full);
  }
  return total;
}
