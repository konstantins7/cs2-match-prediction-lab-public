import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactString } from "@/lib/security/redaction";

export type LocalAIEnv = {
  ENABLE_LOCAL_AI?: string;
  LOCAL_AI_MODEL?: string;
  LOCAL_AI_FINETUNED_MODEL?: string;
  LOCAL_AI_BASE_URL?: string;
  LOCAL_AI_TIMEOUT_MS?: string;
};

export type LocalAIRequest = {
  prompt: string;
  system?: string;
  model?: string;
  env?: LocalAIEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cacheKeyParts?: string[];
  useCache?: boolean;
  signal?: AbortSignal;
};

export type LocalAIResponse = {
  text: string;
  model: string;
  durationMs: number;
  cached: boolean;
  cacheKey: string;
  raw?: Record<string, unknown>;
};

const cacheTtlMs = 7 * 24 * 60 * 60 * 1000;
const cacheDir = path.join(process.cwd(), "data", "cache", "ai-responses");
const logPath = path.join(process.cwd(), "data", "logs", "ai-local.log");
let queue = Promise.resolve();
let queuedRequests = 0;
let activeRequests = 0;
let lastErrorMessage = "";

export function isLocalAIEnabled(env: LocalAIEnv = process.env as unknown as LocalAIEnv) {
  return env.ENABLE_LOCAL_AI === "true";
}

export function localAIConfig(env: LocalAIEnv = process.env as unknown as LocalAIEnv) {
  return {
    model: env.LOCAL_AI_MODEL || "llama3.2:3b",
    fineTunedModel: env.LOCAL_AI_FINETUNED_MODEL || "cs2-prediction-finetuned",
    baseUrl: (env.LOCAL_AI_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, ""),
    timeoutMs: Number(env.LOCAL_AI_TIMEOUT_MS || 60_000)
  };
}

export async function listLocalAIModels(input: { env?: LocalAIEnv; fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  if (!isLocalAIEnabled(input.env)) return { enabled: false, models: [] as string[], fineTunedAvailable: false };
  const config = localAIConfig(input.env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 3_000);
  try {
    const response = await (input.fetchImpl || fetch)(`${config.baseUrl}/api/tags`, { signal: controller.signal });
    const parsed = await response.json() as { models?: Array<{ name?: string; model?: string }> };
    const models = (parsed.models ?? []).map((model) => model.name || model.model || "").filter(Boolean);
    return {
      enabled: true,
      models,
      fineTunedAvailable: models.some((model) => model === config.fineTunedModel || model.startsWith(`${config.fineTunedModel}:`))
    };
  } catch {
    return { enabled: true, models: [] as string[], fineTunedAvailable: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function askLocalAI(input: LocalAIRequest): Promise<LocalAIResponse> {
  if (!isLocalAIEnabled(input.env)) {
    throw new Error("Local AI is disabled. Set ENABLE_LOCAL_AI=true to use Ollama extraction.");
  }
  queuedRequests += 1;
  const execute = async () => {
    queuedRequests = Math.max(0, queuedRequests - 1);
    activeRequests += 1;
    try {
      return await askLocalAIUnsafe(input);
    } finally {
      activeRequests = Math.max(0, activeRequests - 1);
    }
  };
  const run = queue.then(execute, execute);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

async function askLocalAIUnsafe(input: LocalAIRequest): Promise<LocalAIResponse> {
  const config = localAIConfig(input.env);
  const model = input.model || config.model;
  const startedAt = Date.now();
  const fetchImpl = input.fetchImpl || fetch;
  const timeoutMs = input.timeoutMs ?? config.timeoutMs;
  const cacheKey = hash([
    "v1",
    model,
    input.system || "",
    input.prompt,
    ...(input.cacheKeyParts || [])
  ].join("\n---\n"));

  if (input.useCache !== false) {
    const cached = await readCache(cacheKey);
    if (cached) {
      await logAI({ model, status: "cached", durationMs: Date.now() - startedAt, cacheKey });
      return { ...cached, model, durationMs: Date.now() - startedAt, cached: true, cacheKey };
    }
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) controller.abort(input.signal.reason);
  else input.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        system: input.system,
        stream: false,
        format: "json"
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Ollama request failed with HTTP ${response.status}: ${redactString(text).slice(0, 200)}`);
    }
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const answer = typeof parsed.response === "string" ? parsed.response : "";
    if (!answer.trim()) throw new Error("Ollama returned an empty response.");
    const durationMs = Date.now() - startedAt;
    await writeCache(cacheKey, { text: answer, raw: parsed });
    await logAI({
      model,
      status: "completed",
      durationMs,
      cacheKey,
      evalCount: numberOrUndefined(parsed.eval_count),
      promptEvalCount: numberOrUndefined(parsed.prompt_eval_count)
    });
    return { text: answer, model, durationMs, cached: false, cacheKey, raw: parsed };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : "Ollama request failed.";
    lastErrorMessage = redactString(message);
    await logAI({ model, status: "error", durationMs, cacheKey, errorMessage: message });
    throw new Error(redactString(message));
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onAbort);
  }
}

async function readCache(cacheKey: string): Promise<Pick<LocalAIResponse, "text" | "raw"> | null> {
  try {
    const parsed = JSON.parse(await readFile(path.join(cacheDir, `${cacheKey}.json`), "utf8")) as {
      timestamp: number;
      text: string;
      raw?: Record<string, unknown>;
    };
    if (Date.now() - parsed.timestamp > cacheTtlMs) return null;
    return { text: parsed.text, raw: parsed.raw };
  } catch {
    return null;
  }
}

async function writeCache(cacheKey: string, payload: { text: string; raw?: Record<string, unknown> }) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, `${cacheKey}.json`), JSON.stringify({ timestamp: Date.now(), ...payload }, null, 2), "utf8");
}

export async function logAI(entry: Record<string, unknown>) {
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${redactString(JSON.stringify({ timestamp: new Date().toISOString(), ...entry }))}\n`, "utf8");
}

export function getLocalAIQueueStats() {
  return { queuedRequests, activeRequests, lastErrorMessage };
}

export async function readLocalAIUsageStats(hours = 24) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const lines = await readLogLines(5000);
  const parsed = lines.flatMap((line) => {
    try {
      const item = JSON.parse(line) as Record<string, unknown>;
      const timestamp = typeof item.timestamp === "string" ? new Date(item.timestamp).getTime() : 0;
      return timestamp >= cutoff ? [item] : [];
    } catch {
      return [];
    }
  });
  const completed = parsed.filter((item) => item.status === "completed" || item.status === "cached" || item.status === "extracted");
  const durations = completed.map((item) => Number(item.durationMs)).filter((value) => Number.isFinite(value));
  const hourly = parsed.reduce<Record<string, number>>((acc, item) => {
    const timestamp = typeof item.timestamp === "string" ? new Date(item.timestamp) : new Date();
    const key = timestamp.toISOString().slice(0, 13) + ":00";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    total: parsed.length,
    completed: completed.length,
    errors: parsed.filter((item) => item.status === "error").length,
    cached: parsed.filter((item) => item.status === "cached").length,
    averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    hourly,
    recentErrors: parsed.filter((item) => item.status === "error").slice(-20).reverse()
  };
}

export async function aiResponseCacheStats() {
  const files = await readdir(cacheDir, { recursive: true }).catch(() => [] as string[]);
  let count = 0;
  let bytes = 0;
  for (const file of files) {
    if (!String(file).endsWith(".json")) continue;
    const fullPath = path.join(cacheDir, String(file));
    const item = await stat(fullPath).catch(() => null);
    if (item?.isFile()) {
      count += 1;
      bytes += item.size;
    }
  }
  return { path: cacheDir, count, bytes, ttlMs: cacheTtlMs };
}

export async function clearLocalAICache() {
  await rm(cacheDir, { recursive: true, force: true });
  await mkdir(cacheDir, { recursive: true });
  await mkdir(path.join(cacheDir, "extractions"), { recursive: true });
  await mkdir(path.join(cacheDir, "accepted"), { recursive: true });
}

export async function testLocalAIConnection(input: { prompt?: string; env?: LocalAIEnv; fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  const startedAt = Date.now();
  try {
    const result = await askLocalAI({
      prompt: input.prompt || "{\"ping\":\"ok\"}",
      system: "Return strict JSON: {\"ok\":true}.",
      env: input.env,
      fetchImpl: input.fetchImpl,
      timeoutMs: input.timeoutMs ?? 10_000,
      useCache: false
    });
    return { ok: true, model: result.model, durationMs: Date.now() - startedAt, text: result.text.slice(0, 300) };
  } catch (error) {
    return { ok: false, durationMs: Date.now() - startedAt, error: error instanceof Error ? redactString(error.message) : "Local AI test failed." };
  }
}

async function readLogLines(limit: number) {
  try {
    const lines = (await readFile(logPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit);
  } catch {
    return [];
  }
}

export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
