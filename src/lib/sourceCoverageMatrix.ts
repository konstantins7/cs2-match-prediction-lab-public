import type { PredictionInput } from "./predictionEngine";
import { sourcePriorityByDataType, type SourceDataType } from "./sources/sourcePriority";
import type { SourceStatus } from "./sources/types";

export type CoverageSource =
  | "PandaScore"
  | "Valve"
  | "Steam"
  | "manual_real"
  | "parsed_demo"
  | "Liquipedia"
  | "FACEIT"
  | "GRID";

export type CoverageCellStatus = "available" | "missing" | "partial" | "requires_key" | "future";

export type SourceCoverageCell = {
  source: CoverageSource;
  status: CoverageCellStatus;
  lastSync?: string | null;
  quality: number;
  usedInPrediction: boolean;
  note: string;
};

export type SourceCoverageRow = {
  dataType: SourceDataType;
  label: string;
  cells: SourceCoverageCell[];
};

const sources: CoverageSource[] = ["PandaScore", "Valve", "Steam", "manual_real", "parsed_demo", "Liquipedia", "FACEIT", "GRID"];

const sourceModeByCoverageSource: Record<CoverageSource, string[]> = {
  PandaScore: ["pandascore_free", "pandascore"],
  Valve: ["valve_rankings", "valve-rankings"],
  Steam: ["steam_updates", "cs-updates"],
  manual_real: ["manual_real", "manual_enrichment", "manual"],
  parsed_demo: ["parsed_demo", "parsed-demo"],
  Liquipedia: ["liquipedia_limited", "liquipedia"],
  FACEIT: ["faceit_optional", "faceit"],
  GRID: ["grid_open_access", "grid"]
};

const labels: Record<SourceDataType, string> = {
  fixture: "Базовые данные матча",
  ranking: "Рейтинг",
  roster: "Состав",
  player_stats: "Статистика игроков",
  map_stats: "Статистика карт",
  veto: "Veto",
  h2h: "H2H",
  news: "Новости",
  round_economy: "Раунды/экономика",
  patch_meta: "Патчи/meta"
};

function statusForSource(statuses: SourceStatus[] | undefined, source: CoverageSource) {
  const names = sourceModeByCoverageSource[source];
  return statuses?.find((status) => names.includes(status.source) || names.includes(status.source.replace("-", "_")));
}

function hasMode(value: string | undefined | null, source: CoverageSource) {
  if (!value) return false;
  return sourceModeByCoverageSource[source].includes(value);
}

function latestSync(status: SourceStatus | undefined) {
  return status?.lastSyncedAt ?? null;
}

function inputCoverage(input: PredictionInput | undefined, dataType: SourceDataType, source: CoverageSource) {
  if (!input) return { available: false, used: false, quality: 0, note: "No match input selected." };
  if (dataType === "fixture") {
    const used = source === "PandaScore" && input.match.sourceMode === "pandascore_free";
    return {
      available: used || hasMode(input.match.sourceMode, source),
      used,
      quality: input.match.sourceConfidence ?? 0.5,
      note: used ? "Fixture is used from PandaScore Free." : "Fixture not sourced here."
    };
  }
  if (dataType === "ranking") {
    const ranks = [...(input.teamA.rankSnapshots ?? []), ...(input.teamB.rankSnapshots ?? [])];
    const available = source === "Valve"
      ? ranks.some((rank) => rank.source === "valve_rankings") || Boolean(input.teamA.valveRank || input.teamB.valveRank)
      : source === "manual_real"
        ? ranks.some((rank) => rank.source === "hltv_manual_reference")
        : false;
    return { available, used: available, quality: available ? 0.72 : 0, note: available ? "Ranking contributes to prediction context." : "Ranking missing." };
  }
  if (dataType === "roster") {
    const players = [...input.playersA, ...input.playersB];
    const available = players.some((player) => hasMode(player.sourceMode, source));
    return { available, used: available && source !== "Valve", quality: available ? 0.62 : 0, note: source === "Valve" ? "Valve roster is only a hint." : available ? "Roster data present." : "Roster missing." };
  }
  if (dataType === "player_stats") {
    const stats = [...input.playerStatsA, ...input.playerStatsB];
    const available = stats.some((stat) => hasMode(stat.source, source));
    return { available, used: available, quality: available ? 0.7 : 0, note: available ? "Player stat rows available." : "Player stats missing." };
  }
  if (dataType === "map_stats") {
    const stats = [...input.mapStatsA, ...input.mapStatsB];
    const available = stats.some((stat) => hasMode(stat.source, source));
    return { available, used: available, quality: available ? 0.7 : 0, note: available ? "Map stats available." : "Map stats missing." };
  }
  if (dataType === "veto") {
    const stats = [...input.vetoPatternsA, ...input.vetoPatternsB];
    const available = stats.some((stat) => hasMode(stat.source, source));
    return { available, used: available, quality: available ? 0.65 : 0, note: available ? "Veto patterns available." : "Veto missing." };
  }
  if (dataType === "h2h") {
    const available = input.h2h.some((item) => hasMode(item.source, source));
    return { available, used: available, quality: available ? 0.6 : 0, note: available ? "H2H rows available." : "H2H missing." };
  }
  if (dataType === "news") {
    const available = input.news.some((item) => hasMode(item.source, source));
    return { available, used: available, quality: available ? 0.6 : 0, note: available ? "News/roster events available." : "News missing." };
  }
  if (dataType === "patch_meta") {
    const available = source === "Steam" && input.gameMetaVersions.length > 0;
    return { available, used: available, quality: available ? 0.58 : 0, note: available ? "Steam/CS Updates meta available." : "Patch/meta missing." };
  }
  const available = source === "GRID" || source === "parsed_demo";
  return { available: false, used: false, quality: 0, note: available ? "Future/deep data source." : "Not applicable." };
}

function fallbackCell(source: CoverageSource, sourceStatus: SourceStatus | undefined, dataType: SourceDataType): SourceCoverageCell {
  const priority = sourcePriorityByDataType[dataType].some((entry) => sourceModeByCoverageSource[source].includes(entry.sourceMode) || sourceModeByCoverageSource[source].includes(entry.source));
  if (source === "GRID") return { source, status: "future", lastSync: latestSync(sourceStatus), quality: 0, usedInPrediction: false, note: "Requires GRID access; expected source for detailed telemetry." };
  if (source === "Liquipedia" && !sourceStatus?.enabled) return { source, status: "requires_key", lastSync: latestSync(sourceStatus), quality: 0, usedInPrediction: false, note: "LiquipediaDB requires access; MediaWiki API is limited and rate-limited." };
  if (source === "FACEIT" && !sourceStatus?.enabled) return { source, status: "requires_key", lastSync: latestSync(sourceStatus), quality: 0, usedInPrediction: false, note: "Optional FACEIT API source." };
  return { source, status: priority ? "partial" : "missing", lastSync: latestSync(sourceStatus), quality: 0, usedInPrediction: false, note: priority ? "Potential source for this data type." : "Not priority source." };
}

export function buildSourceCoverageMatrix(input?: PredictionInput, statuses?: SourceStatus[]): SourceCoverageRow[] {
  return (Object.keys(sourcePriorityByDataType) as SourceDataType[]).map((dataType) => ({
    dataType,
    label: labels[dataType],
    cells: sources.map((source) => {
      const sourceStatus = statusForSource(statuses, source);
      const coverage = inputCoverage(input, dataType, source);
      if (coverage.available) {
        return {
          source,
          status: coverage.used ? "available" : "partial",
          lastSync: latestSync(sourceStatus),
          quality: coverage.quality,
          usedInPrediction: coverage.used,
          note: coverage.note
        };
      }
      return fallbackCell(source, sourceStatus, dataType);
    })
  }));
}
