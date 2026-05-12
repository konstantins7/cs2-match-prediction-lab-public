import type { VetoScenario } from "@/lib/predictionEngine";

export function VetoScenarioCard({ scenario }: { scenario: VetoScenario }) {
  return (
    <article className="rounded border border-lab-border bg-lab-panel p-4">
      <h3 className="font-semibold text-white">{scenario.name}</h3>
      <dl className="mt-3 grid gap-2 text-sm text-lab-muted">
        <div className="flex justify-between gap-4"><dt>Likely bans</dt><dd>{scenario.likelyBans.join(", ")}</dd></div>
        <div className="flex justify-between gap-4"><dt>Likely picks</dt><dd>{scenario.likelyPicks.join(", ")}</dd></div>
        <div className="flex justify-between gap-4"><dt>Decider</dt><dd>{scenario.likelyDecider}</dd></div>
        <div className="flex justify-between gap-4"><dt>Map advantage</dt><dd>{scenario.mapAdvantage.toFixed(3)}</dd></div>
        <div className="flex justify-between gap-4"><dt>Confidence</dt><dd>{Math.round(scenario.vetoConfidence * 100)}%</dd></div>
      </dl>
      <p className="mt-3 text-sm text-lab-muted">{scenario.explanation}</p>
      <p className="mt-2 text-sm text-lab-amber">{scenario.hiddenDanger}</p>
    </article>
  );
}
