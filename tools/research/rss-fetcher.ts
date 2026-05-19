import { type FetchLike, type FetcherEnv } from "../data-fetchers/utils";
import { isResearchEnabled, researchFetchText, stripTags } from "./hltv-client";

export type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
};

export async function fetchRssItems(url: string, options: {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  cacheDir?: string;
  now?: Date;
  allowedHosts?: string[];
  allowedPathPatterns?: RegExp[];
} = {}) {
  const env = options.env ?? process.env;
  if (!isResearchEnabled(env, "ENABLE_RSS_METADATA_DISCOVERY")) {
    return { status: "skipped" as const, items: [] as RssItem[], warnings: ["Research source is disabled: ENABLE_RSS_METADATA_DISCOVERY."] };
  }
  const response = await researchFetchText(url, {
    env,
    fetchImpl: options.fetchImpl,
    cacheDir: options.cacheDir,
    now: options.now,
    sourceFlag: "ENABLE_RSS_METADATA_DISCOVERY",
    allowedHosts: options.allowedHosts,
    allowedPathPatterns: options.allowedPathPatterns,
    cacheNamespace: "rss-metadata",
    robotsCheck: true,
    rateLimitMs: 2000
  });
  if (!response.body) return { status: response.status === "disabled" ? "skipped" as const : "failed" as const, items: [] as RssItem[], warnings: response.warnings };
  return { status: "success" as const, items: extractRssItems(response.body), warnings: response.warnings };
}

export function extractRssItems(xml: string): RssItem[] {
  const itemPattern = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  return [...xml.matchAll(itemPattern)].map((match) => {
    const block = match[2] ?? "";
    return {
      title: textTag(block, "title"),
      link: linkTag(block),
      pubDate: textTag(block, "pubDate") || textTag(block, "updated") || textTag(block, "published"),
      description: textTag(block, "description") || textTag(block, "summary")
    };
  }).filter((item) => item.title || item.link);
}

export function extractHltvMatchIdFromRss(items: RssItem[], teamA: string, teamB?: string) {
  const teamNeedles = [teamA, teamB].filter(Boolean).map((value) => value!.toLowerCase());
  for (const item of items) {
    const haystack = `${item.title} ${item.description} ${item.link}`.toLowerCase();
    if (teamNeedles.some((needle) => !haystack.includes(needle))) continue;
    const match = item.link.match(/\/matches\/(\d+)\//i);
    if (match?.[1]) return match[1];
  }
  return "";
}

export function extractHltvTeamIdsFromRss(items: RssItem[], teamName: string) {
  const needle = teamName.toLowerCase();
  const ids = new Set<string>();
  for (const item of items) {
    const haystack = `${item.title} ${item.description}`.toLowerCase();
    if (!haystack.includes(needle)) continue;
    for (const match of `${item.description} ${item.link}`.matchAll(/\/team\/(\d+)\//gi)) {
      if (match[1]) ids.add(match[1]);
    }
  }
  return [...ids];
}

function textTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return stripTags(match?.[1] ?? "");
}

function linkTag(block: string) {
  const atom = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1];
  return stripTags(atom ?? textTag(block, "link"));
}
