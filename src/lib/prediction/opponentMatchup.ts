import type { OpponentMatchupProfileEntity, PredictionFactorOutput, PredictionInput, TeamStyleSnapshotEntity } from "./types";
import { clamp, sampleSizeConfidence } from "./normalization";
import { averageBy, makeEvidence, makeFactor } from "./utils";

function profileScore(profile?: OpponentMatchupProfileEntity | null) {
  if (!profile) return { score: 0.5, confidence: 0.22, sample: 0, warnings: ["Нет direct opponent matchup profile; используется style fallback."] };
  const sampleConfidence = sampleSizeConfidence(profile.mapsPlayed, 24);
  const direct = profile.matchWinRate * 0.18 + profile.mapWinRate * 0.18 + clamp(0.5 + profile.averageRoundDiff / 18, 0, 1) * 0.1;
  const style =
    profile.styleAdvantageScore * 0.14 +
    profile.awpMatchupScore * 0.1 +
    profile.entryMatchupScore * 0.1 +
    profile.overtimeMatchupScore * 0.08 +
    profile.closingMatchupScore * 0.08 +
    (1 - profile.vetoPunishScore) * 0.06;
  const score = clamp(direct + style, 0, 1);
  const confidence = clamp((profile.confidenceScore * 0.55 + sampleConfidence * 0.3 + profile.rosterSimilarity * 0.15), 0.18, 0.92);
  const warnings = [
    ...(profile.matchesPlayed < 2 || profile.mapsPlayed < 8 ? ["Low direct matchup sample; confidence снижен."] : []),
    ...(profile.rosterSimilarity < 0.55 ? ["H2H/matchup данные дисконтированы из-за низкой roster similarity."] : []),
    ...(profile.vetoPunishScore > 0.65 ? ["Соперник может наказывать через veto/map mismatch."] : [])
  ];
  return { score, confidence, sample: profile.mapsPlayed, warnings };
}

function styleFallback(style?: TeamStyleSnapshotEntity | null) {
  if (!style) return { score: 0.5, confidence: 0.2 };
  const score =
    style.aggressionScore * 0.13 +
    style.executeHeavyScore * 0.12 +
    style.awpDependencyScore * 0.1 +
    style.entryDependencyScore * 0.1 +
    style.forceBuyStrength * 0.1 +
    style.ctSideStrength * 0.1 +
    style.tSideStrength * 0.1 +
    style.retakeStrength * 0.09 +
    style.clutchStrength * 0.1 +
    style.tempoScore * 0.08 +
    (1 - style.volatilityScore) * 0.08;
  return { score: clamp(score, 0, 1), confidence: 0.42 };
}

export function opponentMatchupFactor(input: PredictionInput): PredictionFactorOutput {
  const directA = profileScore(input.opponentMatchupA);
  const directB = profileScore(input.opponentMatchupB);
  const styleA = styleFallback(input.teamStyleA);
  const styleB = styleFallback(input.teamStyleB);
  const lowDirect = directA.sample < 8 || directB.sample < 8;
  const teamAValue = lowDirect ? directA.score * 0.45 + styleA.score * 0.55 : directA.score;
  const teamBValue = lowDirect ? directB.score * 0.45 + styleB.score * 0.55 : directB.score;
  const h2hRoster = input.h2h.length
    ? averageBy(input.h2h, (entry) => (entry.teamARosterSimilarity + entry.teamBRosterSimilarity) / 2)
    : 0.5;
  const confidence = clamp(Math.min(directA.confidence, directB.confidence) * (lowDirect ? 0.74 : 1) * (0.75 + h2hRoster * 0.25), 0.16, 0.88);
  const sourceWarnings = input.sourceConflicts.length ? ["Source conflict влияет на matchup confidence и data quality."] : [];

  return makeFactor({
    factorName: "Opponent Matchup",
    factorGroup: "matchup",
    weight: input.modelWeights.opponentMatchup,
    teamAValue,
    teamBValue,
    scale: 0.35,
    impactScale: 4,
    confidence,
    explanation: "Сравнивает direct H2H с roster similarity, style matchup, AWP/entry/pistol-veto pressure, overtime и closing matchup. При малой выборке fallback идёт на style profile.",
    evidence: [
      makeEvidence("direct matchup maps", input.opponentMatchupA?.period ?? "unknown", directA.sample, directA.sample, directB.sample, "Direct sample определяет, насколько доверять H2H."),
      makeEvidence("style fallback", input.teamStyleA?.period ?? "last_90_days", 1, styleA.score.toFixed(3), styleB.score.toFixed(3), "Style profile используется, если direct matchup sample слабый."),
      makeEvidence("veto punish", "matchup", 1, input.opponentMatchupA?.vetoPunishScore ?? "unknown", input.opponentMatchupB?.vetoPunishScore ?? "unknown", "Bad map/veto matchup снижает фаворита и повышает risk.")
    ],
    warnings: [...directA.warnings, ...directB.warnings, ...sourceWarnings]
  });
}
