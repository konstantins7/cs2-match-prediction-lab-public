import { describe, expect, it } from "vitest";
import { calculatePrediction } from "./calculatePrediction";
import { calculateDataRelevanceScore } from "./dataRelevance";
import { newsClamp, newsImpactFactor } from "./newsImpact";
import { overtimeFactor } from "./overtime";
import { factorContribution } from "./normalization";
import { makeFactor } from "./utils";
import { createPredictionFixture } from "./testFixtures";

describe("calculatePrediction acceptance rules", () => {
  it("keeps probabilities summing to 100 and within 1..99", () => {
    const result = calculatePrediction(createPredictionFixture());
    expect(result.teamAProbability + result.teamBProbability).toBe(100);
    expect(result.teamAProbability).toBeGreaterThanOrEqual(1);
    expect(result.teamAProbability).toBeLessThanOrEqual(99);
    expect(result.teamBProbability).toBeGreaterThanOrEqual(1);
    expect(result.teamBProbability).toBeLessThanOrEqual(99);
  });

  it("clamps a single factor impact to [-10,+10]", () => {
    const factor = makeFactor({
      factorName: "Clamp",
      factorGroup: "test",
      weight: 1,
      teamAValue: 100,
      teamBValue: -100,
      scale: 1,
      confidence: 1,
      explanation: "test"
    });
    expect(factor.impact).toBe(10);
  });

  it("clamps weak rumor news to ±3 and total news impact to ±12", () => {
    expect(newsClamp({ reliability: "weak rumor", impactScore: 9, isRumor: true, isOfficial: false, maxAllowedImpact: 3 })).toBe(3);
    expect(newsClamp({ reliability: "reliable rumor", impactScore: 9, isRumor: true, isOfficial: false, maxAllowedImpact: 5 })).toBe(5);
    expect(newsClamp({ reliability: "confirmed insider", impactScore: 9, isRumor: false, isOfficial: false, maxAllowedImpact: 8 })).toBe(8);
    expect(newsClamp({ reliability: "official", impactScore: 15, isRumor: false, isOfficial: true, maxAllowedImpact: 12 })).toBe(12);
    const input = createPredictionFixture({
      news: Array.from({ length: 8 }, (_, index) => ({
        teamId: index < 4 ? "teamA" : "teamB",
        title: "Rumor",
        summary: "test",
        source: "weak rumor",
        publishedAt: "2026-05-11T08:00:00.000Z",
        reliability: "weak rumor",
        eventType: "rumor",
        sentiment: index < 4 ? "positive" : "negative",
        impactScore: index < 4 ? 10 : -10,
        maxAllowedImpact: 3,
        isRumor: true,
        isOfficial: false
      }))
    });
    const factor = newsImpactFactor(input);
    expect(Math.abs(factor.teamAValue)).toBeLessThanOrEqual(12);
    expect(Math.abs(factor.teamBValue)).toBeLessThanOrEqual(12);
  });

  it("returns complete non-empty factor outputs with clamped impacts", () => {
    const result = calculatePrediction(createPredictionFixture());
    expect(result.factors.length).toBe(28);
    for (const factor of result.factors) {
      expect(factor.factorName.length).toBeGreaterThan(0);
      expect(factor.factorGroup.length).toBeGreaterThan(0);
      expect(typeof factor.teamAValue).toBe("number");
      expect(typeof factor.teamBValue).toBe("number");
      expect(typeof factor.rawDifference).toBe("number");
      expect(typeof factor.normalizedDifference).toBe("number");
      expect(typeof factor.weight).toBe("number");
      expect(factor.impact).toBeGreaterThanOrEqual(-10);
      expect(factor.impact).toBeLessThanOrEqual(10);
      expect(factor.confidence).toBeGreaterThanOrEqual(0);
      expect(factor.confidence).toBeLessThanOrEqual(1);
      expect(factor.explanation.length).toBeGreaterThan(0);
      expect(Array.isArray(factor.evidence)).toBe(true);
      expect(factor.evidence.length).toBeGreaterThan(0);
      expect(Array.isArray(factor.warnings)).toBe(true);
    }
  });

  it("applies model weights to factor contribution", () => {
    const input = createPredictionFixture();
    const zeroWeight = calculatePrediction({
      ...input,
      modelWeights: { ...input.modelWeights, mapPool: 0 }
    });
    const highWeight = calculatePrediction({
      ...input,
      modelWeights: { ...input.modelWeights, mapPool: 2 }
    });
    const zeroMapPool = zeroWeight.factors.find((factor) => factor.factorName === "Map Pool");
    const highMapPool = highWeight.factors.find((factor) => factor.factorName === "Map Pool");
    expect(zeroMapPool).toBeDefined();
    expect(highMapPool).toBeDefined();
    expect(factorContribution(zeroMapPool!)).toBe(0);
    expect(Math.abs(factorContribution(highMapPool!))).toBeGreaterThan(Math.abs(zeroMapPool!.impact * input.modelWeights.mapPool * zeroMapPool!.confidence));
  });

  it("caps BO1 confidence at 75", () => {
    const result = calculatePrediction(createPredictionFixture({ match: { ...createPredictionFixture().match, format: "BO1" } }));
    expect(result.confidenceScore).toBeLessThanOrEqual(75);
  });

  it("caps low data quality confidence at 65", () => {
    const base = createPredictionFixture();
    const result = calculatePrediction(createPredictionFixture({ match: { ...base.match, dataQualityScore: 25 } }));
    expect(result.confidenceScore).toBeLessThanOrEqual(65);
  });

  it("caps new roster confidence at 70 and raises risk", () => {
    const base = createPredictionFixture();
    const result = calculatePrediction(
      createPredictionFixture({
        rosterVersionA: { ...base.rosterVersionA!, startedAt: "2026-05-01T08:00:00.000Z", coreStabilityScore: 0.35 },
        chemistryA: { ...base.chemistryA!, coreStabilityScore: 0.35, adaptationScore: 0.38, volatilityScore: 0.7 }
      })
    );
    expect(result.confidenceScore).toBeLessThanOrEqual(70);
    expect(result.riskBreakdown.riskReasons.join(" ")).toContain("Новый roster");
  });

  it("decays old data after a major patch, role change, and map version change", () => {
    const beforePatch = calculateDataRelevanceScore({
      statDate: "2026-01-01T08:00:00.000Z",
      latestMajorPatchDate: "2026-04-01T08:00:00.000Z",
      latestMapVersionDate: "2026-04-05T08:00:00.000Z",
      rosterSimilarity: 0.9,
      roleSimilarity: 0.9,
      positionSimilarity: 0.9,
      sampleSize: 40
    });
    const current = calculateDataRelevanceScore({
      statDate: "2026-05-01T08:00:00.000Z",
      latestMajorPatchDate: "2026-04-01T08:00:00.000Z",
      latestMapVersionDate: "2026-04-05T08:00:00.000Z",
      rosterSimilarity: 0.9,
      roleSimilarity: 0.9,
      positionSimilarity: 0.9,
      sampleSize: 40
    });
    const roleChanged = calculateDataRelevanceScore({
      statDate: "2026-05-01T08:00:00.000Z",
      latestMajorPatchDate: "2026-04-01T08:00:00.000Z",
      latestMapVersionDate: "2026-04-05T08:00:00.000Z",
      rosterSimilarity: 0.9,
      roleSimilarity: 0.4,
      positionSimilarity: 0.9,
      sampleSize: 40
    });
    const positionChanged = calculateDataRelevanceScore({
      statDate: "2026-05-01T08:00:00.000Z",
      latestMajorPatchDate: "2026-04-01T08:00:00.000Z",
      latestMapVersionDate: "2026-04-05T08:00:00.000Z",
      rosterSimilarity: 0.9,
      roleSimilarity: 0.9,
      positionSimilarity: 0.4,
      sampleSize: 40
    });
    expect(beforePatch).toBeLessThan(current);
    expect(roleChanged).toBeLessThan(current);
    expect(positionChanged).toBeLessThan(current);
  });

  it("stable core increases confidence versus an unstable core", () => {
    const stable = calculatePrediction(createPredictionFixture());
    const base = createPredictionFixture();
    const unstable = calculatePrediction(
      createPredictionFixture({
        rosterVersionA: { ...base.rosterVersionA!, coreStabilityScore: 0.25, mapsPlayedTogether: 4, startedAt: "2026-05-01T08:00:00.000Z" },
        rosterVersionB: { ...base.rosterVersionB!, coreStabilityScore: 0.25, mapsPlayedTogether: 4, startedAt: "2026-05-01T08:00:00.000Z" },
        chemistryA: { ...base.chemistryA!, coreStabilityScore: 0.25, volatilityScore: 0.7 },
        chemistryB: { ...base.chemistryB!, coreStabilityScore: 0.25, volatilityScore: 0.7 }
      })
    );
    expect(stable.confidenceScore).toBeGreaterThan(unstable.confidenceScore);
  });

  it("overtime affects close matches more than one-sided matches", () => {
    const input = createPredictionFixture({
      mapStatsA: createPredictionFixture().mapStatsA.map((stat) => ({ ...stat, overtimeWinRate: 0.25, pressureRoundWinRate: 0.32, clutchInOvertimeScore: 0.3 })),
      mapStatsB: createPredictionFixture().mapStatsB.map((stat) => ({ ...stat, overtimeWinRate: 0.74, pressureRoundWinRate: 0.7, clutchInOvertimeScore: 0.72 }))
    });
    const close = overtimeFactor(input, 0);
    const oneSided = overtimeFactor(input, 25);
    expect(Math.abs(factorContribution(close))).toBeGreaterThan(Math.abs(factorContribution(oneSided)));
  });
});
