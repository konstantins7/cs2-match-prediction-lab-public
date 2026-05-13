import { describe, expect, it } from "vitest";
import { calculatePrediction } from "./calculatePrediction";
import { calculateDataRelevanceScore } from "./dataRelevance";
import { newsClamp, newsImpactFactor } from "./newsImpact";
import { overtimeFactor } from "./overtime";
import { factorContribution } from "./normalization";
import { makeFactor } from "./utils";
import { createPredictionFixture } from "./testFixtures";
import { factorEvidenceKey, factorWarningKey } from "../factorKeys";
import { predictionHeadline } from "../predictionCopy";

describe("calculatePrediction acceptance rules", () => {
  it("keeps probabilities summing to 100 and within 1..99", () => {
    const result = calculatePrediction(createPredictionFixture());
    expect(result.teamAProbability + result.teamBProbability).toBe(100);
    expect(result.teamAProbability).toBeGreaterThanOrEqual(1);
    expect(result.teamAProbability).toBeLessThanOrEqual(99);
    expect(result.teamBProbability).toBeGreaterThanOrEqual(1);
    expect(result.teamBProbability).toBeLessThanOrEqual(99);
  });

  it("caps demo probabilities at 75/25", () => {
    const result = calculatePrediction(createPredictionFixture({ match: { ...createPredictionFixture().match, sourceMode: "demo" } }));
    expect(Math.max(result.teamAProbability, result.teamBProbability)).toBeLessThanOrEqual(75);
    expect(result.probabilityCap?.reasons.join(" ")).toContain("DEMO DATA");
  });

  it("caps PandaScore fixtures-only probabilities at 72/28 without real player/map/veto stats", () => {
    const result = calculatePrediction(createPredictionFixture({ match: { ...createPredictionFixture().match, sourceMode: "pandascore_free" } }));
    expect(Math.max(result.teamAProbability, result.teamBProbability)).toBeLessThanOrEqual(72);
    expect(result.probabilityCap?.reasons.join(" ")).toContain("PandaScore fixtures-only");
  });

  it("caps fixture-only real matches at 55/45 and keeps fully unknown teams 50/50", () => {
    const base = createPredictionFixture();
    const result = calculatePrediction(
      createPredictionFixture({
        match: { ...base.match, sourceMode: "pandascore_free", dataQualityScore: 62 },
        teamA: { ...base.teamA, valveRank: null, hltvRank: null, internalElo: 1500, topRankCategory: "unranked" },
        teamB: { ...base.teamB, valveRank: null, hltvRank: null, internalElo: 1500, topRankCategory: "unranked" },
        playersA: [],
        playersB: [],
        teamFormA: null,
        teamFormB: null,
        playerStatsA: [],
        playerStatsB: [],
        mapStatsA: [],
        mapStatsB: [],
        vetoPatternsA: [],
        vetoPatternsB: []
      })
    );
    expect(result.teamAProbability).toBe(50);
    expect(result.teamBProbability).toBe(50);
    expect(Math.max(result.teamAProbability, result.teamBProbability)).toBeLessThanOrEqual(55);
    expect(result.dataQualityScore).toBeLessThan(40);
  });

  it("caps ranking-only matches at 60/40", () => {
    const base = createPredictionFixture();
    const result = calculatePrediction(
      createPredictionFixture({
        match: { ...base.match, sourceMode: "pandascore_free", dataQualityScore: 62 },
        teamB: { ...base.teamB, valveRank: null, hltvRank: null, internalElo: 1500, topRankCategory: "unranked" },
        playersA: [],
        playersB: [],
        teamFormA: null,
        teamFormB: null,
        playerStatsA: [],
        playerStatsB: [],
        mapStatsA: [],
        mapStatsB: [],
        vetoPatternsA: [],
        vetoPatternsB: []
      })
    );
    expect(Math.max(result.teamAProbability, result.teamBProbability)).toBeLessThanOrEqual(60);
    expect(result.probabilityCap?.reasons.join(" ")).toContain("Ranking-only cap 60/40");
  });

  it("caps ranking plus basic recent results at 65/35 and lets basic snapshots move probability", () => {
    const base = createPredictionFixture();
    const common = {
      match: { ...base.match, sourceMode: "pandascore_free", dataQualityScore: 62 },
      playersA: [],
      playersB: [],
      teamFormA: null,
      teamFormB: null,
      playerStatsA: [],
      playerStatsB: [],
      mapStatsA: [],
      mapStatsB: [],
      vetoPatternsA: [],
      vetoPatternsB: []
    };
    const rankingOnly = calculatePrediction(createPredictionFixture(common));
    const withBasic = calculatePrediction(
      createPredictionFixture({
        ...common,
        basicResultA: { teamId: "teamA", period: "basic_recent", matchesPlayed: 10, wins: 7, losses: 3, winRate: 0.7, vsRankedWins: 3, vsRankedLosses: 1, averageOpponentRank: 42, lastMatchAt: "2026-05-01T08:00:00.000Z", source: "pandascore_free", dataQuality: 0.62 },
        basicResultB: { teamId: "teamB", period: "basic_recent", matchesPlayed: 10, wins: 4, losses: 6, winRate: 0.4, vsRankedWins: 1, vsRankedLosses: 3, averageOpponentRank: 76, lastMatchAt: "2026-05-01T08:00:00.000Z", source: "pandascore_free", dataQuality: 0.62 }
      })
    );
    expect(Math.max(withBasic.teamAProbability, withBasic.teamBProbability)).toBeLessThanOrEqual(65);
    expect(withBasic.teamAProbability).toBeGreaterThanOrEqual(rankingOnly.teamAProbability);
    expect(withBasic.probabilityCap?.reasons.join(" ")).toContain("Ranking + basic recent results cap 65/35");
  });

  it("caps rankings-only probabilities at 70/30", () => {
    const result = calculatePrediction(createPredictionFixture({ match: { ...createPredictionFixture().match, sourceMode: "valve_rankings" } }));
    expect(Math.max(result.teamAProbability, result.teamBProbability)).toBeLessThanOrEqual(70);
    expect(result.probabilityCap?.reasons.join(" ")).toContain("Rankings-only");
  });

  it("returns L0 for fixture-only and keeps it non-actionable at 50/50", () => {
    const base = createPredictionFixture();
    const result = calculatePrediction(
      createPredictionFixture({
        match: { ...base.match, sourceMode: "pandascore_free", dataQualityScore: 30 },
        teamA: { ...base.teamA, valveRank: null, hltvRank: null, topRankCategory: "unranked", internalElo: 1500 },
        teamB: { ...base.teamB, valveRank: null, hltvRank: null, topRankCategory: "unranked", internalElo: 1500 },
        playersA: [],
        playersB: [],
        teamFormA: null,
        teamFormB: null,
        playerStatsA: [],
        playerStatsB: [],
        mapStatsA: [],
        mapStatsB: [],
        vetoPatternsA: [],
        vetoPatternsB: [],
        basicResultA: null,
        basicResultB: null,
        opponentMatchupA: null,
        opponentMatchupB: null,
        dataWindows: [],
        dataCoverage: {
          fixtureData: true,
          rankData: false,
          recentMatches: false,
          teamFormSnapshots: false,
          playerRoster: false,
          playerStats: false,
          mapStats: false,
          vetoHistory: false,
          h2h: false,
          newsOrRosterEvents: false,
          sourceConflicts: false,
          fixtureOnly: true,
          rankingOnly: false,
          rankingAndBasicResults: false,
          bothTeamsUnranked: true,
          lastPandaScoreSyncAt: null,
          lastValveSyncAt: null,
          lastCsUpdatesSyncAt: null,
          lastSourceSyncAt: null,
          lastPredictionCalculatedAt: null,
          freshnessStatus: "unknown",
          known: ["fixture data"],
          missing: ["team rank data", "player stats", "map stats", "veto history"]
        }
      })
    );
    expect(result.readiness.level).toBe("L0_FIXTURE_ONLY");
    expect(result.readiness.isActionable).toBe(false);
    expect(result.teamAProbability).toBe(50);
    expect(result.teamBProbability).toBe(50);
    expect(result.confidenceScore).toBeLessThanOrEqual(20);
  });

  it("returns L1 for rank-only or watchlist context and caps probability at 55/45", () => {
    const base = createPredictionFixture();
    const result = calculatePrediction(
      createPredictionFixture({
        match: { ...base.match, sourceMode: "pandascore_free", dataQualityScore: 60 },
        teamA: { ...base.teamA, name: "G2", valveRank: null, hltvRank: null, topRankCategory: "unranked" },
        teamB: { ...base.teamB, valveRank: null, hltvRank: null, topRankCategory: "unranked" },
        playersA: [],
        playersB: [],
        teamFormA: null,
        teamFormB: null,
        playerStatsA: [],
        playerStatsB: [],
        mapStatsA: [],
        mapStatsB: [],
        vetoPatternsA: [],
        vetoPatternsB: [],
        basicResultA: null,
        basicResultB: null
      })
    );
    expect(result.readiness.level).toBe("L1_BASIC_CONTEXT");
    expect(result.readiness.isActionable).toBe(false);
    expect(Math.max(result.teamAProbability, result.teamBProbability)).toBeLessThanOrEqual(55);
  });

  it("returns L2 for rank plus basic results and caps probability at 65/35", () => {
    const base = createPredictionFixture();
    const result = calculatePrediction(
      createPredictionFixture({
        match: { ...base.match, sourceMode: "pandascore_free", dataQualityScore: 82 },
        playersA: [],
        playersB: [],
        teamFormA: null,
        teamFormB: null,
        playerStatsA: [],
        playerStatsB: [],
        mapStatsA: [],
        mapStatsB: [],
        vetoPatternsA: [],
        vetoPatternsB: [],
        basicResultA: { teamId: "teamA", period: "basic_recent", matchesPlayed: 8, wins: 5, losses: 3, winRate: 0.63, vsRankedWins: 2, vsRankedLosses: 1, averageOpponentRank: 45, lastMatchAt: "2026-05-01T08:00:00.000Z", source: "pandascore_free", dataQuality: 0.65 },
        basicResultB: { teamId: "teamB", period: "basic_recent", matchesPlayed: 8, wins: 3, losses: 5, winRate: 0.38, vsRankedWins: 1, vsRankedLosses: 2, averageOpponentRank: 70, lastMatchAt: "2026-05-01T08:00:00.000Z", source: "pandascore_free", dataQuality: 0.62 },
        dataCoverage: {
          fixtureData: true,
          rankData: true,
          recentMatches: true,
          teamFormSnapshots: false,
          playerRoster: false,
          playerStats: false,
          mapStats: false,
          vetoHistory: false,
          h2h: false,
          newsOrRosterEvents: false,
          sourceConflicts: false,
          fixtureOnly: false,
          rankingOnly: false,
          rankingAndBasicResults: true,
          bothTeamsUnranked: false,
          lastPandaScoreSyncAt: null,
          lastValveSyncAt: null,
          lastCsUpdatesSyncAt: null,
          lastSourceSyncAt: null,
          lastPredictionCalculatedAt: null,
          freshnessStatus: "unknown",
          known: ["fixture data", "team rank data", "team recent matches"],
          missing: ["player stats", "map stats", "veto history"]
        }
      })
    );
    expect(result.readiness.level).toBe("L2_BASIC_PREDICTION");
    expect(Math.max(result.teamAProbability, result.teamBProbability)).toBeLessThanOrEqual(65);
    expect(result.confidenceScore).toBeLessThanOrEqual(55);
  });

  it("returns L3 for roster, player stats, map stats, and veto coverage", () => {
    const result = calculatePrediction(createPredictionFixture());
    expect(result.readiness.level).toBe("L3_ANALYTICAL");
  });

  it("returns L4 for parsed demo or deep manual stats", () => {
    const base = createPredictionFixture();
    const result = calculatePrediction(
      createPredictionFixture({
        playerStatsA: base.playerStatsA.map((stat) => ({ ...stat, source: "parsed_demo" })),
        playerStatsB: base.playerStatsB.map((stat) => ({ ...stat, source: "parsed_demo" })),
        mapStatsA: base.mapStatsA.map((stat) => ({ ...stat, source: "parsed_demo" })),
        mapStatsB: base.mapStatsB.map((stat) => ({ ...stat, source: "parsed_demo" }))
      })
    );
    expect(result.readiness.level).toBe("L4_DEEP");
  });

  it("marks DQ below 20 as non-actionable and avoids forecast copy", () => {
    const base = createPredictionFixture();
    const result = calculatePrediction(
      createPredictionFixture({
        match: { ...base.match, dataQualityScore: 5 },
        playersA: [],
        playersB: [],
        playerStatsA: [],
        playerStatsB: [],
        mapStatsA: [],
        mapStatsB: [],
        vetoPatternsA: [],
        vetoPatternsB: [],
        dataWindows: []
      })
    );
    expect(result.readiness.isActionable).toBe(false);
    expect(result.confidenceScore).toBeLessThanOrEqual(20);
    expect(predictionHeadline(result, "Team A")).not.toContain("Модель склоняется");
  });

  it("marks preliminary limited-data factors with warnings", () => {
    const base = createPredictionFixture();
    const result = calculatePrediction(
      createPredictionFixture({
        match: { ...base.match, sourceMode: "pandascore_free", dataQualityScore: 60 },
        playersA: [],
        playersB: [],
        teamFormA: null,
        teamFormB: null,
        playerStatsA: [],
        playerStatsB: [],
        mapStatsA: [],
        mapStatsB: [],
        vetoPatternsA: [],
        vetoPatternsB: []
      })
    );
    expect(result.readiness.level).toBe("L1_BASIC_CONTEXT");
    expect(result.factors.some((factor) => factor.warnings.some((warning) => warning.includes("limited data")))).toBe(true);
  });

  it("caps sourceConflict matches and lowers data quality", () => {
    const base = createPredictionFixture();
    const clean = calculatePrediction(base);
    const conflicted = calculatePrediction(
      createPredictionFixture({
        match: { ...base.match, sourceMode: "mixed" },
        sourceConflicts: [
          {
            source: "pandascore",
            entityType: "match",
            externalId: "conflict",
            externalName: "Conflicting Match",
            matchedEntityId: base.match.id,
            confidence: 0.45,
            status: "needs_review"
          }
        ]
      })
    );
    expect(Math.max(conflicted.teamAProbability, conflicted.teamBProbability)).toBeLessThanOrEqual(68);
    expect(conflicted.dataQualityScore).toBeLessThan(clean.dataQualityScore);
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
    expect(result.factors.length).toBe(35);
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

  it("builds unique React keys for repeated evidence and warnings", () => {
    const warnings = ["same warning", "same warning"];
    const evidence = [{ metric: "same" }, { metric: "same" }];
    const warningKeys = warnings.map((warning, index) => factorWarningKey("Factor", warning, index));
    const evidenceKeys = evidence.map((item, index) => factorEvidenceKey("Factor", item, index));
    expect(new Set(warningKeys).size).toBe(warningKeys.length);
    expect(new Set(evidenceKeys).size).toBe(evidenceKeys.length);
  });
});
