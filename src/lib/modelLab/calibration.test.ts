import { describe, expect, it } from "vitest";
import { calculateCalibrationRows } from "./calibration";

describe("calibration by readiness", () => {
  it("handles empty readiness samples without showing zero accuracy", () => {
    const rows = calculateCalibrationRows([]);
    const l3 = rows.find((row) => row.readinessLevel === "L3_ANALYTICAL");

    expect(l3?.sampleSize).toBe(0);
    expect(l3?.accuracy).toBeNull();
    expect(l3?.message).toBe("Недостаточно матчей для оценки");
  });

  it("calculates Brier/log loss for populated readiness buckets", () => {
    const rows = calculateCalibrationRows([
      { readinessLevel: "L2_BASIC_PREDICTION", probabilityForPredictedWinner: 0.62, predictedCorrect: true },
      { readinessLevel: "L2_BASIC_PREDICTION", probabilityForPredictedWinner: 0.58, predictedCorrect: false }
    ]);
    const l2 = rows.find((row) => row.readinessLevel === "L2_BASIC_PREDICTION");

    expect(l2?.sampleSize).toBe(2);
    expect(l2?.accuracy).toBe(0.5);
    expect(l2?.brierScore).toBeGreaterThan(0);
    expect(l2?.logLoss).toBeGreaterThan(0);
    expect(l2?.ece).not.toBeNull();
  });
});
