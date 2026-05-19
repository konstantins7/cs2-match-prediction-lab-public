import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { redactString } from "./security/redaction";

export type UserActionStatus = "started" | "completed" | "error";

export type UserActionLogEntry = {
  userId?: string;
  actionName: string;
  matchId?: string;
  params?: Record<string, unknown>;
  durationMs?: number;
  status: UserActionStatus;
  errorMessage?: string;
};

const logPath = path.join(process.cwd(), "data", "logs", "user-actions.log");
const secretKeyPattern = /(key|token|secret|password|api[_-]?key|authorization|bearer)/i;

export async function logUserAction(action: UserActionLogEntry) {
  const entry = {
    timestamp: new Date().toISOString(),
    userId: action.userId ?? "anonymous",
    actionName: action.actionName,
    matchId: action.matchId,
    params: action.params ? redactParams(action.params) : undefined,
    durationMs: action.durationMs,
    status: action.status,
    errorMessage: action.errorMessage ? redactString(action.errorMessage) : undefined
  };
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${redactString(JSON.stringify(entry))}\n`, "utf8");
}

export async function tailUserActionLog(limit = 50) {
  try {
    const lines = (await readFile(logPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit);
  } catch {
    return [];
  }
}

export function redactParams(params: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [
    key,
    secretKeyPattern.test(key) ? "[REDACTED]" : redactValue(value)
  ]));
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") return redactParams(value as Record<string, unknown>);
  return value;
}
