import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchText, type FetchLike, type FetcherEnv } from "../data-fetchers/utils";

export type RobotsCheckOptions = {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  cacheDir?: string;
  now?: Date;
  userAgent?: string;
};

export type RobotsCheckResult = {
  allowed: boolean;
  status: "allowed" | "disallowed" | "failed";
  robotsUrl: string;
  warnings: string[];
};

export const robotsCacheTtlMs = 24 * 60 * 60 * 1000;
const defaultRobotsCacheDir = path.join("data", "research-cache", "robots");
const defaultResearchUserAgent = "CS2MatchPredictionLab/1.0-research (contact: saldinkostya97@gmail.com)";

export async function checkRobotsAllowed(rawUrl: string, options: RobotsCheckOptions = {}): Promise<RobotsCheckResult> {
  const warnings: string[] = [];
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, status: "failed", robotsUrl: "", warnings: ["Invalid URL for robots check."] };
  }
  const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;
  const robots = await loadRobotsTxt(robotsUrl, options);
  if (!robots.ok) {
    return { allowed: false, status: "failed", robotsUrl, warnings: [robots.warning] };
  }
  const allowed = isPathAllowedByRobots(robots.body, url.pathname || "/", options.userAgent ?? defaultResearchUserAgent);
  if (!allowed) warnings.push(`robots.txt disallows ${url.pathname || "/"} for research User-Agent.`);
  return { allowed, status: allowed ? "allowed" : "disallowed", robotsUrl, warnings };
}

export function isPathAllowedByRobots(robotsText: string, requestPath: string, userAgent = defaultResearchUserAgent) {
  const groups = parseRobotsGroups(robotsText);
  const agentToken = userAgent.toLowerCase().split(/[/\s(;]+/)[0] || "*";
  const matchingGroups = groups.filter((group) => group.agents.some((agent) => agent === "*" || agentToken.includes(agent) || agent.includes(agentToken)));
  const rules = (matchingGroups.length ? matchingGroups : groups.filter((group) => group.agents.includes("*"))).flatMap((group) => group.rules);
  if (!rules.length) return true;
  let selected: { directive: "allow" | "disallow"; path: string } | null = null;
  for (const rule of rules) {
    if (!rule.path) {
      if (rule.directive === "disallow") continue;
      selected = selectRule(selected, rule);
      continue;
    }
    if (pathMatchesRobotsRule(requestPath, rule.path)) selected = selectRule(selected, rule);
  }
  return selected?.directive !== "disallow";
}

export function parseRobotsGroups(robotsText: string) {
  const groups: Array<{ agents: string[]; rules: Array<{ directive: "allow" | "disallow"; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ directive: "allow" | "disallow"; path: string }> } | null = null;
  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = (match[1] ?? "").toLowerCase();
    const value = (match[2] ?? "").trim();
    if (key === "user-agent") {
      const normalized = value.toLowerCase();
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(normalized);
      continue;
    }
    if ((key === "allow" || key === "disallow") && current) {
      current.rules.push({ directive: key, path: value });
    }
  }
  return groups;
}

async function loadRobotsTxt(robotsUrl: string, options: RobotsCheckOptions) {
  const cachePath = robotsCacheFilePath(robotsUrl, options.cacheDir);
  const cached = await readFreshRobotsCache(cachePath, options.now ?? new Date());
  if (cached !== null) return { ok: true as const, body: cached };
  try {
    const body = await fetchText(robotsUrl, {
      headers: {
        Accept: "text/plain,*/*",
        "User-Agent": options.userAgent ?? defaultResearchUserAgent
      }
    }, options.fetchImpl);
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, body, "utf8");
    return { ok: true as const, body };
  } catch (error) {
    return { ok: false as const, warning: error instanceof Error ? `robots.txt fetch failed: ${error.message}` : "robots.txt fetch failed." };
  }
}

async function readFreshRobotsCache(filePath: string, now: Date) {
  try {
    const stats = await stat(filePath);
    if (now.getTime() - stats.mtimeMs > robotsCacheTtlMs) return null;
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function robotsCacheFilePath(robotsUrl: string, cacheDir?: string) {
  const url = new URL(robotsUrl);
  const safeHost = url.host.toLowerCase().replace(/[^a-z0-9.-]+/g, "_");
  return path.resolve(process.cwd(), cacheDir ?? defaultRobotsCacheDir, `${safeHost}.txt`);
}

function pathMatchesRobotsRule(requestPath: string, rulePath: string) {
  const cleanRule = rulePath.split(/[?#]/)[0] ?? "";
  if (!cleanRule) return false;
  if (cleanRule.endsWith("$")) return requestPath === cleanRule.slice(0, -1);
  return requestPath.startsWith(cleanRule);
}

function selectRule(current: { directive: "allow" | "disallow"; path: string } | null, candidate: { directive: "allow" | "disallow"; path: string }) {
  if (!current) return candidate;
  if (candidate.path.length > current.path.length) return candidate;
  if (candidate.path.length === current.path.length && candidate.directive === "allow") return candidate;
  return current;
}
