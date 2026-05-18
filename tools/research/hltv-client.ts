import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fetchText, wait, type FetchLike, type FetcherEnv } from "../data-fetchers/utils";

export type ResearchFetchOptions = {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  waitImpl?: (ms: number) => Promise<void>;
  cacheDir?: string;
  rateLimitMs?: number;
  now?: Date;
};

export type ResearchFetchResult = {
  status: "success" | "cached" | "disabled" | "blocked" | "failed";
  url: string;
  body: string;
  warnings: string[];
};

export const hltvResearchUserAgent = "CS2MatchPredictionLab/1.0-research (contact: saldinkostya97@gmail.com)";
export const hltvCacheTtlMs = 24 * 60 * 60 * 1000;
const defaultCacheDir = path.join("data", "research-cache", "hltv");
let lastResearchRequestAt = 0;

export async function researchFetchText(url: string, options: ResearchFetchOptions = {}): Promise<ResearchFetchResult> {
  const env = options.env ?? process.env;
  const warnings: string[] = [];
  if (!isResearchEnabled(env, "ENABLE_HLTV_AUTOMATION")) {
    return { status: "disabled", url: redactResearchUrl(url), body: "", warnings: ["Research HLTV automation is disabled."] };
  }
  if (!isAllowedHltvUrl(url)) {
    return { status: "blocked", url: redactResearchUrl(url), body: "", warnings: ["HLTV research URL is outside the allowlist."] };
  }

  const cachePath = cacheFilePath(url, options.cacheDir);
  const cached = await readFreshCache(cachePath, options.now ?? new Date());
  if (cached !== null) return { status: "cached", url: redactResearchUrl(url), body: cached, warnings };

  try {
    await guardRateLimit(options.rateLimitMs ?? 5000, options.waitImpl ?? wait, options.now ?? new Date());
    const body = await fetchText(url, {
      headers: {
        Accept: "text/html,text/plain,*/*",
        "User-Agent": hltvResearchUserAgent
      }
    }, options.fetchImpl);
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify({ timestamp: (options.now ?? new Date()).toISOString(), body }, null, 2)}\n`, "utf8");
    return { status: "success", url: redactResearchUrl(url), body, warnings };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "HLTV research request failed.");
    return { status: "failed", url: redactResearchUrl(url), body: "", warnings };
  }
}

export function isResearchEnabled(env: FetcherEnv, sourceFlag: string) {
  return env.ENABLE_RESEARCH_SOURCES === "true" && env[sourceFlag] === "true";
}

export function isAllowedHltvUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "www.hltv.org" && host !== "hltv.org") return false;
  if (url.pathname === "/search") return url.searchParams.has("query");
  if (/^\/matches\/\d+\/[a-z0-9-]+$/i.test(url.pathname)) return true;
  if (/^\/stats\/teams\/maps\/\d+\/[a-z0-9-]+$/i.test(url.pathname)) return true;
  if (url.pathname === "/stats/players") return Boolean(url.searchParams.get("team"));
  return false;
}

export function hltvSlug(value: string) {
  return value.trim().toLowerCase().replace(/^team\s+/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function stripTags(value: string) {
  return decodeHtml(value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim());
}

export function parseNumber(value: string) {
  const normalized = value.replace("%", "").replace(",", ".").replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === ".") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeMapName(value: string) {
  const target = hltvSlug(value);
  return ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"].find((map) => hltvSlug(map) === target) ?? "";
}

export function resetHltvResearchRateLimitForTests() {
  lastResearchRequestAt = 0;
}

function cacheFilePath(url: string, cacheDir?: string) {
  const digest = createHash("sha256").update(url).digest("hex");
  return path.resolve(process.cwd(), cacheDir ?? defaultCacheDir, `${digest}.json`);
}

async function readFreshCache(filePath: string, now: Date) {
  try {
    const cached = JSON.parse(await readFile(filePath, "utf8")) as { timestamp?: string; body?: string };
    const timestamp = cached.timestamp ? new Date(cached.timestamp).getTime() : 0;
    if (cached.body && Number.isFinite(timestamp) && now.getTime() - timestamp < hltvCacheTtlMs) return cached.body;
  } catch {
    // Cache misses are expected.
  }
  return null;
}

async function guardRateLimit(rateLimitMs: number, waitImpl: (ms: number) => Promise<void>, now: Date) {
  if (rateLimitMs <= 0) return;
  const current = now.getTime();
  if (lastResearchRequestAt > 0) {
    const delta = current - lastResearchRequestAt;
    if (delta < rateLimitMs) await waitImpl(rateLimitMs - delta);
  }
  lastResearchRequestAt = Date.now();
}

function redactResearchUrl(url: string) {
  return url.replace(/([?&](?:token|key|api_key|authorization)=)[^&]+/gi, "$1[redacted]");
}
