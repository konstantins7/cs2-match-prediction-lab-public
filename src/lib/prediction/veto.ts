import type { PredictionFactorOutput, PredictionInput, VetoPatternEntity, VetoScenario } from "./types";
import { sampleSizeConfidence, weightedAverage } from "./normalization";
import { activeMaps, makeEvidence, makeFactor, mapByName } from "./utils";

function topMap(patterns: VetoPatternEntity[], selector: (pattern: VetoPatternEntity) => number) {
  return [...patterns].sort((a, b) => selector(b) - selector(a))[0];
}

function mapAdvantage(input: PredictionInput, mapName: string) {
  const a = mapByName(input.mapStatsA).get(mapName);
  const b = mapByName(input.mapStatsB).get(mapName);
  if (!a || !b) return 0;
  return (a.winRate - b.winRate) * ((a.sampleQuality + b.sampleQuality) / 2);
}

export function buildVetoScenarios(input: PredictionInput): VetoScenario[] {
  const maps = activeMaps(input);
  const aBan = topMap(input.vetoPatternsA, (p) => p.banProbability);
  const bBan = topMap(input.vetoPatternsB, (p) => p.banProbability);
  const aPick = topMap(input.vetoPatternsA, (p) => p.pickProbability + p.comfortScore);
  const bPick = topMap(input.vetoPatternsB, (p) => p.pickProbability + p.comfortScore);
  const decider =
    maps
      .map((map) => ({ map, score: Math.abs(mapAdvantage(input, map)) * -1 + (mapByName(input.mapStatsA).get(map)?.deciderRate ?? 0) }))
      .sort((a, b) => b.score - a.score)[0]?.map ?? maps[0] ?? "Unknown";

  const bestA =
    maps.map((map) => ({ map, adv: mapAdvantage(input, map) })).sort((a, b) => b.adv - a.adv)[0]?.map ?? decider;
  const bestB =
    maps.map((map) => ({ map, adv: mapAdvantage(input, map) })).sort((a, b) => a.adv - b.adv)[0]?.map ?? decider;
  const confidence = sampleSizeConfidence(input.vetoPatternsA.length + input.vetoPatternsB.length, 14);

  return [
    {
      name: "likely scenario",
      likelyBans: [aBan?.mapName ?? "Unknown", bBan?.mapName ?? "Unknown"],
      likelyPicks: [aPick?.mapName ?? "Unknown", bPick?.mapName ?? "Unknown"],
      likelyDecider: decider,
      mapAdvantage: mapAdvantage(input, decider),
      vetoConfidence: confidence,
      hiddenDanger: `Опасная карта: ${Math.abs(mapAdvantage(input, bestB)) > Math.abs(mapAdvantage(input, bestA)) ? bestB : bestA}`,
      explanation: "Сценарий построен по самым частым ban/pick и вероятному decider."
    },
    {
      name: "best case Team A",
      likelyBans: [bBan?.mapName ?? "Unknown"],
      likelyPicks: [bestA],
      likelyDecider: bestA,
      mapAdvantage: mapAdvantage(input, bestA),
      vetoConfidence: confidence * 0.75,
      hiddenDanger: `${input.teamB.name} может убрать ${bestA} ранним ban.`,
      explanation: `Лучший сценарий для ${input.teamA.name}: вывести карту с максимальным map advantage.`
    },
    {
      name: "best case Team B",
      likelyBans: [aBan?.mapName ?? "Unknown"],
      likelyPicks: [bestB],
      likelyDecider: bestB,
      mapAdvantage: mapAdvantage(input, bestB),
      vetoConfidence: confidence * 0.75,
      hiddenDanger: `${input.teamA.name} может избежать ${bestB} через ban.`,
      explanation: `Лучший сценарий для ${input.teamB.name}: наказать слабую карту соперника.`
    }
  ];
}

export function vetoFactor(input: PredictionInput): PredictionFactorOutput {
  const scenarios = buildVetoScenarios(input);
  const likely = scenarios[0];
  const aComfort = weightedAverage(input.vetoPatternsA.map((p) => ({ value: p.comfortScore - p.weaknessScore * 0.4, weight: p.confidenceScore })));
  const bComfort = weightedAverage(input.vetoPatternsB.map((p) => ({ value: p.comfortScore - p.weaknessScore * 0.4, weight: p.confidenceScore })));
  const confidence = Math.min(likely.vetoConfidence, sampleSizeConfidence(input.vetoPatternsA.length + input.vetoPatternsB.length, 14));

  return makeFactor({
    factorName: "Pick/Ban/Veto",
    factorGroup: "maps",
    weight: input.modelWeights.veto,
    teamAValue: aComfort + Math.max(0, likely.mapAdvantage),
    teamBValue: bComfort + Math.max(0, -likely.mapAdvantage),
    scale: 0.3,
    confidence,
    explanation: "Veto оценивает comfort/weakness, predictability, likely bans/picks и hidden danger.",
    evidence: [
      makeEvidence("likely bans", "last_60_days", input.vetoPatternsA.length + input.vetoPatternsB.length, likely.likelyBans[0], likely.likelyBans[1], "Самые вероятные bans."),
      makeEvidence("likely picks", "last_60_days", input.vetoPatternsA.length + input.vetoPatternsB.length, likely.likelyPicks[0], likely.likelyPicks[1], "Самые вероятные picks."),
      makeEvidence("likely decider advantage", "scenario", input.vetoPatternsA.length + input.vetoPatternsB.length, likely.mapAdvantage.toFixed(3), (-likely.mapAdvantage).toFixed(3), likely.explanation)
    ],
    warnings: confidence < 0.55 ? ["Veto имеет низкую confidence: мало исторических patterns."] : []
  });
}
