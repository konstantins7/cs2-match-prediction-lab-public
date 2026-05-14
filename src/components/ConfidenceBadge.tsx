export function ConfidenceBadge({ value }: { value: number }) {
  const tone = value >= 70 ? "border-lab-green text-lab-green" : value >= 55 ? "border-lab-amber text-lab-amber" : "border-lab-red text-lab-red";
  return <span className={`rounded border px-2 py-1 text-xs font-medium ${tone}`}>Уверенность {value}/100</span>;
}
