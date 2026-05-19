import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactString } from "@/lib/security/redaction";

export type LocalAIEnv = {
  ENABLE_LOCAL_AI?: string;
  LOCAL_AI_MODEL?: string;
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

export function isLocalAIEnabled(env: LocalAIEnv = process.env as unknown as LocalAIEnv) {
  return env.ENABLE_LOCAL_AI === "true";
}

export function localAIConfig(env: LocalAIEnv = process.env as unknown as LocalAIEnv) {
  return {
    model: env.LOCAL_AI_MODEL || "llama3.2:3b",
    baseUrl: (env.LOCAL_AI_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, ""),
    timeoutMs: Number(env.LOCAL_AI_TIMEOUT_MS || 30_000)
  };
}

export async function askLocalAI(input: LocalAIRequest): Promise<LocalAIResponse> {
  if (!isLocalAIEnabled(input.env)) {
    throw new Error("Local AI is disabled. Set ENABLE_LOCAL_AI=true to use Ollama extraction.");
  }
  const execute = () => askLocalAIUnsafe(input);
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
    await logAI({ model, status: "error", durationMs, cacheKey, errorMessage: message });
    throw new Error(redactString(message));
  } finally {
    clearTimeout(timeout);
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

export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
