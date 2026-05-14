import type { PredictionInput, PredictionOutput } from "@/lib/predictionEngine";

export function DataQualityPanel({ input, prediction }: { input: PredictionInput; prediction: PredictionOutput }) {
  const items = [
    ["Player stats", `${input.playerStatsA.length}/5 vs ${input.playerStatsB.length}/5`],
    ["Map stats", `${input.mapStatsA.length} vs ${input.mapStatsB.length}`],
    ["Veto patterns", `${input.vetoPatternsA.length} vs ${input.vetoPatternsB.length}`],
    ["Roster", `${input.rosterVersionA ? "known" : "unknown"} / ${input.rosterVersionB ? "known" : "unknown"}`],
    ["Opponent matchup", `${input.opponentMatchupA ? "known" : "partial"} / ${input.opponentMatchupB ? "known" : "partial"}`],
    ["Data windows", `${input.dataWindows.length} windows`],
    ["Source conflicts", `${input.sourceConflicts.length} needs review`],
    ["News", `${input.news.length} items`],
    ["Data quality", `${prediction.dataQualityScore}/100`]
  ];
  return (
    <div className="rounded border border-lab-border bg-lab-panel p-4">
      <h3 className="font-semibold text-white">Качество данных</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="rounded border border-lab-border bg-lab-panel2 p-3">
            <p className="text-xs uppercase text-lab-muted">{label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-1 text-sm text-lab-amber">
        {prediction.riskBreakdown.missingData.length > 0 ? prediction.riskBreakdown.missingData.map((item) => <li key={item}>{item}</li>) : <li>Критичных пропусков в mock data не обнаружено.</li>}
      </ul>
    </div>
  );
}
