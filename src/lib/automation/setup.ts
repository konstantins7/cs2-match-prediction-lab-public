import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { ensureEnvLocal } from "@/lib/automation/envFile";
import { listLocalAIModels, localAIConfig, testLocalAIConnection } from "@/lib/ai/localAIClient";

const execFileAsync = promisify(execFile);

export type SetupStep = {
  name: string;
  status: "success" | "skipped" | "warning" | "error";
  message: string;
};

export type SetupOptions = {
  skipInstall?: boolean;
  skipServer?: boolean;
  installOllama?: boolean;
  pullModel?: boolean;
  dryRun?: boolean;
};

export async function runSetupAll(options: SetupOptions = {}) {
  const steps: SetupStep[] = [];
  steps.push(await checkCommand("node", ["--version"], "Node.js is required."));
  steps.push(await checkCommand("pnpm", ["--version"], "pnpm is required. Run: corepack enable"));
  if (!options.skipInstall) steps.push(await runCommand("dependencies", "pnpm", ["install"], options.dryRun));
  else steps.push({ name: "dependencies", status: "skipped", message: "Skipped by --skip-install." });
  steps.push(await runCommand("prisma:generate", "pnpm", ["prisma:generate"], options.dryRun));
  steps.push(await runCommand("prisma:migrate", "pnpm", ["prisma:migrate"], options.dryRun));
  steps.push(await runCommand("prisma:seed", "pnpm", ["prisma:seed"], options.dryRun));

  const ollama = await checkCommand("ollama", ["--version"], "Install Ollama: Windows PowerShell `irm https://ollama.com/install.ps1 | iex`, macOS `brew install ollama`, Linux `curl -fsSL https://ollama.com/install.sh | sh`.");
  steps.push(ollama);
  if (!ollama.status || ollama.status !== "success") {
    if (options.installOllama) steps.push(await guidedOllamaInstall(options.dryRun));
    else steps.push({ name: "ollama-install", status: "skipped", message: "Guided safe mode: OS installer was not run. Re-run with --install-ollama to attempt it." });
  }
  if (options.pullModel) steps.push(await runCommand("ollama-pull", "ollama", ["pull", localAIConfig().model], options.dryRun, 10 * 60_000));
  else steps.push({ name: "ollama-pull", status: "skipped", message: "Skipped; pass --pull-model to download the local model." });

  const localAiReady = await localAiSmokeReady();
  const env = await ensureEnvLocal({ localAiReady, dryRun: options.dryRun });
  steps.push({ name: "env.local", status: env.changed ? "success" : "skipped", message: `${env.path}; added ${env.addedKeys.length} key(s), preserved ${env.preservedKeys.length} secret-like key(s).` });

  if (!options.skipServer) steps.push({ name: "server", status: "warning", message: "Start the server with pnpm dev or pnpm start. setup:all does not keep a long-running process attached by default." });
  else steps.push({ name: "server", status: "skipped", message: "Skipped by --skip-server." });

  return { ok: steps.every((step) => step.status !== "error"), steps };
}

async function localAiSmokeReady() {
  const env = { ...process.env, ENABLE_LOCAL_AI: "true" };
  const models = await listLocalAIModels({ env });
  if (!models.models.length) return false;
  const smoke = await testLocalAIConnection({ env, timeoutMs: 5000 });
  return smoke.ok;
}

async function checkCommand(command: string, args: string[], fix: string): Promise<SetupStep> {
  try {
    const resolved = resolveCommand(command, args);
    const result = await execFileAsync(resolved.command, resolved.args, { timeout: 10_000, windowsHide: true });
    return { name: command, status: "success", message: result.stdout.trim() || "available" };
  } catch {
    return { name: command, status: "warning", message: fix };
  }
}

async function runCommand(name: string, command: string, args: string[], dryRun?: boolean, timeoutMs = 120_000): Promise<SetupStep> {
  if (dryRun) return { name, status: "skipped", message: `Dry-run: ${command} ${args.join(" ")}` };
  try {
    const resolved = resolveCommand(command, args);
    const result = await execFileAsync(resolved.command, resolved.args, { timeout: timeoutMs, windowsHide: true });
    return { name, status: "success", message: (result.stdout || result.stderr).trim().slice(-800) || "completed" };
  } catch (error) {
    return { name, status: "error", message: error instanceof Error ? error.message : `${name} failed` };
  }
}

function resolveCommand(command: string, args: string[]) {
  if (command === "node") return { command: process.execPath, args };
  if (command === "pnpm" && process.env.npm_execpath) return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
  if (command === "pnpm" && process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\pnpm\\pnpm.cmd` : "";
    if (local && existsSync(local)) return { command: local, args };
  }
  return { command, args };
}

async function guidedOllamaInstall(dryRun?: boolean): Promise<SetupStep> {
  if (process.platform === "win32") return runCommand("ollama-install", "powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://ollama.com/install.ps1 | iex"], dryRun, 10 * 60_000);
  if (process.platform === "darwin") return runCommand("ollama-install", "brew", ["install", "ollama"], dryRun, 10 * 60_000);
  return runCommand("ollama-install", "sh", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"], dryRun, 10 * 60_000);
}
