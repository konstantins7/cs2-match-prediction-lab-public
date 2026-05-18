import { fetchJson, makeReport, rowsFromPayload, textAt, type FetcherReport, type FetcherRunOptions } from "./utils";

const source = "steam-web-api";
const steamStatsUrl = "https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/";
const csAppId = "730";

export type SteamExplicitPlayer = {
  steamId: string;
  teamName?: string;
  nickname?: string;
};

export type SteamPlayerStats = {
  steamId: string;
  stats: Record<string, number>;
  achievements: Record<string, number>;
};

export type SteamFetcherOptions = FetcherRunOptions & {
  explicitPlayers?: SteamExplicitPlayer[];
};

export async function fetchSteamPlayerStats(options: {
  steamId: string;
  apiKey: string;
  fetchImpl?: SteamFetcherOptions["fetchImpl"];
}): Promise<SteamPlayerStats | null> {
  if (!options.steamId.trim() || !options.apiKey.trim()) return null;
  const url = new URL(steamStatsUrl);
  url.searchParams.set("appid", csAppId);
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("steamid", options.steamId);
  const payload = await fetchJson(url.toString(), { headers: { Accept: "application/json" } }, options.fetchImpl);
  const playerStats = (payload as Record<string, unknown>).playerstats ?? payload;
  const stats = Object.fromEntries(rowsFromPayload(playerStats, ["stats"]).map((row) => [textAt(row, ["name"]), numberValue(row)]).filter(([key]) => key));
  const achievements = Object.fromEntries(rowsFromPayload(playerStats, ["achievements"]).map((row) => [textAt(row, ["name", "apiname"]), numberValue(row)]).filter(([key]) => key));
  if (!Object.keys(stats).length && !Object.keys(achievements).length) return null;
  return { steamId: options.steamId, stats, achievements };
}

export async function runSteamFetcher(options: SteamFetcherOptions = {}): Promise<FetcherReport> {
  const env = options.env ?? process.env;
  if (!isEnabled(env.ENABLE_STEAM_SYNC)) {
    return makeReport(source, { status: "skipped", warnings: ["ENABLE_STEAM_SYNC=false. Steam supplemental stats skipped."] });
  }
  if (!env.STEAM_API_KEY) {
    return makeReport(source, { status: "skipped", warnings: ["STEAM_API_KEY is not configured."] });
  }
  if (!options.explicitPlayers?.length) {
    return makeReport(source, { status: "skipped", warnings: ["No explicit Steam IDs provided; Steam source remains supplemental only."] });
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  let fetchedPlayers = 0;
  for (const player of options.explicitPlayers) {
    try {
      const result = await fetchSteamPlayerStats({ steamId: player.steamId, apiKey: env.STEAM_API_KEY, fetchImpl: options.fetchImpl });
      if (result) fetchedPlayers += 1;
      else warnings.push(`Steam returned no useful supplemental stats for ${player.nickname ?? player.steamId}.`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Steam Web API request failed.");
    }
  }
  return makeReport(source, {
    status: errors.length ? (fetchedPlayers ? "partial" : "failed") : fetchedPlayers ? "partial" : "skipped",
    fetched: { supplementalPlayers: fetchedPlayers },
    writes: [],
    warnings: [
      ...warnings,
      "Steam Web API stats are supplemental context only and are not written as Real Forecast Ready evidence."
    ],
    errors
  });
}

function numberValue(row: unknown) {
  const raw = textAt(row, ["value"]);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}
