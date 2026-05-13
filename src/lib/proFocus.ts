import { KNOWN_TOURNAMENTS } from "./config/knownTournaments";
import { LOWER_TIER_PATTERNS, SEPARATE_CIRCUIT_PATTERNS } from "./config/lowerTierPatterns";
import { PRO_TEAM_WATCHLIST } from "./config/proTeamWatchlist";

export type VisibilityTier =
  | "pro_focus"
  | "top_50"
  | "top_100"
  | "notable"
  | "lower_tier"
  | "academy"
  | "separate_circuit"
  | "hidden"
  | "needs_review";

export type PriorityLabel = "must_watch" | "high" | "medium" | "low" | "hidden";

export type RankSnapshotLike = {
  source: string;
  rank: number;
  points?: number | null;
  region?: string | null;
  rankingDate: Date | string;
  rankCategory: string;
  confidence: number;
};

export type TeamPriorityLike = {
  id: string;
  name: string;
  valveRank?: number | null;
  hltvRank?: number | null;
  topRankCategory?: string | null;
  sourceConfidence?: number | null;
  needsReview?: boolean | null;
  isAcademyTeam?: boolean | null;
  teamPriority?: number | null;
  visibilityTier?: string | null;
  rankSnapshots?: RankSnapshotLike[];
};

export type MatchPriorityLike = {
  id?: string;
  eventName: string;
  eventTier?: string | null;
  stage?: string | null;
  format?: string | null;
  isLan?: boolean | null;
  sourceMode?: string | null;
  sourceConfidence?: number | null;
  needsReview?: boolean | null;
  startTime?: Date | string | null;
  isPinned?: boolean | null;
  manualPriority?: number | null;
  manualVisibility?: string | null;
  teamA: TeamPriorityLike;
  teamB: TeamPriorityLike;
};

export type MatchPriorityResult = {
  priorityScore: number;
  priorityLabel: PriorityLabel;
  visibilityTier: VisibilityTier;
  reasons: string[];
  hiddenReasons: string[];
  teamAEffectiveRank: number | null;
  teamBEffectiveRank: number | null;
  hasWatchlistTeam: boolean;
  isKnownTournament: boolean;
  hasStaleRanking: boolean;
  tournamentTier: string;
};

const referenceNow = new Date("2026-05-12T08:00:00.000Z");

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasPattern(value: string, patterns: string[]) {
  const normalized = normalize(value);
  return patterns.some((pattern) => {
    const normalizedPattern = normalize(pattern);
    return new RegExp(`(^| )${normalizedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(normalized);
  });
}

export function classifyTeamVisibility(teamName: string): VisibilityTier {
  if (hasPattern(teamName, SEPARATE_CIRCUIT_PATTERNS)) return "separate_circuit";
  if (hasPattern(teamName, ["Academy"])) return "academy";
  if (hasPattern(teamName, LOWER_TIER_PATTERNS)) return "lower_tier";
  return "notable";
}

export function isWatchlistTeam(teamName: string) {
  const normalized = normalize(teamName);
  return PRO_TEAM_WATCHLIST.some((item) => {
    const target = normalize(item);
    return normalized === target || normalized.includes(target) || target.includes(normalized);
  });
}

export function classifyTournament(name: string, teamsAreRanked = false) {
  const lowerTier = hasPattern(name, LOWER_TIER_PATTERNS);
  const separateCircuit = hasPattern(name, SEPARATE_CIRCUIT_PATTERNS);
  const match = KNOWN_TOURNAMENTS.find((rule) => normalize(name).includes(normalize(rule.pattern)));
  const conditionalActive = Boolean(match?.conditional && teamsAreRanked);
  const tier = lowerTier ? "qualifier" : separateCircuit ? "separate_circuit" : match ? (match.conditional && !conditionalActive ? "B" : match.tier) : "unknown";
  return {
    tier,
    importanceScore: lowerTier || separateCircuit ? 12 : match ? (match.conditional && !conditionalActive ? Math.min(match.importanceScore, 35) : match.importanceScore) : 18,
    isKnownTournament: Boolean(match),
    isConditional: Boolean(match?.conditional),
    isQualifier: lowerTier,
    isAcademy: hasPattern(name, ["Academy", "Junior", "Youth"]),
    isRegional: hasPattern(name, ["Regional", "ESEA", "Challenger League"]),
    isSeparateCircuit: separateCircuit
  };
}

function daysOld(date: Date | string, now = referenceNow) {
  const value = new Date(date).getTime();
  if (!Number.isFinite(value)) return 999;
  return Math.max(0, Math.floor((now.getTime() - value) / 86_400_000));
}

function categoryFromRank(rank: number | null) {
  if (!rank) return "unranked";
  if (rank <= 10) return "top_10";
  if (rank <= 20) return "top_20";
  if (rank <= 30) return "top_30";
  if (rank <= 50) return "top_50";
  if (rank <= 100) return "top_100";
  return "unranked";
}

export function getEffectiveRank(team: TeamPriorityLike, now = referenceNow) {
  const snapshots = [...(team.rankSnapshots ?? [])].sort((a, b) => new Date(b.rankingDate).getTime() - new Date(a.rankingDate).getTime());
  const manual = snapshots.find((snapshot) => snapshot.source === "hltv_manual_reference");
  const valve = snapshots.find((snapshot) => snapshot.source === "valve_rankings");
  const selected = manual ?? valve;
  const rank = selected?.rank ?? team.hltvRank ?? team.valveRank ?? null;
  const rankingDate = selected?.rankingDate;
  const ageDays = rankingDate ? daysOld(rankingDate, now) : null;
  const stale = ageDays !== null && ageDays > 60;
  const confidencePenalty = ageDays !== null && ageDays > 60 ? 0.35 : ageDays !== null && ageDays > 30 ? 0.18 : 0;
  const confidence = Math.max(0.15, (selected?.confidence ?? team.sourceConfidence ?? 0.5) - confidencePenalty);
  return {
    rank,
    source: selected?.source ?? (team.hltvRank ? "hltv_manual_reference" : team.valveRank ? "valve_rankings" : "unknown"),
    rankCategory: selected?.rankCategory ?? categoryFromRank(rank),
    confidence,
    ageDays,
    stale
  };
}

function labelFromScore(score: number): PriorityLabel {
  if (score >= 100) return "must_watch";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  if (score >= 15) return "low";
  return "hidden";
}

export function calculateMatchPriority(match: MatchPriorityLike, now = referenceNow): MatchPriorityResult {
  const reasons: string[] = [];
  const hiddenReasons: string[] = [];
  let score = 0;
  const teamAClass = classifyTeamVisibility(match.teamA.name);
  const teamBClass = classifyTeamVisibility(match.teamB.name);
  const teamALower = teamAClass === "academy" || teamAClass === "lower_tier" || match.teamA.isAcademyTeam;
  const teamBLower = teamBClass === "academy" || teamBClass === "lower_tier" || match.teamB.isAcademyTeam;
  const separateCircuit = teamAClass === "separate_circuit" || teamBClass === "separate_circuit";
  const rankA = getEffectiveRank(match.teamA, now);
  const rankB = getEffectiveRank(match.teamB, now);
  const rankValues = [rankA.rank ?? 999, rankB.rank ?? 999];
  const bestRank = Math.min(...rankValues);
  const bothTop20 = rankValues.every((rank) => rank <= 20);
  const bothTop50 = rankValues.every((rank) => rank <= 50);
  const oneTop50 = rankValues.some((rank) => rank <= 50);
  const bothTop100 = rankValues.every((rank) => rank <= 100);
  const oneTop100 = rankValues.some((rank) => rank <= 100);
  const unrankedBoth = rankValues.every((rank) => rank > 100);
  const watchlistEligible = !teamALower && !teamBLower && !separateCircuit;
  const hasWatchlistTeam = watchlistEligible && (isWatchlistTeam(match.teamA.name) || isWatchlistTeam(match.teamB.name));
  const tournament = classifyTournament(match.eventName, oneTop50 || bothTop100);

  if (bothTop20) {
    score += 100;
    reasons.push("Обе команды в top-20.");
  } else if (bothTop50) {
    score += 80;
    reasons.push("Обе команды в top-50.");
  } else if (oneTop50) {
    score += bestRank <= 30 ? 65 : 55;
    reasons.push("Есть команда top-50.");
  } else if (bothTop100) {
    score += 45;
    reasons.push("Обе команды в top-100.");
  } else if (oneTop100) {
    score += 30;
    reasons.push("Есть команда top-100.");
  }

  if (hasWatchlistTeam) {
    score += 35;
    reasons.push("Команда из Pro watchlist.");
  }

  if (tournament.tier === "S") {
    score += 60;
    reasons.push("Известный S-tier турнир.");
  } else if (tournament.tier === "A") {
    score += 40;
    reasons.push("Известный A-tier турнир.");
  } else if (tournament.tier === "B" && (oneTop50 || bothTop100)) {
    score += 25;
    reasons.push("Известный турнир с ranked участниками.");
  } else if (tournament.isKnownTournament) {
    score += 8;
    reasons.push("Известный турнир, но tier зависит от участников.");
  }

  if ((match.stage ?? "").toLowerCase().includes("playoff") || (match.stage ?? "").toLowerCase().includes("elimination")) {
    score += 20;
    reasons.push("Playoff/elimination context.");
  }
  if (match.isLan) {
    score += 15;
    reasons.push("LAN match.");
  }
  if (match.format === "BO3" && oneTop50) {
    score += 5;
    reasons.push("BO3 повышает качество сравнения top-команд.");
  }

  if (teamALower || teamBLower) {
    score -= 60;
    hiddenReasons.push(teamAClass === "academy" || teamBClass === "academy" ? "academy/lower-tier team" : "lower-tier team");
  }
  if (separateCircuit) {
    score -= 45;
    hiddenReasons.push("separate circuit");
  }
  if (unrankedBoth) {
    score -= hasWatchlistTeam && tournament.isKnownTournament ? 20 : 50;
    hiddenReasons.push("both teams unranked");
  }
  if (!tournament.isKnownTournament) {
    score -= 20;
    hiddenReasons.push("unknown tournament");
  }
  if (!oneTop100) hiddenReasons.push("no top-100 team");
  if (match.needsReview || match.teamA.needsReview || match.teamB.needsReview) {
    score -= 30;
    hiddenReasons.push("needs_review team matching");
  }
  if ((match.sourceConfidence ?? 1) < 0.55) {
    score -= 20;
    hiddenReasons.push("low source confidence");
  }
  if (rankA.ageDays !== null && rankA.ageDays > 30) score -= rankA.stale ? 16 : 8;
  if (rankB.ageDays !== null && rankB.ageDays > 30) score -= rankB.stale ? 16 : 8;
  if (rankA.stale || rankB.stale) hiddenReasons.push("stale ranking");

  if (match.manualPriority) {
    score += match.manualPriority;
    reasons.push("Manual priority override.");
  }
  if (match.isPinned) {
    score += 220;
    reasons.push("Pinned by analyst; priority only, no prediction confidence boost.");
  }

  const label = labelFromScore(score);
  let visibilityTier: VisibilityTier =
    match.manualVisibility && ["pro_focus", "top_50", "top_100", "notable", "lower_tier", "academy", "separate_circuit", "hidden", "needs_review"].includes(match.manualVisibility)
      ? (match.manualVisibility as VisibilityTier)
      : match.needsReview || match.teamA.needsReview || match.teamB.needsReview
        ? "needs_review"
        : separateCircuit
          ? "separate_circuit"
          : teamAClass === "academy" || teamBClass === "academy"
            ? "academy"
            : teamALower || teamBLower
              ? "lower_tier"
              : bothTop50 || bestRank <= 50
                ? "top_50"
                : bothTop100 || bestRank <= 100
                  ? "top_100"
                  : hasWatchlistTeam
                    ? "notable"
                    : label === "hidden"
                      ? "hidden"
                      : "pro_focus";

  if (match.isPinned && visibilityTier !== "needs_review") {
    visibilityTier = visibilityTier === "academy" || visibilityTier === "lower_tier" || visibilityTier === "separate_circuit" ? visibilityTier : "pro_focus";
  }

  return {
    priorityScore: Math.round(score),
    priorityLabel: label,
    visibilityTier,
    reasons: reasons.length ? reasons : ["No strong Pro Focus signals."],
    hiddenReasons: [...new Set(hiddenReasons)],
    teamAEffectiveRank: rankA.rank,
    teamBEffectiveRank: rankB.rank,
    hasWatchlistTeam,
    isKnownTournament: tournament.isKnownTournament,
    hasStaleRanking: Boolean(rankA.stale || rankB.stale),
    tournamentTier: tournament.tier
  };
}

export function isDefaultProFocus(priority: MatchPriorityResult, isPinned = false) {
  if (isPinned) return true;
  return (
    ["must_watch", "high", "medium"].includes(priority.priorityLabel) &&
    !["hidden", "lower_tier", "academy", "separate_circuit", "needs_review"].includes(priority.visibilityTier)
  );
}
