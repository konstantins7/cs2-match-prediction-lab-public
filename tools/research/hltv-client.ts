import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fetchText, wait, type FetchLike, type FetcherEnv } from "../data-fetchers/utils";
import { checkRobotsAllowed } from "./robots-cache";
import { logResearchEvent } from "./research-log";

export type ResearchFetchOptions = {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  waitImpl?: (ms: number) => Promise<void>;
  cacheDir?: string;
  rateLimitMs?: number;
  now?: Date;
  sourceFlag?: string;
  allowedHosts?: string[];
  allowedPathPatterns?: RegExp[];
  cacheNamespace?: string;
  robotsCheck?: boolean;
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
  const sourceFlag = options.sourceFlag ?? "ENABLE_HLTV_AUTOMATION";
  if (!isResearchEnabled(env, sourceFlag)) {
    return { status: "disabled", url: redactResearchUrl(url), body: "", warnings: [`Research source is disabled: ${sourceFlag}.`] };
  }
  if (!isAllowedResearchUrl(url, options)) {
    await logResearchEvent({ level: "WARN", source: "research-fetch", message: "Research URL outside allowlist.", url }).catch(() => undefined);
    return { status: "blocked", url: redactResearchUrl(url), body: "", warnings: ["Research URL is outside the allowlist."] };
  }
  if (options.robotsCheck) {
    const robots = await checkRobotsAllowed(url, {
      env,
      fetchImpl: options.fetchImpl,
      cacheDir: options.cacheDir ? path.join(options.cacheDir, "robots") : undefined,
      now: options.now
    });
    warnings.push(...robots.warnings);
    if (!robots.allowed) {
      await logResearchEvent({ level: "WARN", source: "robots", message: "robots.txt disallow for research request.", url }).catch(() => undefined);
      return { status: "blocked", url: redactResearchUrl(url), body: "", warnings };
    }
  }

  const cachePath = cacheFilePath(url, options.cacheDir, options.cacheNamespace);
  const cached = await readFreshCache(cachePath, options.now ?? new Date());
  if (cached !== null) return { status: "cached", url: redactResearchUrl(url), body: cached, warnings };

  try {
    const body = await fetchWithRetries(url, options);
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify({ timestamp: (options.now ?? new Date()).toISOString(), body }, null, 2)}\n`, "utf8");
    return { status: "success", url: redactResearchUrl(url), body, warnings };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "HLTV research request failed.");
    await logResearchEvent({ level: "WARN", source: "research-fetch", message: warnings.at(-1) ?? "Research request failed.", url }).catch(() => undefined);
    return { status: "failed", url: redactResearchUrl(url), body: "", warnings };
  }
}

async function fetchWithRetries(url: string, options: ResearchFetchOptions) {
  const waitImpl = options.waitImpl ?? wait;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await guardRateLimit(options.rateLimitMs ?? 5000, waitImpl, options.now ?? new Date());
      const body = await fetchText(url, {
        headers: {
          Accept: "text/html,text/plain,*/*",
          "User-Agent": hltvResearchUserAgent
        }
      }, options.fetchImpl);
      lastResearchRequestAt = Date.now();
      return body;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/HTTP 403/i.test(message) || attempt === 2) break;
      await logResearchEvent({ level: "WARN", source: "research-fetch", message: `403 retry ${attempt + 1}/3 with exponential backoff.`, url }).catch(() => undefined);
      await waitImpl(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Research request failed.");
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
  if (/^\/stats\/teams\/mapstats\/\d+\/[a-z0-9-]+$/i.test(url.pathname)) return true;
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

function cacheFilePath(url: string, cacheDir?: string, namespace?: string) {
  const digest = createHash("sha256").update(url).digest("hex");
  const root = cacheDir ?? (namespace ? path.join("data", "research-cache", namespace) : defaultCacheDir);
  return path.resolve(process.cwd(), root, `${digest}.json`);
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
}

function redactResearchUrl(url: string) {
  return url.replace(/([?&](?:token|key|api_key|authorization)=)[^&]+/gi, "$1[redacted]");
}

function isAllowedResearchUrl(rawUrl: string, options: ResearchFetchOptions) {
  if (!options.allowedHosts?.length && !options.allowedPathPatterns?.length) return isAllowedHltvUrl(rawUrl);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const allowedHosts = options.allowedHosts?.map((value) => value.toLowerCase()) ?? [];
  if (allowedHosts.length && !allowedHosts.includes(host)) return false;
  if (options.allowedPathPatterns?.length && !options.allowedPathPatterns.some((pattern) => pattern.test(url.pathname))) return false;
  return true;
}
