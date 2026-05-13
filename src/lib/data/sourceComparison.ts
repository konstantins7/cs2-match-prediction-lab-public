import { qualityFromRawRecord, type ManualPackBlock } from "../manualRealQuality";
import type { PredictionInput } from "../prediction/types";

export type DataSourceRow = {
  group: string;
  source: string;
  sourceMode: string;
  dataType: string;
  status: "missing" | "used" | "ignored";
  freshness: string;
  confidence: number;
  sampleSize: number | null;
  usedInPrediction: boolean;
  reasonIfNotUsed: string;
};

function latestDate(values: Array<Date | string | undefined | null>) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value as Date | string))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
}

function itemSource(item: { source?: string; sourceMode?: string }) {
  return item.source ?? item.sourceMode;
}

function manualRows(input: PredictionInput, source: "manual_enrichment" | "analyst_sample", sourceMode: "manual_real" | "analyst_sample") {
  const records = input.manualSourceRecords ?? [];
  const used = source === "manual_enrichment";
  const rows: DataSourceRow[] = [];
  const blocks: Array<{ group: string; block: ManualPackBlock; dataType: string; count: number; sampleSize: number | null; createdAt?: Date | string | null }> = [
    { group: "Roster source", block: "roster", dataType: "roster", count: [...input.playersA, ...input.playersB].filter((item) => item.sourceMode === sourceMode).length, sampleSize: null, createdAt: latestDate([...input.playersA, ...input.playersB].filter((item) => item.sourceMode === sourceMode).map((item) => item.joinedAt)) },
    { group: "Player stats source", block: "player_stats", dataType: "player stats", count: [...input.playerStatsA, ...input.playerStatsB].filter((item) => item.source === source).length, sampleSize: [...input.playerStatsA, ...input.playerStatsB].filter((item) => item.source === source).reduce((sum, item) => sum + item.maps, 0), createdAt: latestDate([...input.playerStatsA, ...input.playerStatsB].filter((item) => item.source === source).map((item) => item.createdAt)) },
    { group: "Map stats source", block: "map_stats", dataType: "map stats", count: [...input.mapStatsA, ...input.mapStatsB].filter((item) => item.source === source).length, sampleSize: [...input.mapStatsA, ...input.mapStatsB].filter((item) => item.source === source).reduce((sum, item) => sum + item.mapsPlayed, 0), createdAt: latestDate([...input.mapStatsA, ...input.mapStatsB].filter((item) => item.source === source).map((item) => item.createdAt)) },
    { group: "Veto source", block: "veto_history", dataType: "veto history", count: [...input.vetoPatternsA, ...input.vetoPatternsB].filter((item) => item.source === source).length, sampleSize: [...input.vetoPatternsA, ...input.vetoPatternsB].filter((item) => item.source === source).length, createdAt: null },
    { group: "H2H source", block: "h2h", dataType: "H2H", count: input.h2h.filter((item) => item.source === source).length, sampleSize: input.h2h.filter((item) => item.source === source).length, createdAt: latestDate(input.h2h.filter((item) => item.source === source).map((item) => item.date)) },
    { group: "News source", block: "news", dataType: "news / roster events", count: input.news.filter((item) => item.source === source).length, sampleSize: input.news.filter((item) => item.source === source).length, createdAt: latestDate(input.news.filter((item) => item.source === source).map((item) => item.publishedAt)) }
  ];
  for (const block of blocks) {
    if (block.count === 0) continue;
    const sourceRecordId = [
      ...input.playersA.filter((item) => item.sourceMode === sourceMode),
      ...input.playersB.filter((item) => item.sourceMode === sourceMode),
      ...input.playerStatsA,
      ...input.playerStatsB,
      ...input.mapStatsA,
      ...input.mapStatsB,
      ...input.vetoPatternsA,
      ...input.vetoPatternsB,
      ...input.h2h,
      ...input.news
    ].find((item) => itemSource(item) === source || itemSource(item) === sourceMode)?.sourceRecordId;
    const quality = qualityFromRawRecord(records.find((record) => record.id === sourceRecordId), block.block);
    rows.push({
      group: source === "manual_enrichment" ? block.group : "Sample/dev source",
      source: source === "manual_enrichment" ? "manual_real" : "analyst_sample",
      sourceMode,
      dataType: block.dataType,
      status: used ? "used" : "ignored",
      freshness: quality.freshness === "unknown" && block.createdAt ? "record-created" : quality.freshness,
      confidence: quality.sourceConfidence,
      sampleSize: block.sampleSize,
      usedInPrediction: used,
      reasonIfNotUsed: used ? "" : "Sample data is excluded from real prediction when manual_real exists."
    });
  }
  return rows;
}

export function buildDataSourceRows(input: PredictionInput): DataSourceRow[] {
  const rows: DataSourceRow[] = [
    {
      group: "Fixture source",
      source: input.match.source ?? "match",
      sourceMode: input.match.sourceMode ?? "unknown",
      dataType: "fixture",
      status: "used",
      freshness: input.dataCoverage?.lastSourceSyncAt ? "synced" : "unknown",
      confidence: input.match.sourceConfidence ?? 0.5,
      sampleSize: 1,
      usedInPrediction: true,
      reasonIfNotUsed: ""
    }
  ];
  if (input.dataCoverage?.rankData) {
    rows.push({
      group: "Ranking source",
      source: "Valve/manual rank",
      sourceMode: "valve_rankings",
      dataType: "team rank",
      status: "used",
      freshness: "ranking snapshot",
      confidence: Math.max(input.teamA.rankSnapshots?.[0]?.confidence ?? 0, input.teamB.rankSnapshots?.[0]?.confidence ?? 0, 0.5),
      sampleSize: null,
      usedInPrediction: true,
      reasonIfNotUsed: ""
    });
  }
  rows.push(...manualRows(input, "manual_enrichment", "manual_real"));
  rows.push(...manualRows(input, "analyst_sample", "analyst_sample"));
  const sampleRawOnly = (input.manualSourceRecords ?? []).filter((record) => record.entityType.startsWith("analyst_sample_"));
  if (sampleRawOnly.length > 0 && !rows.some((row) => row.sourceMode === "analyst_sample")) {
    rows.push({
      group: "Sample/dev source",
      source: "analyst_sample",
      sourceMode: "analyst_sample",
      dataType: "sample analyst pack",
      status: "ignored",
      freshness: "raw saved",
      confidence: Math.max(...sampleRawOnly.map((record) => record.sourceConfidence)),
      sampleSize: sampleRawOnly.length,
      usedInPrediction: false,
      reasonIfNotUsed: "Sample data is visible for pipeline validation only and excluded from real prediction."
    });
  }
  const requiredGroups = [
    ["Ranking source", "team rank"],
    ["Roster source", "roster"],
    ["Player stats source", "player stats"],
    ["Map stats source", "map stats"],
    ["Veto source", "veto history"],
    ["H2H source", "H2H"],
    ["News source", "news / roster events"],
    ["Sample/dev source", "sample/dev data"]
  ];
  for (const [group, dataType] of requiredGroups) {
    if (rows.some((row) => row.group === group)) continue;
    rows.push({
      group,
      source: "missing",
      sourceMode: "partial",
      dataType,
      status: "missing",
      freshness: "missing",
      confidence: 0,
      sampleSize: null,
      usedInPrediction: false,
      reasonIfNotUsed: group === "Sample/dev source" ? "No sample/dev source for this match." : "No validated source records for this data type."
    });
  }
  return rows;
}
