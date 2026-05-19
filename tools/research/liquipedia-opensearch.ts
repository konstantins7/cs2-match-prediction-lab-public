import { type FetchLike, type FetcherEnv } from "../data-fetchers/utils";
import { researchFetchText } from "./hltv-client";
import { getCachedIdentifier, setCachedIdentifier } from "./id-cache";

export async function resolveLiquipediaPage(options: {
  teamName: string;
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  now?: Date;
}) {
  const cached = await getCachedIdentifier("liquipediaPage", options.teamName, options.now ?? new Date());
  if (cached) return { page: cached, source: "cache", warnings: [] as string[] };
  const url = `https://liquipedia.net/counterstrike/api.php?action=opensearch&search=${encodeURIComponent(options.teamName)}&limit=1&namespace=0&format=json`;
  const response = await researchFetchText(url, {
    env: options.env,
    fetchImpl: options.fetchImpl,
    now: options.now,
    sourceFlag: "ENABLE_RESEARCH_SOURCES",
    allowedHosts: ["liquipedia.net"],
    allowedPathPatterns: [/^\/counterstrike\/api\.php$/],
    cacheNamespace: "liquipedia-opensearch",
    robotsCheck: true
  });
  if (response.status !== "success" && response.status !== "cached") return { page: "", source: response.status, warnings: response.warnings };
  try {
    const json = JSON.parse(response.body) as [string, string[]];
    const page = json[1]?.[0] ?? "";
    if (page) await setCachedIdentifier("liquipediaPage", options.teamName, page, "liquipedia-opensearch", options.now ?? new Date());
    return { page, source: page ? "liquipedia-opensearch" : "missing", warnings: response.warnings };
  } catch {
    return { page: "", source: "malformed", warnings: [...response.warnings, "Liquipedia opensearch returned malformed JSON."] };
  }
}
