import { prisma } from "@/lib/prisma";
import { buildPredictionInput, calculatePrediction } from "@/lib/predictionEngine";
import type { PredictionInput, PredictionOutput } from "@/lib/predictionEngine";
import { calculateMatchPriority, isDefaultProFocus, type MatchPriorityResult, type RankSnapshotLike } from "@/lib/proFocus";

export type MatchFocusFilter =
  | "pro"
  | "top50"
  | "top100"
  | "watchlist"
  | "known"
  | "all_real"
  | "demo"
  | "lower_tier"
  | "separate_circuit"
  | "sample"
  | "needs_review"
  | "all";

type MatchTeamRow = {
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

type MatchRow = {
  id: string;
  source: string;
  sourceMatchId: string | null;
  eventName: string;
  eventTier: string;
  stage: string;
  startTime: Date;
  status: string;
  format: string;
  isOfficial: boolean;
  isLan: boolean;
  teamAId: string;
  teamBId: string;
  winnerTeamId: string | null;
  matchUrl: string | null;
  dataQualityScore: number;
  sourceMode: string;
  sourceConfidence: number;
  needsReview: boolean;
  isPinned: boolean;
  manualPriority: number | null;
  manualVisibility: string | null;
  createdAt: Date;
  updatedAt: Date;
  teamA: MatchTeamRow;
  teamB: MatchTeamRow;
  audits?: Array<{ createdAt: Date }>;
};

export type CalculatedMatch = {
  match: MatchRow;
  input: PredictionInput;
  prediction: PredictionOutput;
  priority: MatchPriorityResult;
};

export async function getCalculatedMatches(options: {
  status?: string;
  limit?: number;
  format?: string;
  top?: number;
  highConfidence?: boolean;
  sourceMode?: string;
  focus?: MatchFocusFilter;
} = {}): Promise<CalculatedMatch[]> {
  const showDemo = process.env.ENABLE_MOCK_DATA !== "false";
  const focus = options.focus ?? "pro";
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
  const matches = await prisma.match.findMany({
    where: {
      status: options.status,
      format: options.format,
      isOfficial: true,
      sourceMode: sourceModeWhere
    },
    include: {
      teamA: {
        select: {
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
          rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 }
        }
      },
      teamB: {
        select: {
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
          rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 }
        }
      },
      audits: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 }
    },
    orderBy: [{ startTime: options.status === "finished" ? "desc" : "asc" }],
    take: options.limit ? Math.max(options.limit * 5, 80) : 160
  }) as MatchRow[];

  const ranked = matches.map((match) => ({
    match,
    priority: calculateMatchPriority(match)
  }));

  const filtered = ranked.filter(({ match }) => {
    if (!options.top) return true;
    const rankA = match.teamA.valveRank ?? match.teamA.hltvRank ?? 999;
    const rankB = match.teamB.valveRank ?? match.teamB.hltvRank ?? 999;
    return rankA <= options.top || rankB <= options.top;
  }).filter(({ match, priority }) => {
    const rankA = priority.teamAEffectiveRank ?? match.teamA.valveRank ?? match.teamA.hltvRank ?? 999;
    const rankB = priority.teamBEffectiveRank ?? match.teamB.valveRank ?? match.teamB.hltvRank ?? 999;
    if (focus === "all") return true;
    if (focus === "all_real") return match.sourceMode !== "demo" && match.sourceMode !== "analyst_sample";
    if (focus === "demo") return match.sourceMode === "demo";
    if (focus === "sample") return match.sourceMode === "analyst_sample";
    if (focus === "top50") return rankA <= 50 || rankB <= 50;
    if (focus === "top100") return rankA <= 100 || rankB <= 100;
    if (focus === "watchlist") return priority.hasWatchlistTeam;
    if (focus === "known") return priority.isKnownTournament;
    if (focus === "lower_tier") return priority.visibilityTier === "lower_tier" || priority.visibilityTier === "academy";
    if (focus === "separate_circuit") return priority.visibilityTier === "separate_circuit";
    if (focus === "needs_review") return match.needsReview || priority.visibilityTier === "needs_review";
    return isDefaultProFocus(priority, match.isPinned) && match.sourceMode !== "demo" && match.sourceMode !== "analyst_sample";
  });

  const prioritySorted = filtered.sort((a, b) => {
    const pinDelta = Number(b.match.isPinned) - Number(a.match.isPinned);
    if (pinDelta !== 0) return pinDelta;
    const demoDelta = (a.match.sourceMode === "demo" ? 1 : 0) - (b.match.sourceMode === "demo" ? 1 : 0);
    if (demoDelta !== 0) return demoDelta;
    const sampleDelta = (a.match.sourceMode === "analyst_sample" ? 1 : 0) - (b.match.sourceMode === "analyst_sample" ? 1 : 0);
    if (sampleDelta !== 0) return sampleDelta;
    const scoreDelta = b.priority.priorityScore - a.priority.priorityScore;
    if (scoreDelta !== 0) return scoreDelta;
    const aTime = new Date(a.match.startTime).getTime();
    const bTime = new Date(b.match.startTime).getTime();
    return options.status === "finished" ? bTime - aTime : aTime - bTime;
  }).slice(0, options.limit);

  const calculated = await Promise.all(
    prioritySorted.map(async ({ match, priority }) => {
      const input = await buildPredictionInput(match.id);
      return {
        match,
        input,
        priority,
        prediction: calculatePrediction(input)
      };
    })
  );

  if (options.highConfidence) {
    return calculated.filter((row) => row.prediction.confidenceScore >= 68);
  }
  return calculated;
}

export async function getCalculatedMatch(matchId: string) {
  const input = await buildPredictionInput(matchId);
  const prediction = calculatePrediction(input);
  const priority = calculateMatchPriority({ ...input.match, teamA: input.teamA, teamB: input.teamB });
  return { input, prediction, priority };
}
