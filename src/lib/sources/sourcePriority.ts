import type { SourceMode, SourceName } from "./types";

export type SourceDataType =
  | "fixture"
  | "ranking"
  | "roster"
  | "player_stats"
  | "map_stats"
  | "veto"
  | "h2h"
  | "news"
  | "round_economy"
  | "patch_meta";

export type DataTypeSourcePriority = {
  source: SourceName;
  sourceMode: SourceMode;
  label: string;
  reason: string;
};

export const sourcePriorityByDataType: Record<SourceDataType, DataTypeSourcePriority[]> = {
  fixture: [
    { source: "pandascore", sourceMode: "pandascore_free", label: "PandaScore Free Fixtures", reason: "schedule/matches/basic results" },
    { source: "manual", sourceMode: "manual_real", label: "Manual real", reason: "manual fallback/override" },
    { source: "mock", sourceMode: "demo", label: "Mock", reason: "dev fallback only" }
  ],
  ranking: [
    { source: "valve-rankings", sourceMode: "valve_rankings", label: "Valve Regional Standings", reason: "free official ranking/top-100 source" },
    { source: "manual", sourceMode: "manual_real", label: "Manual HLTV reference", reason: "manual CSV/JSON only, no scraping" },
    { source: "mock", sourceMode: "demo", label: "Mock", reason: "dev fallback only" }
  ],
  roster: [
    { source: "manual", sourceMode: "manual_real", label: "Manual real roster", reason: "confirmed user-entered roster" },
    { source: "liquipedia", sourceMode: "liquipedia_limited", label: "LiquipediaDB", reason: "rosters/roster changes when access exists" },
    { source: "pandascore", sourceMode: "pandascore_free", label: "PandaScore Free", reason: "basic team/player context when available" },
    { source: "valve-rankings", sourceMode: "valve_rankings", label: "Valve roster hint", reason: "hint only, not full confirmed roster" }
  ],
  player_stats: [
    { source: "grid", sourceMode: "grid_open_access", label: "GRID Open Access", reason: "detailed player telemetry when access exists" },
    { source: "parsed-demo", sourceMode: "parsed_demo", label: "Parsed demo JSON", reason: "round/player/map stats from imported parsed data" },
    { source: "manual", sourceMode: "manual_real", label: "Manual real", reason: "validated analyst-entered stats" },
    { source: "faceit", sourceMode: "faceit_optional", label: "FACEIT optional", reason: "optional competition/player stats if available" }
  ],
  map_stats: [
    { source: "grid", sourceMode: "grid_open_access", label: "GRID Open Access", reason: "official map/round telemetry when access exists" },
    { source: "parsed-demo", sourceMode: "parsed_demo", label: "Parsed demo JSON", reason: "map-level parsed stats" },
    { source: "manual", sourceMode: "manual_real", label: "Manual real", reason: "validated analyst-entered map stats" }
  ],
  veto: [
    { source: "manual", sourceMode: "manual_real", label: "Manual real", reason: "validated pick/ban history" },
    { source: "liquipedia", sourceMode: "liquipedia_limited", label: "LiquipediaDB", reason: "event context/veto history when available" },
    { source: "parsed-demo", sourceMode: "parsed_demo", label: "Parsed demo JSON", reason: "derived veto/map preference hints" }
  ],
  h2h: [
    { source: "manual", sourceMode: "manual_real", label: "Manual real", reason: "validated H2H context" },
    { source: "liquipedia", sourceMode: "liquipedia_limited", label: "LiquipediaDB", reason: "historical results when access exists" },
    { source: "pandascore", sourceMode: "pandascore_free", label: "PandaScore Free", reason: "basic finished match results" }
  ],
  news: [
    { source: "manual", sourceMode: "manual_reference", label: "Manual official/media/insider reference", reason: "HLTV/Telegram/manual references without scraping" },
    { source: "manual", sourceMode: "manual_real", label: "Manual real", reason: "analyst-entered roster/news events" },
    { source: "telegram-news", sourceMode: "manual_reference", label: "Telegram manual/API watchlist", reason: "disabled by default; no scraping/private channels" },
    { source: "liquipedia", sourceMode: "liquipedia_limited", label: "LiquipediaDB", reason: "roster changes/context when access exists" }
  ],
  round_economy: [
    { source: "grid", sourceMode: "grid_open_access", label: "GRID Open Access", reason: "round/economy/pistol telemetry when access exists" },
    { source: "parsed-demo", sourceMode: "parsed_demo", label: "Parsed demo JSON", reason: "round/economy proxies from parsed data" }
  ],
  patch_meta: [
    { source: "cs-updates", sourceMode: "steam_updates", label: "Steam / Counter-Strike updates", reason: "free official app 730 updates" },
    { source: "manual", sourceMode: "manual_real", label: "Manual official update import", reason: "fallback when Steam feed is partial" }
  ]
};

export function pickPreferredSourceForDataType(dataType: SourceDataType, availableModes: Iterable<string>) {
  const available = new Set(availableModes);
  return sourcePriorityByDataType[dataType].find((entry) => available.has(entry.sourceMode) || available.has(entry.source));
}

export function priorityIndexForSource(dataType: SourceDataType, sourceModeOrSource: string) {
  const index = sourcePriorityByDataType[dataType].findIndex(
    (entry) => entry.sourceMode === sourceModeOrSource || entry.source === sourceModeOrSource
  );
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}
