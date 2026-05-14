import type { RiskLevel } from "@/lib/predictionEngine";

const labels: Record<RiskLevel, string> = {
  Low: "низкий",
  Medium: "средний",
  High: "высокий"
};

export function RiskBadge({ value }: { value: RiskLevel }) {
  const tone =
    value === "Low"
      ? "border-lab-green bg-lab-green/10 text-lab-green"
      : value === "Medium"
        ? "border-lab-amber bg-lab-amber/10 text-lab-amber"
        : "border-lab-red bg-lab-red/10 text-lab-red";
  return <span className={`rounded border px-2 py-1 text-xs font-medium ${tone}`}>Риск {labels[value]}</span>;
}
