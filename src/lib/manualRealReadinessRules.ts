export const MANUAL_REAL_MAP_SAMPLE_THRESHOLD = 7;

export function manualRealMapSampleWarning(teamName: string, sample: number, threshold = MANUAL_REAL_MAP_SAMPLE_THRESHOLD) {
  return `${teamName} map sample is ${sample}/${threshold}; final readiness remains blocked until more real map stats are provided.`;
}
