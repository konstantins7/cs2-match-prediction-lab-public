import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { redactString } from "@/lib/security/redaction";

export type AutomationNoticeLevel = "info" | "warn" | "error";

export type AutomationNotice = {
  level: AutomationNoticeLevel;
  source: string;
  message: string;
  details?: Record<string, unknown>;
};

const logPath = path.join(process.cwd(), "data", "logs", "automation-runner.log");

export async function notifyAutomation(notice: AutomationNotice) {
  const entry = {
    timestamp: new Date().toISOString(),
    ...notice,
    message: redactString(notice.message),
    details: notice.details ? redactJson(notice.details) : undefined
  };
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  if (notice.level === "error") console.error(`[automation] ${entry.message}`);
  else if (notice.level === "warn") console.warn(`[automation] ${entry.message}`);
  else console.log(`[automation] ${entry.message}`);

  if (process.env.ENABLE_NOTIFICATIONS === "true") {
    await appendFile(logPath, `${JSON.stringify({ ...entry, notification: "external providers are not configured in v1.7.0" })}\n`, "utf8");
  }
}

export function redactJson<T>(value: T): T {
  if (typeof value === "string") return redactString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactJson(item)) as T;
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = /(key|token|secret|password|authorization|bearer)/i.test(key) ? "[REDACTED]" : redactJson(item);
    }
    return result as T;
  }
  return value;
}
