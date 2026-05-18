import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchText, stableSlug, wait, type FetchLike } from "../data-fetchers/utils";

export type CsstatsResolveOptions = {
  teamName: string;
  cachePath?: string;
  enabled?: boolean;
  dryRun?: boolean;
  fetchImpl?: FetchLike;
  waitImpl?: (ms: number) => Promise<void>;
  rateLimitMs?: number;
};

export type CsstatsCacheEntry = {
  teamName: string;
  teamId: string;
  sourceUrl: string;
  updatedAt: string;
};

const allowedHosts = new Set(["csgostats.gg", "www.csgostats.gg", "csstats.gg", "www.csstats.gg"]);
const defaultSearchHost = "csgostats.gg";
// Narrow policy exception: csgostats.gg/search only, no pagination or team page traversal.
let lastLookupAt = 0;

export async function resolveCsstatsTeamId(options: CsstatsResolveOptions): Promise<string | null> {
  if (options.enabled === false) return null;
  const teamName = options.teamName.trim();
  if (!teamName) return null;

  const cachePath = resolveCachePath(options.cachePath);
  const cache = await readCache(cachePath);
  const cacheKey = stableSlug(teamName);
  const cached = cache[cacheKey]?.teamId;
  if (cached) return cached;

  await guardRateLimit(options.rateLimitMs ?? 2000, options.waitImpl ?? wait);
  const sourceUrl = buildCsstatsSearchUrl(teamName);
  const html = await fetchText(sourceUrl, {
    headers: {
      Accept: "text/html,text/plain,*/*",
      "User-Agent": "CS2MatchPredictionLab/0.9.5 csstats team id lookup"
    }
  }, options.fetchImpl);
  const teamId = extractCsstatsTeamId(html, teamName);
  if (!teamId) return null;

  if (!options.dryRun) {
    cache[cacheKey] = {
      teamName,
      teamId,
      sourceUrl,
      updatedAt: new Date().toISOString()
    };
    await writeCache(cachePath, cache);
  }
  return teamId;
}

export function buildCsstatsSearchUrl(teamName: string, host = defaultSearchHost) {
  if (!allowedHosts.has(host.toLowerCase())) throw new Error(`CSStats search host is not allowed: ${host}.`);
  const url = new URL(`https://${host}/search`);
  url.searchParams.set("q", teamName);
  return url.toString();
}

export function buildCsstatsExportUrl(teamId: string, type: "map_stats" | "player_stats", host = defaultSearchHost) {
  if (!allowedHosts.has(host.toLowerCase())) throw new Error(`CSStats export host is not allowed: ${host}.`);
  if (!/^\d+$/.test(teamId)) throw new Error("CSStats teamId must be numeric.");
  const url = new URL(`https://${host}/team/${teamId}/export`);
  url.searchParams.set("type", type === "map_stats" ? "maps" : "players");
  return url.toString();
}

export function extractCsstatsTeamId(html: string, teamName: string) {
  const target = stableSlug(teamName);
  const candidates: Array<{ teamId: string; label: string; score: number }> = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']*\/team\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1] ?? "";
    const teamId = match[2] ?? "";
    const label = stripTags(match[3] ?? "") || href;
    const score = scoreCandidate(target, label, href);
    if (teamId && score >= 0.45) candidates.push({ teamId, label, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1];
  if (!best) return null;
  if (second && best.score >= 0.9 && second.score >= 0.9 && best.teamId !== second.teamId) return null;
  return best.teamId;
}

export function resetCsstatsRateLimitForTests() {
  lastLookupAt = 0;
}

function resolveCachePath(cachePath?: string) {
  return path.resolve(process.cwd(), cachePath ?? path.join("data", "cache", "csstats_ids.json"));
}

async function readCache(cachePath: string): Promise<Record<string, CsstatsCacheEntry>> {
  try {
    return JSON.parse(await readFile(cachePath, "utf8")) as Record<string, CsstatsCacheEntry>;
  } catch {
    return {};
  }
}

async function writeCache(cachePath: string, cache: Record<string, CsstatsCacheEntry>) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

async function guardRateLimit(rateLimitMs: number, waitImpl: (ms: number) => Promise<void>) {
  if (rateLimitMs <= 0) return;
  if (lastLookupAt > 0) await waitImpl(rateLimitMs);
  lastLookupAt = Date.now();
}

function scoreCandidate(target: string, label: string, href: string) {
  const labelSlug = stableSlug(decodeHtml(label));
  const hrefSlug = stableSlug(href.replace(/\/team\/\d+\/?/, ""));
  if (labelSlug === target || hrefSlug === target) return 1;
  if (labelSlug.includes(target) || target.includes(labelSlug)) return 0.86;
  if (hrefSlug.includes(target) || target.includes(hrefSlug)) return 0.72;
  const labelTokens = new Set(labelSlug.split("_").filter(Boolean));
  const targetTokens = new Set(target.split("_").filter(Boolean));
  const shared = [...targetTokens].filter((token) => labelTokens.has(token)).length;
  return shared / Math.max(targetTokens.size, labelTokens.size, 1);
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
