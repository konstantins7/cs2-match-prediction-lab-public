import { getLatestFeatureSnapshot, saveMatchFeatureSnapshot } from "./features/matchFeatureSnapshot";
import { ML_PLACEHOLDER_MODEL_VERSION, RULE_BASED_MODEL_VERSION } from "./modelVersions";
import { buildPredictionInput, calculatePrediction } from "./predictionEngine";
import { calculatePredictionML } from "./predictionEngineML";

export type SupportedPredictionModel = typeof RULE_BASED_MODEL_VERSION | typeof ML_PLACEHOLDER_MODEL_VERSION;

type ModelRouterDeps = {
  buildPredictionInput: typeof buildPredictionInput;
  calculatePrediction: typeof calculatePrediction;
  getLatestFeatureSnapshot: typeof getLatestFeatureSnapshot;
  saveMatchFeatureSnapshot: typeof saveMatchFeatureSnapshot;
};

const defaultDeps: ModelRouterDeps = {
  buildPredictionInput,
  calculatePrediction,
  getLatestFeatureSnapshot,
  saveMatchFeatureSnapshot
};

export async function getPredictionForMatch(matchId: string, modelName: SupportedPredictionModel = RULE_BASED_MODEL_VERSION) {
  return getPredictionForMatchWithDeps(defaultDeps, matchId, modelName);
}

export async function getPredictionForMatchWithDeps(deps: ModelRouterDeps, matchId: string, modelName: SupportedPredictionModel = RULE_BASED_MODEL_VERSION) {
  if (modelName === RULE_BASED_MODEL_VERSION) {
    const input = await deps.buildPredictionInput(matchId);
    return {
      modelName,
      kind: "rule_based" as const,
      prediction: deps.calculatePrediction(input)
    };
  }

  if (modelName === ML_PLACEHOLDER_MODEL_VERSION) {
    const snapshot = (await deps.getLatestFeatureSnapshot(matchId)) ?? (await deps.saveMatchFeatureSnapshot(matchId));
    return {
      modelName,
      kind: "ml_placeholder" as const,
      prediction: calculatePredictionML(snapshot)
    };
  }

  throw new Error(`Unsupported prediction model: ${String(modelName)}`);
}
