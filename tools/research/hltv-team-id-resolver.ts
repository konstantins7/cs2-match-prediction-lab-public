import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type FetchLike, type FetcherEnv } from "../data-fetchers/utils";
import { searchGoogleCse } from "./google-cse-fetcher";
import { hltvSlug, isResearchEnabled, researchFetchText, stripTags } from "./hltv-client";
import { getCachedIdentifier, setCachedIdentifier } from "./id-cache";
import { extractHltvTeamIdsFromRss, fetchRssItems } from "./rss-fetcher";

export type HltvTeamIdResolveResult = {
  teamName: string;
  teamId: string;
  source: "cache" | "rss" | "google-cse" | "hltv-search" | "missing";
  warnings: string[];
};

export async function resolveHltvTeamId(options: {
  teamName: string;
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  waitImpl?: (ms: number) => Promise<void>;
  cacheDir?: string;
  noCache?: boolean;
  rateLimitMs?: number;
  now?: Date;
}): Promise<HltvTeamIdResolveResult> {
  const cachePath = teamCachePath(options.teamName, options.cacheDir);
  const sharedCached = await getCachedIdentifier("hltvTeam", options.teamName, options.now ?? new Date());
  if (sharedCached) return { teamName: options.teamName, teamId: sharedCached, source: "cache", warnings: [] };
  const cached = await readTeamCache(cachePath, options.now ?? new Date());
  if (cached) return { teamName: options.teamName, teamId: cached, source: "cache", warnings: [] };

  const rss = await fetchRssItems("https://www.hltv.org/rss/matches", {
    env: options.env,
    fetchImpl: options.fetchImpl,
    cacheDir: options.cacheDir,
    now: options.now,
    allowedHosts: ["www.hltv.org", "hltv.org"],
    allowedPathPatterns: [/^\/rss\/matches$/]
  });
  const rssId = extractHltvTeamIdsFromRss(rss.items, options.teamName)[0] ?? "";
  if (rssId) {
    await writeTeamCache(cachePath, rssId, options.now);
    await setCachedIdentifier("hltvTeam", options.teamName, rssId, "rss", options.now ?? new Date());
    return { teamName: options.teamName, teamId: rssId, source: "rss", warnings: rss.warnings };
  }

  const cse = await searchGoogleCse(`${options.teamName} HLTV team`, {
    env: options.env,
    fetchImpl: options.fetchImpl,
    siteSearch: "hltv.org/team"
  });
  const cseId = cse.links.map((link) => link.match(/\/team\/(\d+)\//i)?.[1] ?? "").find(Boolean) ?? "";
  if (cseId) {
    await writeTeamCache(cachePath, cseId, options.now);
    await setCachedIdentifier("hltvTeam", options.teamName, cseId, "google-cse", options.now ?? new Date());
    return { teamName: options.teamName, teamId: cseId, source: "google-cse", warnings: cse.warnings };
  }

  if (isResearchEnabled(options.env ?? process.env, "ENABLE_HLTV_AUTOMATION")) {
    const direct = await resolveHltvTeamIdViaSearch(options);
    if (direct.teamId) {
      await writeTeamCache(cachePath, direct.teamId, options.now);
      await setCachedIdentifier("hltvTeam", options.teamName, direct.teamId, "hltv-search", options.now ?? new Date());
      return { teamName: options.teamName, teamId: direct.teamId, source: "hltv-search", warnings: [...rss.warnings, ...cse.warnings, ...direct.warnings] };
    }
    return { teamName: options.teamName, teamId: "", source: "missing", warnings: [...rss.warnings, ...cse.warnings, ...direct.warnings] };
  }

  return { teamName: options.teamName, teamId: "", source: "missing", warnings: [...rss.warnings, ...cse.warnings] };
}

async function resolveHltvTeamIdViaSearch(options: {
  teamName: string;
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  waitImpl?: (ms: number) => Promise<void>;
  cacheDir?: string;
  noCache?: boolean;
  rateLimitMs?: number;
  now?: Date;
}) {
  const url = new URL("https://www.hltv.org/search");
  url.searchParams.set("query", options.teamName);
  const response = await researchFetchText(url.toString(), {
    env: options.env,
    fetchImpl: options.fetchImpl,
    waitImpl: options.waitImpl,
    cacheDir: options.cacheDir,
    noCache: options.noCache,
    rateLimitMs: options.rateLimitMs,
    now: options.now,
    sourceFlag: "ENABLE_HLTV_AUTOMATION",
    allowedHosts: ["www.hltv.org", "hltv.org"],
    allowedPathPatterns: [/^\/search$/],
    cacheNamespace: "hltv-team-search",
    robotsCheck: true
  });
  if (!response.body) return { teamId: "", warnings: response.warnings };
  return { teamId: extractBestHltvTeamId(response.body, options.teamName), warnings: response.warnings };
}

export function extractBestHltvTeamId(html: string, teamName: string) {
  const target = hltvSlug(teamName);
  const candidates: Array<{ id: string; score: number }> = [];
  const pattern = /<a\b[^>]*href=["']\/team\/(\d+)\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const id = match[1] ?? "";
    const slug = hltvSlug(`${match[2] ?? ""} ${stripTags(match[3] ?? "")}`);
    const parts = target.split("-").filter(Boolean);
    const score = slug === target ? 1 : parts.length ? parts.filter((part) => slug.includes(part)).length / parts.length : 0;
    if (id && score >= 0.67) candidates.push({ id, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.id ?? "";
}

function teamCachePath(teamName: string, cacheDir?: string) {
  const digest = createHash("sha256").update(teamName.trim().toLowerCase()).digest("hex");
  return path.resolve(process.cwd(), cacheDir ?? path.join("data", "research-cache", "hltv-team-ids"), `${digest}.json`);
}

async function readTeamCache(filePath: string, now: Date) {
  try {
    const cached = JSON.parse(await readFile(filePath, "utf8")) as { timestamp?: string; teamId?: string };
    const timestamp = cached.timestamp ? new Date(cached.timestamp).getTime() : 0;
    if (cached.teamId && Number.isFinite(timestamp) && now.getTime() - timestamp < 24 * 60 * 60 * 1000) return cached.teamId;
  } catch {
    // Cache miss.
  }
  return "";
}

async function writeTeamCache(filePath: string, teamId: string, now = new Date()) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ timestamp: now.toISOString(), teamId }, null, 2)}\n`, "utf8");
}
