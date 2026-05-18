import { describe, expect, it, vi } from "vitest";
import { ML_PLACEHOLDER_MODEL_VERSION, RULE_BASED_MODEL_VERSION } from "./modelVersions";
import { getPredictionForMatchWithDeps } from "./modelRouter";
import { calculatePrediction } from "./prediction/calculatePrediction";
import { createPredictionFixture } from "./prediction/testFixtures";

describe("model router", () => {
  it("uses rule-based prediction by default", async () => {
    const input = createPredictionFixture();
    const result = await getPredictionForMatchWithDeps({
      buildPredictionInput: async () => input,
      calculatePrediction,
      getLatestFeatureSnapshot: vi.fn(),
      saveMatchFeatureSnapshot: vi.fn()
    }, input.match.id);

    expect(result.kind).toBe("rule_based");
    expect(result.modelName).toBe(RULE_BASED_MODEL_VERSION);
    expect(result.prediction.modelVersion).toBe(RULE_BASED_MODEL_VERSION);
  });

  it("returns neutral ML placeholder and uses an existing snapshot", async () => {
    const snapshot = { id: "snapshot_1", matchId: "match_test" };
    const save = vi.fn();
    const result = await getPredictionForMatchWithDeps({
      buildPredictionInput: vi.fn(),
      calculatePrediction,
      getLatestFeatureSnapshot: async () => snapshot as never,
      saveMatchFeatureSnapshot: save
    }, "match_test", ML_PLACEHOLDER_MODEL_VERSION);

    expect(result.kind).toBe("ml_placeholder");
    expect(result.prediction.teamAProbability).toBe(50);
    expect(result.prediction.teamBProbability).toBe(50);
    expect(result.prediction.confidenceScore).toBe(0);
    expect(result.prediction.modelVersion).toBe(ML_PLACEHOLDER_MODEL_VERSION);
    expect(save).not.toHaveBeenCalled();
  });

  it("creates a snapshot for ML placeholder when none exists", async () => {
    const save = vi.fn(async () => ({ id: "snapshot_new", matchId: "match_test" }));
    const result = await getPredictionForMatchWithDeps({
      buildPredictionInput: vi.fn(),
      calculatePrediction,
      getLatestFeatureSnapshot: async () => null,
      saveMatchFeatureSnapshot: save as never
    }, "match_test", ML_PLACEHOLDER_MODEL_VERSION);

    if (result.kind !== "ml_placeholder") throw new Error("Expected ML placeholder result.");
    expect(result.prediction.featureSnapshotId).toBe("snapshot_new");
    expect(save).toHaveBeenCalledWith("match_test");
  });
});
