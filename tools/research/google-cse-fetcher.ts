import { redactUrl, type FetchLike, type FetcherEnv } from "../data-fetchers/utils";
import { isResearchEnabled } from "./hltv-client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type GoogleCseResult = {
  status: "success" | "skipped" | "failed" | "quota_exceeded";
  links: string[];
  warnings: string[];
};

export async function searchGoogleCse(query: string, options: {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  siteSearch?: string;
} = {}): Promise<GoogleCseResult> {
  const env = options.env ?? process.env;
  if (!isResearchEnabled(env, "ENABLE_GOOGLE_CSE_FALLBACK")) {
    return { status: "skipped", links: [], warnings: ["Research source is disabled: ENABLE_GOOGLE_CSE_FALLBACK."] };
  }
  const key = env.GOOGLE_CSE_API_KEY ?? "";
  const cx = env.GOOGLE_CSE_CX ?? "";
  if (!key || !cx) return { status: "skipped", links: [], warnings: ["Google CSE key/cx is not configured."] };
  const quota = Number(env.GOOGLE_CSE_DAILY_QUOTA ?? 100);
  const usage = await readUsage(options.env ?? process.env);
  if (Number.isFinite(quota) && quota > 0 && usage.count >= Math.floor(quota * 0.8)) {
    return { status: "quota_exceeded", links: [], warnings: [`Google CSE daily usage is ${usage.count}/${quota}; disabled at 80% guardrail.`] };
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", options.siteSearch ? `site:${options.siteSearch} ${query}` : query);
  try {
    const response = await (options.fetchImpl ?? fetch)(url.toString(), { headers: { Accept: "application/json" } });
    await incrementUsage(options.env ?? process.env);
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const error = payload.error as Record<string, unknown> | undefined;
    const reason = JSON.stringify(error ?? payload).toLowerCase();
    if (reason.includes("quotaexceeded") || reason.includes("quota exceeded")) {
      return { status: "quota_exceeded", links: [], warnings: ["Google CSE quotaExceeded; falling through to the next source."] };
    }
    if (!response.ok) return { status: "failed", links: [], warnings: [`Google CSE returned HTTP ${response.status} for ${redactUrl(url.toString())}.`] };
    const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
    return { status: "success", links: items.map((item) => String(item.link ?? "")).filter(Boolean), warnings: [] };
  } catch (error) {
    return { status: "failed", links: [], warnings: [error instanceof Error ? error.message.replace(key, "[redacted]") : "Google CSE request failed."] };
  }
}

async function readUsage(env: FetcherEnv) {
  const filePath = usagePath(env);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as { date?: string; count?: number };
    return parsed.date === today ? { date: today, count: Number(parsed.count ?? 0) } : { date: today, count: 0 };
  } catch {
    return { date: today, count: 0 };
  }
}

async function incrementUsage(env: FetcherEnv) {
  const current = await readUsage(env);
  const filePath = usagePath(env);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ date: current.date, count: current.count + 1 }, null, 2)}\n`, "utf8");
}

function usagePath(env: FetcherEnv) {
  return path.resolve(process.cwd(), env.GOOGLE_CSE_USAGE_PATH ?? path.join("data", "cache", "google-cse", "usage.json"));
}
