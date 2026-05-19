import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type FetchLike, type FetcherEnv } from "../data-fetchers/utils";
import { searchGoogleCse } from "./google-cse-fetcher";
import { getCachedIdentifier, setCachedIdentifier } from "./id-cache";
import { extractHltvTeamIdsFromRss, fetchRssItems } from "./rss-fetcher";

export type HltvTeamIdResolveResult = {
  teamName: string;
  teamId: string;
  source: "cache" | "rss" | "google-cse" | "missing";
  warnings: string[];
};

export async function resolveHltvTeamId(options: {
  teamName: string;
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  cacheDir?: string;
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

  return { teamName: options.teamName, teamId: "", source: "missing", warnings: [...rss.warnings, ...cse.warnings] };
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
