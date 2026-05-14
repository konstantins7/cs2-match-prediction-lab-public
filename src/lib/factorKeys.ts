export function factorWarningKey(factorName: string, warning: string, index: number) {
  return `${factorName}-warning-${index}-${warning.slice(0, 32)}`;
}

export function factorEvidenceKey(factorName: string, evidence: { metric?: string; label?: string }, index: number) {
  return `${factorName}-evidence-${index}-${evidence.metric ?? evidence.label ?? "item"}`;
}
