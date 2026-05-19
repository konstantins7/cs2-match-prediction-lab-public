import { mkdir, readFile, stat, appendFile } from "node:fs/promises";
import path from "node:path";
import { redactString } from "../../src/lib/security/redaction";

export type ResearchLogLevel = "INFO" | "WARN" | "ERROR";

export type ResearchLogEvent = {
  level: ResearchLogLevel;
  source: string;
  message: string;
  url?: string;
};

const logPath = path.join(process.cwd(), "data", "logs", "research.log");

export async function logResearchEvent(event: ResearchLogEvent) {
  await mkdir(path.dirname(logPath), { recursive: true });
  const url = event.url ? ` ${redactResearchLogText(event.url)}` : "";
  const line = `[${new Date().toISOString()}] [${event.level}] [${event.source}] ${redactResearchLogText(event.message)}${url}\n`;
  await appendFile(logPath, line, "utf8");
}

export async function tailResearchLog(lines = 50) {
  try {
    const content = await readFile(logPath, "utf8");
    return content.trimEnd().split(/\r?\n/).slice(-Math.max(1, lines));
  } catch {
    return [];
  }
}

export async function analyzeResearchLog() {
  const exists = await stat(logPath).then(() => true).catch(() => false);
  if (!exists) return { ok: true, warnings: ["research.log does not exist yet."], recommendations: [] as string[] };
  const lines = await tailResearchLog(500);
  const recommendations: string[] = [];
  const warnings: string[] = [];
  const joined = lines.join("\n");
  if (/403|Forbidden/i.test(joined)) recommendations.push("403 detected: verify robots.txt, use cached/archive sources, or provide explicit IDs.");
  if (/quotaExceeded/i.test(joined)) recommendations.push("Google CSE quota exceeded: wait for quota reset or disable ENABLE_GOOGLE_CSE_FALLBACK.");
  if (/robots.*disallow|disallow.*robots/i.test(joined)) recommendations.push("robots.txt disallow detected: source correctly skipped; use manual CSV or allowed API.");
  if (/apify_api_[a-z0-9]/i.test(joined) || /APIFY_TOKEN\s*=\s*[^ \]]/i.test(joined)) warnings.push("Potential token-like value detected in research log.");
  return { ok: warnings.length === 0, warnings, recommendations };
}

export function researchLogPath() {
  return logPath;
}

function redactResearchLogText(value: string) {
  return redactString(value).replace(/([?&](?:key|api_key|token|authorization|access_token)=)[^&\s]+/gi, "$1[REDACTED]");
}
