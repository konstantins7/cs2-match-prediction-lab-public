import { describe, expect, it } from "vitest";
import { TRAINING_DATASET_COLUMNS } from "./trainingDataset";

describe("training dataset export schema", () => {
  it("includes raw ML foundation columns", () => {
    expect(TRAINING_DATASET_COLUMNS).toContain("teamA_avgPlayerRating");
    expect(TRAINING_DATASET_COLUMNS).toContain("teamB_avgPlayerRating");
    expect(TRAINING_DATASET_COLUMNS).toContain("teamA_totalMapsPlayed");
    expect(TRAINING_DATASET_COLUMNS).toContain("teamB_totalMapsPlayed");
  });
});
