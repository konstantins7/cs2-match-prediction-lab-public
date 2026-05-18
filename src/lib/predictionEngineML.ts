import { ML_PLACEHOLDER_MODEL_VERSION } from "./modelVersions";

export type MlFeatureSnapshotInput = {
  id: string;
  matchId: string;
};

export function calculatePredictionML(featureSnapshot: MlFeatureSnapshotInput) {
  return {
    matchId: featureSnapshot.matchId,
    featureSnapshotId: featureSnapshot.id,
    teamAProbability: 50,
    teamBProbability: 50,
    confidenceScore: 0,
    modelVersion: ML_PLACEHOLDER_MODEL_VERSION,
    explanation: "ML model not yet trained"
  };
}
