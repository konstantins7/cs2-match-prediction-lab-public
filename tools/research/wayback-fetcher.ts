import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchText, wait } from "../data-fetchers/utils";
import { hltvResearchUserAgent, researchFetchText, type ResearchFetchOptions } from "./hltv-client";

export type WaybackFetchOptions = ResearchFetchOptions & {
  originalAllowedHosts?: string[];
  originalAllowedPathPatterns?: RegExp[];
  directSourceFlag?: string;
  directFirst?: boolean;
};

export type WaybackFetchResult = {
  status: "success" | "cached" | "disabled" | "blocked" | "failed";
  url: string;
  body: string;
  warnings: string[];
  via: "direct" | "wayback" | "none";
  snapshotUrl?: string;
};

const waybackCacheTtlMs = 7 * 24 * 60 * 60 * 1000;
const defaultWaybackCacheDir = path.join("data", "research-cache", "wayback");
let lastWaybackRequestAt = 0;

export async function fetchViaWayback(originalUrl: string, options: WaybackFetchOptions = {}): Promise<WaybackFetchResult> {
  const env = options.env ?? process.env;
  const warnings: string[] = [];
  if (env.ENABLE_RESEARCH_SOURCES !== "true" || env.ENABLE_WAYBACK_FALLBACK !== "true") {
    return { status: "disabled", url: redactResearchUrl(originalUrl), body: "", warnings: ["ENABLE_RESEARCH_SOURCES=true and ENABLE_WAYBACK_FALLBACK=true are required."], via: "none" };
  }
  if (!isOriginalUrlAllowed(originalUrl, options.originalAllowedHosts ?? options.allowedHosts ?? [], options.originalAllowedPathPatterns ?? options.allowedPathPatterns ?? [])) {
    return { status: "blocked", url: redactResearchUrl(originalUrl), body: "", warnings: ["Original URL is outside the source allowlist."], via: "none" };
  }

  if (options.directFirst !== false) {
    const direct = await researchFetchText(originalUrl, {
      ...options,
      sourceFlag: options.directSourceFlag ?? options.sourceFlag ?? "ENABLE_HLTV_AUTOMATION",
      allowedHosts: options.originalAllowedHosts ?? options.allowedHosts,
      allowedPathPatterns: options.originalAllowedPathPatterns ?? options.allowedPathPatterns,
      cacheNamespace: options.cacheNamespace ? `${options.cacheNamespace}-direct` : "wayback-direct"
    });
    warnings.push(...direct.warnings.map((warning) => `direct: ${warning}`));
    if (direct.body.trim()) {
      return { status: direct.status === "cached" ? "cached" : "success", url: direct.url, body: direct.body, warnings, via: "direct" };
    }
  }

  const cachePath = waybackCacheFilePath(originalUrl, options.cacheDir);
  const cached = await readFreshWaybackCache(cachePath, options.now ?? new Date());
  if (cached) {
    return { status: "cached", url: redactResearchUrl(originalUrl), body: cached.body, warnings, via: "wayback", snapshotUrl: cached.snapshotUrl };
  }

  try {
    const closest = await findClosestWaybackSnapshot(originalUrl, options);
    warnings.push(...closest.warnings);
    if (!closest.snapshotUrl) {
      return { status: "failed", url: redactResearchUrl(originalUrl), body: "", warnings: [...warnings, "Wayback Machine had no available snapshot."], via: "none" };
    }
    await guardWaybackRateLimit(options.rateLimitMs ?? 2000, options.waitImpl ?? wait, options.now ?? new Date());
    const body = await fetchText(closest.snapshotUrl, {
      headers: {
        Accept: "text/html,text/plain,*/*",
        "User-Agent": hltvResearchUserAgent
      }
    }, options.fetchImpl);
    if (!body.trim()) {
      return { status: "failed", url: closest.snapshotUrl, body: "", warnings: [...warnings, "Wayback snapshot body was empty."], via: "none", snapshotUrl: closest.snapshotUrl };
    }
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify({ timestamp: (options.now ?? new Date()).toISOString(), originalUrl, snapshotUrl: closest.snapshotUrl, body }, null, 2)}\n`, "utf8");
    return { status: "success", url: closest.snapshotUrl, body, warnings, via: "wayback", snapshotUrl: closest.snapshotUrl };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Wayback fetch failed.");
    return { status: "failed", url: redactResearchUrl(originalUrl), body: "", warnings, via: "none" };
  }
}

async function findClosestWaybackSnapshot(originalUrl: string, options: WaybackFetchOptions) {
  const warnings: string[] = [];
  const availabilityUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(originalUrl)}`;
  await guardWaybackRateLimit(options.rateLimitMs ?? 2000, options.waitImpl ?? wait, options.now ?? new Date());
  const text = await fetchText(availabilityUrl, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": hltvResearchUserAgent
    }
  }, options.fetchImpl);
  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch {
    warnings.push("Wayback availability response was not JSON.");
  }
  const closest = payload && typeof payload === "object"
    ? (((payload as Record<string, unknown>).archived_snapshots as Record<string, unknown> | undefined)?.closest as Record<string, unknown> | undefined)
    : undefined;
  const snapshotUrl = typeof closest?.url === "string" && closest.url.startsWith("https://web.archive.org/web/") ? closest.url : "";
  const available = closest?.available === true || snapshotUrl.length > 0;
  if (!available) warnings.push("Wayback availability API reported no closest snapshot.");
  return { snapshotUrl: available ? snapshotUrl : "", warnings };
}

function isOriginalUrlAllowed(rawUrl: string, allowedHosts: string[], allowedPathPatterns: RegExp[]) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (allowedHosts.length && !allowedHosts.map((value) => value.toLowerCase()).includes(host)) return false;
  if (allowedPathPatterns.length && !allowedPathPatterns.some((pattern) => pattern.test(url.pathname))) return false;
  return true;
}

async function readFreshWaybackCache(filePath: string, now: Date) {
  try {
    const cached = JSON.parse(await readFile(filePath, "utf8")) as { timestamp?: string; body?: string; snapshotUrl?: string };
    const timestamp = cached.timestamp ? new Date(cached.timestamp).getTime() : 0;
    if (cached.body && Number.isFinite(timestamp) && now.getTime() - timestamp < waybackCacheTtlMs) return { body: cached.body, snapshotUrl: cached.snapshotUrl };
  } catch {
    // Cache misses are expected.
  }
  return null;
}

function waybackCacheFilePath(originalUrl: string, cacheDir?: string) {
  const digest = createHash("sha256").update(originalUrl).digest("hex");
  return path.resolve(process.cwd(), cacheDir ?? defaultWaybackCacheDir, `${digest}.json`);
}

async function guardWaybackRateLimit(rateLimitMs: number, waitImpl: (ms: number) => Promise<void>, now: Date) {
  if (rateLimitMs <= 0) return;
  const current = now.getTime();
  if (lastWaybackRequestAt > 0) {
    const delta = current - lastWaybackRequestAt;
    if (delta < rateLimitMs) await waitImpl(rateLimitMs - delta);
  }
  lastWaybackRequestAt = Date.now();
}

function redactResearchUrl(url: string) {
  return url.replace(/([?&](?:token|key|api_key|authorization)=)[^&]+/gi, "$1[redacted]");
}
