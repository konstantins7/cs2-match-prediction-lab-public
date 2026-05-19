import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { envFlag, fetchText, stableSlug, type FetchLike, type FetcherEnv } from "../data-fetchers/utils";

export type CsstatsDemoFetchOptions = {
  matchId: string;
  teamName: string;
  teamId?: string;
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  cachePath?: string;
  demosDir?: string;
  dryRun?: boolean;
  maxBytes?: number;
};

export type CsstatsDemoFetchResult = {
  status: "success" | "skipped" | "missing" | "failed";
  demoPath?: string;
  sourceUrl?: string;
  warnings: string[];
};

const allowedHosts = new Set(["csgostats.gg", "www.csgostats.gg", "csstats.gg", "www.csstats.gg"]);

export async function fetchCsstatsDemo(options: CsstatsDemoFetchOptions): Promise<CsstatsDemoFetchResult> {
  const env = options.env ?? process.env;
  if (!envFlag(env, "ENABLE_RESEARCH_SOURCES") || !envFlag(env, "ENABLE_CSSTATS_DEMO_FETCH")) {
    return { status: "skipped", warnings: ["CSStats demo fetch is disabled."] };
  }
  const teamId = options.teamId ?? await readCachedTeamId(options.teamName, options.cachePath);
  if (!teamId) return { status: "missing", warnings: [`No cached CSStats team id for ${options.teamName}.`] };
  try {
    const demosUrl = buildCsstatsDemosUrl(teamId);
    const html = await fetchText(demosUrl, {
      headers: {
        Accept: "text/html,text/plain,*/*",
        "User-Agent": "CS2MatchPredictionLab/1.0-research csstats demo fetch"
      }
    }, options.fetchImpl);
    const demoUrl = extractFirstDemoUrl(html, demosUrl);
    if (!demoUrl) return { status: "missing", warnings: [`No public demo link found for ${options.teamName}.`] };
    const outputPath = path.join(path.resolve(process.cwd(), options.demosDir ?? path.join("data", "demos")), `${teamId}_${safeName(options.matchId)}${path.extname(new URL(demoUrl).pathname) || ".dem"}`);
    if (!options.dryRun) {
      const response = await (options.fetchImpl ?? fetch)(demoUrl, {
        headers: { "User-Agent": "CS2MatchPredictionLab/1.0-research csstats demo fetch" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for CSStats demo download.`);
      const size = Number(response.headers.get("content-length") ?? 0);
      const maxBytes = options.maxBytes ?? 100 * 1024 * 1024;
      if (size > maxBytes) throw new Error(`CSStats demo is too large (${size} bytes); cap is ${maxBytes} bytes.`);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
    }
    return { status: "success", demoPath: outputPath, sourceUrl: demoUrl, warnings: [] };
  } catch (error) {
    return { status: "failed", warnings: [error instanceof Error ? error.message : "CSStats demo fetch failed."] };
  }
}

export function buildCsstatsDemosUrl(teamId: string, host = "csgostats.gg") {
  if (!allowedHosts.has(host.toLowerCase())) throw new Error(`CSStats demo host is not allowed: ${host}.`);
  if (!/^\d+$/.test(teamId)) throw new Error("CSStats teamId must be numeric.");
  return `https://${host}/team/${teamId}/demos`;
}

export function extractFirstDemoUrl(html: string, baseUrl: string) {
  const pattern = /<a\b[^>]*href=["']([^"']+\.(?:dem|dem\.bz2|zip)(?:\?[^"']*)?)["'][^>]*>/i;
  const match = html.match(pattern);
  if (!match?.[1]) return "";
  const url = new URL(match[1], baseUrl);
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.has(host)) return "";
  return url.toString();
}

async function readCachedTeamId(teamName: string, cachePath?: string) {
  const resolved = path.resolve(process.cwd(), cachePath ?? path.join("data", "cache", "csstats_ids.json"));
  try {
    const cache = JSON.parse(await readFile(resolved, "utf8")) as Record<string, { teamId?: string }>;
    return cache[stableSlug(teamName)]?.teamId ?? "";
  } catch {
    return "";
  }
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
}
