import type { ForecastAutopilotCandidate, ForecastabilityTier, RealDataFoundationCoverage } from "../autoResearchShared";
import { getForecastAutopilotCandidates } from "./candidateSelector";

const tiers: ForecastabilityTier[] = ["READY", "NEARLY_READY", "BASIC_ONLY", "NOT_ENOUGH_DATA", "BLOCKED"];

function isCovered(candidate: ForecastAutopilotCandidate, id: string) {
  return candidate.coverageBreakdown.find((entry) => entry.id === id)?.status === "yes";
}

function isGridMapped(candidate: ForecastAutopilotCandidate) {
  return candidate.providerContributions.some((entry) => entry.source === "GRID Open Access" && entry.status === "yes");
}

function blockerKey(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("roster")) return "missing roster";
  if (lower.includes("player stats") || lower.includes("player roster")) return "missing player stats";
  if (lower.includes("map stats") || lower.includes("map sample") || lower.includes("map/veto")) return "map stats sample below gate";
  if (lower.includes("veto")) return "missing veto";
  if (lower.includes("rank") || lower.includes("basic recent")) return "missing ranking/basic context";
  if (lower.includes("h2h") || lower.includes("news") || lower.includes("roster events")) return "missing H2H/news context";
  if (lower.includes("grid")) return "no GRID mapping";
  if (lower.includes("sourceurl")) return "sourceUrl warning";
  return value;
}

function candidateBlockers(candidate: ForecastAutopilotCandidate) {
  const actionBlocker: Record<string, string> = {
    roster: "missing roster",
    player_stats: "missing player stats",
    map_stats: "map stats sample below gate",
    rank_basic: "missing ranking/basic context",
    veto: "missing veto",
    grid_mapping: "no GRID mapping",
    source_url: "sourceUrl warning"
  };
  const blockers = [
    ...candidate.blockers,
    ...candidate.missingBlocks,
    ...candidate.nextDataActions.map((action) => actionBlocker[action.target] ?? action.reason)
  ];
  return [...new Set(blockers.map(blockerKey))].filter(Boolean);
}

function liquipediaConfigured() {
  return Boolean(process.env.LIQUIPEDIA_API_KEY) && process.env.ENABLE_LIQUIPEDIA_SYNC === "true";
}

export function summarizeRealDataFoundationCoverage(candidates: ForecastAutopilotCandidate[]): RealDataFoundationCoverage {
  const tierCounts = Object.fromEntries(tiers.map((tier) => [tier, 0])) as Record<ForecastabilityTier, number>;
  const coverageCounts = {
    roster: 0,
    playerStats: 0,
    mapStats: 0,
    veto: 0,
    gridMapped: 0
  };
  const frequency = new Map<string, number>();

  for (const candidate of candidates) {
    tierCounts[candidate.forecastabilityTier] += 1;
    if (isCovered(candidate, "roster")) coverageCounts.roster += 1;
    if (isCovered(candidate, "player_stats")) coverageCounts.playerStats += 1;
    if (isCovered(candidate, "map_stats")) coverageCounts.mapStats += 1;
    if (isCovered(candidate, "veto")) coverageCounts.veto += 1;
    if (isGridMapped(candidate)) coverageCounts.gridMapped += 1;
    for (const blocker of candidateBlockers(candidate)) {
      frequency.set(blocker, (frequency.get(blocker) ?? 0) + 1);
    }
  }

  const blockerFrequency = [...frequency.entries()]
    .map(([blocker, count]) => ({ blocker, count }))
    .sort((a, b) => b.count - a.count || a.blocker.localeCompare(b.blocker));
  const configured = liquipediaConfigured();

  return {
    checkedCandidates: candidates.length,
    tierCounts,
    coverageCounts,
    blockerFrequency,
    topBlockers: blockerFrequency.slice(0, 5).map((item) => item.blocker),
    topCandidates: candidates.slice(0, 5),
    liquipediaSetup: {
      configured,
      message: configured
        ? "LiquipediaDB key configured; use only approved API sync paths when implemented."
        : "LiquipediaDB key pending. Roster automation unavailable; use roster.csv/manual evidence meanwhile."
    }
  };
}

export async function buildRealDataFoundationCoverage(now = new Date(), limit = 80) {
  const candidates = await getForecastAutopilotCandidates(now, limit);
  return summarizeRealDataFoundationCoverage(candidates);
}
