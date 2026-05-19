import { prisma } from "@/lib/prisma";
import { buildForecastAutopilotCandidate } from "@/lib/autoResearch/candidateSelector";
import { calculateMatchPriority, isDefaultProFocus, type MatchPriorityResult, type RankSnapshotLike } from "@/lib/proFocus";
import { emptyReadinessDistribution, type ReadinessDistribution } from "@/lib/data/readinessDistribution";
import type { MatchFocusFilter } from "@/lib/data/matches";
import type { ForecastabilityTier } from "@/lib/autoResearchShared";

export const FORECASTABILITY_CACHE_VERSION = "v1.1.1";

const tierLabels: Record<ForecastabilityTier, string> = {
  READY: "Готов к реальному прогнозу",
  NEARLY_READY: "Почти готов",
  BASIC_ONLY: "Только базовый прогноз",
  BLOCKED: "Заблокирован",
  NOT_ENOUGH_DATA: "Недостаточно данных"
};

type LightweightTeam = {
  id: string;
  name: string;
  slug: string;
  valveRank: number | null;
  hltvRank: number | null;
  topRankCategory: string;
  sourceConfidence: number;
  needsReview: boolean;
  isAcademyTeam: boolean;
  visibilityTier: string;
  teamPriority: number;
  rankSnapshots: RankSnapshotLike[];
};

export type LightweightMatchSummary = {
  id: string;
  eventName: string;
  eventTier: string;
  stage: string;
  startTime: string;
  status: string;
  format: string;
  isOfficial: boolean;
  isLan: boolean;
  sourceMode: string;
  needsReview: boolean;
  isPinned: boolean;
  updatedAt: string;
  teamA: LightweightTeam;
  teamB: LightweightTeam;
  priority: MatchPriorityResult;
  cachedCoverageScore: number | null;
  cachedForecastabilityTier: ForecastabilityTier | null;
  cachedForecastabilityLabel: string;
  cachedForecastabilityAt: string | null;
  cachedForecastabilityVersion: string | null;
};

export type LightweightMatchSummaryPage = {
  rows: LightweightMatchSummary[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
};

type SummaryOptions = {
  status?: string;
  limit?: number;
  page?: number;
  format?: string;
  top?: number;
  sourceMode?: string;
  focus?: MatchFocusFilter;
  sort?: string;
};

type SummaryMatchRow = {
  id: string;
  eventName: string;
  eventTier: string;
  stage: string;
  startTime: Date;
  status: string;
  format: string;
  isOfficial: boolean;
  isLan: boolean;
  sourceMode: string;
  needsReview: boolean;
  isPinned: boolean;
  updatedAt: Date;
  cachedCoverageScore: number | null;
  cachedForecastabilityTier: string | null;
  cachedForecastabilityAt: Date | null;
  cachedForecastabilityVersion: string | null;
  teamA: LightweightTeam;
  teamB: LightweightTeam;
};

export async function getLightweightMatchSummaries(options: SummaryOptions = {}): Promise<LightweightMatchSummaryPage> {
  const page = Math.max(1, Number(options.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(options.limit ?? 20)));
  const focus = options.focus ?? "pro";
  const showDemo = process.env.ENABLE_MOCK_DATA !== "false";
  const effectiveSourceMode =
    options.sourceMode ??
    (focus === "all_real" ? "real" : focus === "demo" ? "demo" : focus === "sample" ? "analyst_sample" : undefined);
  const sourceModeWhere =
    effectiveSourceMode && effectiveSourceMode !== "all"
      ? effectiveSourceMode === "real"
        ? { notIn: ["demo", "analyst_sample"] }
        : effectiveSourceMode
      : showDemo
        ? { not: "analyst_sample" }
        : { notIn: ["demo", "analyst_sample"] };

  const take = Math.max(limit * 6, 80);
  const rows = await prisma.match.findMany({
    where: {
      status: options.status,
      format: options.format,
      isOfficial: true,
      sourceMode: sourceModeWhere
    },
    select: {
      id: true,
      eventName: true,
      eventTier: true,
      stage: true,
      startTime: true,
      status: true,
      format: true,
      isOfficial: true,
      isLan: true,
      sourceMode: true,
      sourceConfidence: true,
      needsReview: true,
      isPinned: true,
      manualPriority: true,
      manualVisibility: true,
      updatedAt: true,
      cachedCoverageScore: true,
      cachedForecastabilityTier: true,
      cachedForecastabilityAt: true,
      cachedForecastabilityVersion: true,
      teamA: { select: teamSelect() },
      teamB: { select: teamSelect() }
    },
    orderBy: [{ startTime: options.status === "finished" ? "desc" : "asc" }],
    take: Math.max(take + page * limit, take)
  });

  const filtered = rows
    .map((row) => ({ row, priority: calculateMatchPriority(row) }))
    .filter(({ row }) => {
      if (!options.top) return true;
      const rankA = row.teamA.valveRank ?? row.teamA.hltvRank ?? 999;
      const rankB = row.teamB.valveRank ?? row.teamB.hltvRank ?? 999;
      return rankA <= options.top || rankB <= options.top;
    })
    .filter(({ row, priority }) => matchesFocus(row, priority, focus));

  const sorted = sortSummaries(filtered, options.sort, options.status);
  const total = sorted.length;
  const pageRows = sorted.slice((page - 1) * limit, page * limit).map(({ row, priority }) => toSummary(row, priority));
  return { rows: pageRows, total, page, limit, hasNextPage: page * limit < total };
}

export async function getCommandCenterSummary() {
  const [upcoming, live, finished, cached] = await Promise.all([
    prisma.match.count({ where: { status: "upcoming", isOfficial: true, sourceMode: { notIn: ["demo", "analyst_sample"] } } }),
    prisma.match.count({ where: { status: "live", isOfficial: true, sourceMode: { notIn: ["demo", "analyst_sample"] } } }),
    prisma.match.count({ where: { status: "finished", isOfficial: true, sourceMode: { notIn: ["demo", "analyst_sample"] } } }),
    prisma.match.groupBy({
      by: ["cachedForecastabilityTier"],
      where: { status: "upcoming", isOfficial: true, sourceMode: { notIn: ["demo", "analyst_sample"] } },
      _count: { _all: true }
    })
  ]);
  const byTier = Object.fromEntries(cached.map((row) => [row.cachedForecastabilityTier ?? "uncached", row._count._all]));
  return {
    upcoming,
    live,
    finished,
    cachedForecastability: byTier,
    ready: byTier.READY ?? 0,
    nearlyReady: byTier.NEARLY_READY ?? 0,
    basicOnly: byTier.BASIC_ONLY ?? 0,
    blocked: byTier.BLOCKED ?? 0,
    uncached: byTier.uncached ?? 0
  };
}

export async function getCachedReadinessDistribution(): Promise<ReadinessDistribution> {
  const distribution = emptyReadinessDistribution();
  const rows = await prisma.match.groupBy({
    by: ["cachedForecastabilityTier", "sourceMode"],
    where: { status: "upcoming", isOfficial: true, sourceMode: { not: "demo" } },
    _count: { _all: true }
  });
  for (const row of rows) {
    const count = row._count._all;
    const level = tierToReadiness(row.cachedForecastabilityTier);
    distribution.total[level] += count;
    distribution[level] += count;
    const actionable = row.cachedForecastabilityTier === "READY";
    if (actionable) {
      distribution.total.actionable += count;
      distribution.actionable += count;
    } else {
      distribution.total.nonActionable += count;
      distribution.nonActionable += count;
    }
    if (row.sourceMode === "analyst_sample") {
      distribution.sample[level] += count;
      distribution.sampleDataCount += count;
      if (actionable) distribution.sampleActionable += count;
    } else {
      distribution.real[level] += count;
      if (actionable) distribution.realActionable += count;
    }
  }
  return distribution;
}

export async function refreshForecastabilityCache(matchId: string) {
  const candidate = await buildForecastAutopilotCandidate(matchId);
  await prisma.match.update({
    where: { id: matchId },
    data: {
      cachedCoverageScore: candidate.coverageScore,
      cachedForecastabilityTier: candidate.forecastabilityTier,
      cachedForecastabilityAt: new Date(),
      cachedForecastabilityVersion: FORECASTABILITY_CACHE_VERSION
    }
  });
  return candidate;
}

export async function refreshForecastabilityCacheForUpcoming(limit = Number(process.env.FORECASTABILITY_TOP_N ?? 50)) {
  const rows = await prisma.match.findMany({
    where: { status: "upcoming", isOfficial: true, sourceMode: { notIn: ["demo", "analyst_sample"] } },
    select: { id: true },
    orderBy: { startTime: "asc" },
    take: Math.max(1, Math.min(200, limit))
  });
  const results = [];
  for (const row of rows) {
    try {
      results.push(await refreshForecastabilityCache(row.id));
    } catch {
      // Keep explicit refresh best-effort; the detail page remains the source of truth.
    }
  }
  return { refreshed: results.length, requested: rows.length };
}

function teamSelect() {
  return {
    id: true,
    name: true,
    slug: true,
    valveRank: true,
    hltvRank: true,
    topRankCategory: true,
    sourceConfidence: true,
    needsReview: true,
    isAcademyTeam: true,
    visibilityTier: true,
    teamPriority: true,
    rankSnapshots: { orderBy: { rankingDate: "desc" as const }, take: 3 }
  };
}

function matchesFocus(row: { sourceMode: string; needsReview: boolean; isPinned: boolean; teamA: LightweightTeam; teamB: LightweightTeam }, priority: MatchPriorityResult, focus: MatchFocusFilter) {
  const rankA = priority.teamAEffectiveRank ?? row.teamA.valveRank ?? row.teamA.hltvRank ?? 999;
  const rankB = priority.teamBEffectiveRank ?? row.teamB.valveRank ?? row.teamB.hltvRank ?? 999;
  if (focus === "all") return true;
  if (focus === "all_real") return row.sourceMode !== "demo" && row.sourceMode !== "analyst_sample";
  if (focus === "demo") return row.sourceMode === "demo";
  if (focus === "sample") return row.sourceMode === "analyst_sample";
  if (focus === "top50") return rankA <= 50 || rankB <= 50;
  if (focus === "top100") return rankA <= 100 || rankB <= 100;
  if (focus === "watchlist") return priority.hasWatchlistTeam;
  if (focus === "known") return priority.isKnownTournament;
  if (focus === "lower_tier") return priority.visibilityTier === "lower_tier" || priority.visibilityTier === "academy";
  if (focus === "separate_circuit") return priority.visibilityTier === "separate_circuit";
  if (focus === "needs_review") return row.needsReview || priority.visibilityTier === "needs_review";
  return isDefaultProFocus(priority, row.isPinned) && row.sourceMode !== "demo" && row.sourceMode !== "analyst_sample";
}

function sortSummaries<T extends { row: { isPinned: boolean; sourceMode: string; startTime: Date; cachedCoverageScore: number | null }; priority: MatchPriorityResult }>(rows: T[], sort?: string, status?: string) {
  return [...rows].sort((a, b) => {
    if (sort === "forecastable") {
      const coverage = (b.row.cachedCoverageScore ?? -1) - (a.row.cachedCoverageScore ?? -1);
      if (coverage !== 0) return coverage;
    }
    const pinDelta = Number(b.row.isPinned) - Number(a.row.isPinned);
    if (pinDelta !== 0) return pinDelta;
    const demoDelta = (a.row.sourceMode === "demo" ? 1 : 0) - (b.row.sourceMode === "demo" ? 1 : 0);
    if (demoDelta !== 0) return demoDelta;
    const sampleDelta = (a.row.sourceMode === "analyst_sample" ? 1 : 0) - (b.row.sourceMode === "analyst_sample" ? 1 : 0);
    if (sampleDelta !== 0) return sampleDelta;
    const scoreDelta = b.priority.priorityScore - a.priority.priorityScore;
    if (scoreDelta !== 0) return scoreDelta;
    const aTime = new Date(a.row.startTime).getTime();
    const bTime = new Date(b.row.startTime).getTime();
    return status === "finished" ? bTime - aTime : aTime - bTime;
  });
}

function toSummary(row: SummaryMatchRow, priority: MatchPriorityResult): LightweightMatchSummary {
  const tier = normalizeTier(row.cachedForecastabilityTier);
  return {
    id: row.id,
    eventName: row.eventName,
    eventTier: row.eventTier,
    stage: row.stage,
    startTime: row.startTime.toISOString(),
    status: row.status,
    format: row.format,
    isOfficial: row.isOfficial,
    isLan: row.isLan,
    sourceMode: row.sourceMode,
    needsReview: row.needsReview,
    isPinned: row.isPinned,
    updatedAt: row.updatedAt.toISOString(),
    teamA: row.teamA,
    teamB: row.teamB,
    priority,
    cachedCoverageScore: row.cachedCoverageScore,
    cachedForecastabilityTier: tier,
    cachedForecastabilityLabel: tier ? tierLabels[tier] : "Не рассчитано",
    cachedForecastabilityAt: row.cachedForecastabilityAt?.toISOString() ?? null,
    cachedForecastabilityVersion: row.cachedForecastabilityVersion
  };
}

function normalizeTier(value: string | null): ForecastabilityTier | null {
  if (value === "READY" || value === "NEARLY_READY" || value === "BASIC_ONLY" || value === "BLOCKED" || value === "NOT_ENOUGH_DATA") return value;
  return null;
}

function tierToReadiness(value: string | null) {
  if (value === "READY") return "L4_DEEP" as const;
  if (value === "NEARLY_READY") return "L3_ANALYTICAL" as const;
  if (value === "BASIC_ONLY") return "L2_BASIC_PREDICTION" as const;
  if (value === "BLOCKED") return "L1_BASIC_CONTEXT" as const;
  return "L0_FIXTURE_ONLY" as const;
}
