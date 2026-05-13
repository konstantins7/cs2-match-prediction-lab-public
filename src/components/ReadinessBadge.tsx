import type { PredictionReadinessLevel } from "@/lib/predictionEngine";
import { readinessBadgeRu } from "@/lib/russianLabels";

const labels: Record<PredictionReadinessLevel, string> = {
  L0_FIXTURE_ONLY: readinessBadgeRu.L0_FIXTURE_ONLY,
  L1_BASIC_CONTEXT: readinessBadgeRu.L1_BASIC_CONTEXT,
  L2_BASIC_PREDICTION: readinessBadgeRu.L2_BASIC_PREDICTION,
  L3_ANALYTICAL: readinessBadgeRu.L3_ANALYTICAL,
  L4_DEEP: readinessBadgeRu.L4_DEEP
};

const classes: Record<PredictionReadinessLevel, string> = {
  L0_FIXTURE_ONLY: "border-lab-red/60 text-lab-red",
  L1_BASIC_CONTEXT: "border-lab-amber/60 text-lab-amber",
  L2_BASIC_PREDICTION: "border-lab-cyan/60 text-lab-cyan",
  L3_ANALYTICAL: "border-lab-green/60 text-lab-green",
  L4_DEEP: "border-violet-400/60 text-violet-300"
};

export function ReadinessBadge({ level }: { level: PredictionReadinessLevel }) {
  return (
    <span className={`rounded border px-2 py-1 text-xs font-medium ${classes[level]}`}>
      {labels[level]}
    </span>
  );
}
