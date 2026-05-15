export type ManualPackBlock =
  | "ranking"
  | "roster"
  | "player_stats"
  | "map_stats"
  | "veto_history"
  | "h2h"
  | "news";

export type ManualPackStatus = "missing" | "partial" | "valid" | "applied" | "needs_review" | "invalid";

export type ManualQualityMetadata = {
  sourceName?: string;
  sourceUrl?: string;
  collectedAt?: string;
  period?: string;
  sampleSize?: number;
  confidence?: number;
  notes?: string;
};

export type ManualBlockQuality = {
  block: ManualPackBlock;
  score: number;
  status: ManualPackStatus;
  sourceConfidence: number;
  freshness: "fresh" | "aging" | "stale" | "expired" | "unknown";
  reasons: string[];
  warnings: string[];
};

export type ManualRealPackQuality = {
  score: number;
  label: "insufficient" | "partial" | "analytical" | "strong";
  canReachL3: boolean;
  blockQualities: ManualBlockQuality[];
  coverage: {
    rosterComplete: boolean;
    playerStatsComplete: boolean;
    mapStatsComplete: boolean;
    vetoComplete: boolean;
    h2hPresent: boolean;
    newsChecked: boolean;
  };
  reasons: string[];
  warnings: string[];
};

export const manualPackUnlocks: Record<ManualPackBlock, string> = {
  ranking: "ranking confirmation + basic results -> может поднять до L2",
  roster: "roster -> открывает путь к L2/L3, сам по себе не даёт L3",
  player_stats: "roster + player stats -> L2 strong / L3 weak без map stats",
  map_stats: "roster + player stats + map stats -> L3 partial",
  veto_history: "roster + player stats + map stats + veto -> L3 full",
  h2h: "H2H добавляет matchup context, но не заменяет roster/map/veto",
  news: "news/roster events улучшают risk/confidence explanation"
};

export function qualityMetadataFromRecord(value: unknown): ManualQualityMetadata {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata as Record<string, unknown> : record;
  const sampleSize = Number(metadata.sampleSize);
  const confidence = Number(metadata.confidence);
  return {
    sourceName: typeof metadata.sourceName === "string" ? metadata.sourceName : undefined,
    sourceUrl: typeof metadata.sourceUrl === "string" ? metadata.sourceUrl : undefined,
    collectedAt: typeof metadata.collectedAt === "string" ? metadata.collectedAt : undefined,
    period: typeof metadata.period === "string" ? metadata.period : typeof record.period === "string" ? record.period : undefined,
    sampleSize: Number.isFinite(sampleSize) ? sampleSize : undefined,
    confidence: Number.isFinite(confidence) ? confidence : undefined,
    notes: typeof metadata.notes === "string" ? metadata.notes : undefined
  };
}

export function freshnessFromCollectedAt(collectedAt?: string, now = new Date()) {
  if (!collectedAt) return "unknown" as const;
  const collected = new Date(collectedAt);
  if (!Number.isFinite(collected.getTime())) return "unknown" as const;
  const ageDays = (now.getTime() - collected.getTime()) / 86_400_000;
  if (ageDays <= 30) return "fresh" as const;
  if (ageDays <= 60) return "aging" as const;
  if (ageDays <= 90) return "stale" as const;
  return "expired" as const;
}

export function calculateManualBlockQuality(block: ManualPackBlock, metadata: ManualQualityMetadata, valuesValid = true): ManualBlockQuality {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (metadata.sourceName) score += 0.14;
  else reasons.push("sourceName missing");
  if (metadata.collectedAt) score += 0.14;
  else reasons.push("collectedAt missing");
  if (metadata.period) score += 0.12;
  else reasons.push("period missing");
  if ((metadata.sampleSize ?? 0) > 0) score += 0.18;
  else warnings.push("sampleSize missing or zero: accepted as partial only");
  if ((metadata.confidence ?? 0) > 0.5) score += 0.2;
  else warnings.push("confidence <= 0.5: block cannot unlock analytical readiness");
  if (metadata.sourceUrl) score += 0.06;
  else warnings.push("sourceUrl missing: source confidence reduced");
  if (valuesValid) score += 0.16;
  else reasons.push("values invalid");

  const freshness = freshnessFromCollectedAt(metadata.collectedAt);
  if (freshness === "aging") warnings.push("manual_real data older than 30 days: DQ reduced");
  if (freshness === "stale") warnings.push("manual_real data older than 60 days: stale warning");
  if (freshness === "expired") warnings.push("manual_real data older than 90 days: readiness capped at L2");
  if (freshness === "stale") score -= 0.12;
  if (freshness === "expired") score -= 0.24;

  const bounded = Math.max(0, Math.min(1, score));
  const lowConfidence = (metadata.confidence ?? 0) <= 0.5;
  const status: ManualPackStatus = !valuesValid
    ? "invalid"
    : lowConfidence && bounded >= 0.35
      ? "partial"
    : bounded >= 0.68
      ? "valid"
      : bounded >= 0.35
        ? "partial"
        : "needs_review";

  return {
    block,
    score: Number(bounded.toFixed(3)),
    status,
    sourceConfidence: Math.max(0.15, Math.min(0.92, metadata.confidence ?? bounded)),
    freshness,
    reasons,
    warnings
  };
}

export function parseManualRawJson(rawJson?: string | null) {
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function qualityFromRawRecord(record: { rawJson?: string | null; sourceConfidence?: number } | undefined, block: ManualPackBlock) {
  const raw = parseManualRawJson(record?.rawJson);
  if (!raw) return calculateManualBlockQuality(block, {}, false);
  const metadata = qualityMetadataFromRecord(raw);
  const quality = calculateManualBlockQuality(block, metadata, true);
  return {
    ...quality,
    sourceConfidence: Math.min(quality.sourceConfidence, record?.sourceConfidence ?? quality.sourceConfidence)
  };
}

export function manualQualityAllowsReadiness(quality: ManualBlockQuality) {
  return quality.status === "valid" && quality.sourceConfidence > 0.5 && quality.freshness !== "expired";
}

export function calculateManualRealPackQuality(params: {
  roster: ManualBlockQuality;
  playerStats: ManualBlockQuality;
  mapStats: ManualBlockQuality;
  veto: ManualBlockQuality;
  h2h?: ManualBlockQuality;
  news?: ManualBlockQuality;
  rosterComplete: boolean;
  playerStatsComplete: boolean;
  mapStatsComplete: boolean;
  vetoComplete: boolean;
  h2hPresent?: boolean;
  newsChecked?: boolean;
}): ManualRealPackQuality {
  const blockQualities = [params.roster, params.playerStats, params.mapStats, params.veto, params.h2h, params.news].filter(Boolean) as ManualBlockQuality[];
  const reasons: string[] = [];
  const warnings = blockQualities.flatMap((quality) => quality.warnings.map((warning) => `${quality.block}: ${warning}`));
  const valid = (quality: ManualBlockQuality | undefined) => Boolean(quality && manualQualityAllowsReadiness(quality));
  const weighted =
    (params.rosterComplete && valid(params.roster) ? 18 * params.roster.score : params.rosterComplete ? 8 * params.roster.score : 0) +
    (params.playerStatsComplete && valid(params.playerStats) ? 22 * params.playerStats.score : params.playerStatsComplete ? 8 * params.playerStats.score : 0) +
    (params.mapStatsComplete && valid(params.mapStats) ? 22 * params.mapStats.score : params.mapStatsComplete ? 8 * params.mapStats.score : 0) +
    (params.vetoComplete && valid(params.veto) ? 18 * params.veto.score : params.vetoComplete ? 6 * params.veto.score : 0) +
    (params.h2hPresent && valid(params.h2h) ? 6 * (params.h2h?.score ?? 0) : params.h2hPresent ? 2 * (params.h2h?.score ?? 0) : 0) +
    (params.newsChecked && valid(params.news) ? 4 * (params.news?.score ?? 0) : params.newsChecked ? 1 * (params.news?.score ?? 0) : 0) +
    (blockQualities.length ? 10 * (blockQualities.reduce((sum, quality) => sum + quality.sourceConfidence, 0) / blockQualities.length) : 0);

  const score = Math.round(Math.max(0, Math.min(100, weighted)));
  if (!params.rosterComplete) reasons.push("manual_real roster coverage missing or incomplete.");
  if (!params.playerStatsComplete) reasons.push("manual_real player stats coverage missing.");
  if (!params.mapStatsComplete) reasons.push("manual_real map stats coverage missing.");
  if (!params.vetoComplete) reasons.push("manual_real veto coverage missing.");
  if (!valid(params.roster) && params.rosterComplete) reasons.push("roster source trust is not strong enough for analytical readiness.");
  if (!valid(params.playerStats) && params.playerStatsComplete) reasons.push("player stats source trust is not strong enough for analytical readiness.");
  if (!valid(params.mapStats) && params.mapStatsComplete) reasons.push("map stats source trust is not strong enough for analytical readiness.");
  if (!valid(params.veto) && params.vetoComplete) reasons.push("veto source trust is not strong enough for analytical readiness.");

  const label =
    score >= 80 ? "strong" :
    score >= 65 ? "analytical" :
    score >= 40 ? "partial" :
    "insufficient";

  return {
    score,
    label,
    canReachL3: score >= 65 && params.rosterComplete && params.playerStatsComplete && params.mapStatsComplete && params.vetoComplete && valid(params.roster) && valid(params.playerStats) && valid(params.mapStats) && valid(params.veto),
    blockQualities,
    coverage: {
      rosterComplete: params.rosterComplete,
      playerStatsComplete: params.playerStatsComplete,
      mapStatsComplete: params.mapStatsComplete,
      vetoComplete: params.vetoComplete,
      h2hPresent: Boolean(params.h2hPresent),
      newsChecked: Boolean(params.newsChecked)
    },
    reasons: [...new Set(reasons)],
    warnings: [...new Set(warnings)]
  };
}

function walk(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(walk);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(walk);
  return [value];
}

function collectArrays(value: unknown): unknown[][] {
  if (Array.isArray(value)) return [value, ...value.flatMap(collectArrays)];
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(collectArrays);
  return [];
}

export function detectManualRealPlaceholderPayload(payload: Record<string, unknown>) {
  const reasons: string[] = [];
  const values = walk(payload);
  const strings = values.filter((value): value is string => typeof value === "string");
  const lowerStrings = strings.map((value) => value.toLowerCase().trim());
  const placeholders = ["player1", "player2", "player3", "team name", "example", "placeholder"];
  for (const placeholder of placeholders) {
    if (lowerStrings.some((value) => value === placeholder || value.includes(placeholder))) {
      reasons.push(`placeholder value detected: ${placeholder}`);
    }
  }

  const metadata = qualityMetadataFromRecord(payload);
  if (!metadata.sourceName) reasons.push("sourceName is empty.");
  if (!Number.isFinite(Number(metadata.confidence))) reasons.push("confidence is missing.");
  if ((metadata.sampleSize ?? 0) <= 0) reasons.push("sampleSize is zero or missing.");

  const type = typeof payload.type === "string" ? payload.type : "";
  const arrays = collectArrays(payload);
  if (type === "manual_real_pack") {
    const rosters = payload.rosters && typeof payload.rosters === "object" ? payload.rosters as Record<string, unknown> : {};
    const rosterArrays = Object.values(rosters).filter(Array.isArray);
    const requiredArrays = [payload.playerStats, payload.mapStats, payload.vetoHistory].filter(Array.isArray) as unknown[][];
    if (!Object.keys(rosters).length || rosterArrays.some((items) => items.length === 0) || requiredArrays.some((items) => items.length === 0)) {
      reasons.push("required manual_real_pack blocks are empty template/default data.");
    }
  } else if (["roster", "player_stats", "map_stats", "veto_history", "h2h", "news"].includes(type) && arrays.some((items) => items.length === 0)) {
    reasons.push("empty arrays are still template/default data.");
  }

  const numericValues = values.filter((value) => typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))).map(Number);
  if (numericValues.length >= 4 && numericValues.every((value) => value === 0)) {
    reasons.push("all numeric values are zero.");
  }

  return {
    isPlaceholder: reasons.length > 0,
    reasons: [...new Set(reasons)]
  };
}
