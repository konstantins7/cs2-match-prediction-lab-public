import { classifyTeamVisibility, classifyTournament, getEffectiveRank, isWatchlistTeam } from "../proFocus";
import type { PredictionFactorOutput, PredictionInput, TeamBasicResultEntity } from "./types";
import { clamp, sampleSizeConfidence } from "./normalization";
import { makeEvidence, makeFactor } from "./utils";

function rankScore(rank?: number | null) {
  if (!rank || rank > 100) return 0.5;
  return clamp(0.5 + (101 - rank) / 200, 0.5, 1);
}

function bestRank(input: PredictionInput, side: "A" | "B") {
  const team = side === "A" ? input.teamA : input.teamB;
  return getEffectiveRank(team).rank;
}

function basicResultScore(snapshot?: TeamBasicResultEntity | null) {
  if (!snapshot || snapshot.matchesPlayed <= 0) return 0.5;
  const rankedSample = snapshot.vsRankedWins + snapshot.vsRankedLosses;
  const rankedWinRate = rankedSample > 0 ? snapshot.vsRankedWins / rankedSample : snapshot.winRate;
  const opponentRankBonus =
    snapshot.averageOpponentRank && snapshot.averageOpponentRank <= 100
      ? (101 - snapshot.averageOpponentRank) / 800
      : 0;
  return clamp(snapshot.winRate * 0.72 + rankedWinRate * 0.18 + opponentRankBonus, 0.18, 0.82);
}

function basicSample(input: PredictionInput) {
  return (input.basicResultA?.matchesPlayed ?? 0) + (input.basicResultB?.matchesPlayed ?? 0);
}

export function basicRankingAdvantageFactor(input: PredictionInput): PredictionFactorOutput {
  const rankA = bestRank(input, "A");
  const rankB = bestRank(input, "B");
  const rankInfoA = getEffectiveRank(input.teamA);
  const rankInfoB = getEffectiveRank(input.teamB);
  const bothUnranked = !rankA && !rankB;
  return makeFactor({
    factorName: "Basic Ranking Advantage",
    factorGroup: "basic_real",
    weight: input.modelWeights.basicRanking,
    teamAValue: rankScore(rankA),
    teamBValue: rankScore(rankB),
    scale: 0.36,
    impactScale: 4.2,
    confidence: bothUnranked ? 0.18 : Math.max(0.2, ((rankInfoA.confidence ?? 0.45) + (rankInfoB.confidence ?? 0.45)) / 2),
    explanation: "Free-source baseline: Valve/HLTV manual rank gives a small bounded edge, not a strong prediction.",
    evidence: [
      makeEvidence("effectiveRank", "current", 1, rankA ?? "unranked", rankB ?? "unranked", "Ranking is capped and only nudges fixture-only matches.", "rank_snapshots")
    ],
    warnings: bothUnranked ? ["Обе команды unranked: ranking baseline остаётся 50/50."] : []
  });
}

export function basicRecentResultsFactor(input: PredictionInput): PredictionFactorOutput {
  const sample = basicSample(input);
  const a = input.basicResultA;
  const b = input.basicResultB;
  const dataConfidence = sampleSizeConfidence(sample, 18) * (((a?.dataQuality ?? 0.35) + (b?.dataQuality ?? 0.35)) / 2);
  return makeFactor({
    factorName: "Basic Recent Results",
    factorGroup: "basic_real",
    weight: input.modelWeights.basicRecentResults,
    teamAValue: basicResultScore(a),
    teamBValue: basicResultScore(b),
    scale: 0.32,
    impactScale: 4,
    confidence: sample > 0 ? Math.max(0.22, dataConfidence) : dataConfidence,
    explanation: "Basic finished-match history from free fixtures: wins/losses with a light opponent-rank adjustment.",
    evidence: [
      makeEvidence("basicWinRate", "last_90_days", sample, a?.winRate ?? "missing", b?.winRate ?? "missing", "Finished fixtures create a bounded recent-results signal.", "basic_result_snapshots"),
      makeEvidence("matchesPlayed", "last_90_days", sample, a?.matchesPlayed ?? 0, b?.matchesPlayed ?? 0, "Small sample keeps confidence low.", "basic_result_snapshots")
    ],
    warnings: [
      ...(a ? [] : [`Нет basic result history для ${input.teamA.name}.`]),
      ...(b ? [] : [`Нет basic result history для ${input.teamB.name}.`])
    ]
  });
}

export function tournamentImportanceFactor(input: PredictionInput): PredictionFactorOutput {
  const ranked = Boolean(bestRank(input, "A") && (bestRank(input, "A") ?? 999) <= 50) || Boolean(bestRank(input, "B") && (bestRank(input, "B") ?? 999) <= 50);
  const tournament = classifyTournament(input.match.eventName, ranked);
  const value = tournament.importanceScore / 100;
  return makeFactor({
    factorName: "Tournament Importance",
    factorGroup: "basic_real",
    weight: input.modelWeights.tournamentImportance,
    teamAValue: value,
    teamBValue: value,
    scale: 1,
    impactScale: 2,
    confidence: tournament.isKnownTournament ? 0.72 : 0.35,
    explanation: "Tournament profile is treated as context and does not pick a winner by itself.",
    evidence: [
      makeEvidence("tournamentTier", "fixture", 1, tournament.tier, tournament.tier, `Importance score ${tournament.importanceScore}/100.`, "known_tournaments")
    ],
    warnings: tournament.isKnownTournament ? [] : ["Турнир неизвестен: fixture context не усиливает прогноз."]
  });
}

export function teamKnownnessFactor(input: PredictionInput): PredictionFactorOutput {
  const lowerA = ["academy", "lower_tier", "separate_circuit"].includes(classifyTeamVisibility(input.teamA.name));
  const lowerB = ["academy", "lower_tier", "separate_circuit"].includes(classifyTeamVisibility(input.teamB.name));
  const rankA = bestRank(input, "A");
  const rankB = bestRank(input, "B");
  const scoreA = (lowerA ? 0 : isWatchlistTeam(input.teamA.name) ? 0.62 : 0.5) + (rankA && rankA <= 100 ? 0.12 : 0);
  const scoreB = (lowerB ? 0 : isWatchlistTeam(input.teamB.name) ? 0.62 : 0.5) + (rankB && rankB <= 100 ? 0.12 : 0);
  return makeFactor({
    factorName: "Team Knownness / Watchlist",
    factorGroup: "basic_real",
    weight: input.modelWeights.teamKnownness,
    teamAValue: clamp(scoreA, 0.35, 0.76),
    teamBValue: clamp(scoreB, 0.35, 0.76),
    scale: 0.34,
    impactScale: 3,
    confidence: 0.5,
    explanation: "Watchlist/ranked identity is a weak prior for recognizable pro teams, ignored for academy/lower-tier variants.",
    evidence: [
      makeEvidence("watchlist", "fixture", 1, isWatchlistTeam(input.teamA.name) ? "yes" : "no", isWatchlistTeam(input.teamB.name) ? "yes" : "no", "Watchlist is a weak source-quality prior.", "pro_watchlist")
    ],
    warnings: lowerA || lowerB ? ["Watchlist bonus не применяется к academy/lower-tier/separate-circuit вариантам."] : []
  });
}

export function fixtureConfidenceFactor(input: PredictionInput): PredictionFactorOutput {
  const valueA = clamp((input.teamA.sourceConfidence ?? 0.5) * 0.5 + (input.match.sourceConfidence ?? 0.5) * 0.5, 0, 1);
  const valueB = clamp((input.teamB.sourceConfidence ?? 0.5) * 0.5 + (input.match.sourceConfidence ?? 0.5) * 0.5, 0, 1);
  const matchSourceConfidence = input.match.sourceConfidence ?? 0.5;
  return makeFactor({
    factorName: "Fixture Confidence",
    factorGroup: "basic_real",
    weight: input.modelWeights.fixtureConfidence,
    teamAValue: valueA,
    teamBValue: valueB,
    scale: 0.5,
    impactScale: 1.5,
    confidence: Math.min(valueA, valueB),
    explanation: "Fixture/source confidence can only add a tiny asymmetric nudge; it mostly explains reliability.",
    evidence: [
      makeEvidence("sourceConfidence", "fixture", 1, valueA, valueB, "Low source confidence is a warning, not a strong winner signal.", input.match.source ?? "fixture")
    ],
    warnings: matchSourceConfidence < 0.65 ? ["Fixture source confidence низкий или частичный."] : []
  });
}

export function unknownDataPenaltyFactor(input: PredictionInput): PredictionFactorOutput {
  const coverageA =
    (bestRank(input, "A") ? 0.25 : 0) +
    (input.basicResultA ? 0.25 : 0) +
    (input.playersA.length ? 0.15 : 0) +
    (input.playerStatsA.length ? 0.15 : 0) +
    (input.mapStatsA.length ? 0.1 : 0) +
    (input.vetoPatternsA.length ? 0.1 : 0);
  const coverageB =
    (bestRank(input, "B") ? 0.25 : 0) +
    (input.basicResultB ? 0.25 : 0) +
    (input.playersB.length ? 0.15 : 0) +
    (input.playerStatsB.length ? 0.15 : 0) +
    (input.mapStatsB.length ? 0.1 : 0) +
    (input.vetoPatternsB.length ? 0.1 : 0);
  return makeFactor({
    factorName: "Unknown Data Penalty",
    factorGroup: "basic_real",
    weight: input.modelWeights.unknownDataPenalty,
    teamAValue: coverageA,
    teamBValue: coverageB,
    scale: 1,
    impactScale: 2.5,
    confidence: 0.5,
    explanation: "Asymmetric missing data can slightly reduce one side; symmetric missing data stays neutral and lowers confidence elsewhere.",
    evidence: [
      makeEvidence("knownDataCoverage", "current", 1, coverageA, coverageB, "Rank/basic/player/map/veto coverage summary.", "data_coverage")
    ],
    warnings: [
      ...(coverageA < 0.4 ? [`Мало данных по ${input.teamA.name}.`] : []),
      ...(coverageB < 0.4 ? [`Мало данных по ${input.teamB.name}.`] : [])
    ]
  });
}
