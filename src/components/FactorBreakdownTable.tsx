import { signed } from "@/lib/format";
import type { PredictionFactorOutput } from "@/lib/predictionEngine";

export function FactorBreakdownTable({ factors, teamAName, teamBName }: { factors: PredictionFactorOutput[]; teamAName: string; teamBName: string }) {
  return (
    <div className="overflow-x-auto rounded border border-lab-border bg-lab-panel">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-lab-panel2 text-xs uppercase text-lab-muted">
          <tr>
            <th className="px-3 py-3">Фактор</th>
            <th className="px-3 py-3">В пользу</th>
            <th className="px-3 py-3">Impact</th>
            <th className="px-3 py-3">Weight</th>
            <th className="px-3 py-3">Confidence</th>
            <th className="px-3 py-3">Explanation / Evidence / Warnings</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-lab-border">
          {factors.map((factor) => {
            const favored = factor.impact > 0 ? teamAName : factor.impact < 0 ? teamBName : "Нейтрально";
            return (
              <tr key={factor.factorName} className="align-top hover:bg-lab-panel2/60">
                <td className="px-3 py-3 font-medium text-white">{factor.factorName}</td>
                <td className="px-3 py-3 text-lab-muted">{favored}</td>
                <td className={factor.impact >= 0 ? "px-3 py-3 text-lab-green" : "px-3 py-3 text-lab-red"}>{signed(factor.impact)}</td>
                <td className="px-3 py-3">{factor.weight.toFixed(2)}</td>
                <td className="px-3 py-3">{Math.round(factor.confidence * 100)}%</td>
                <td className="max-w-xl px-3 py-3">
                  <p className="text-lab-muted">{factor.explanation}</p>
                  <div className="mt-2 space-y-1 text-xs text-lab-muted">
                    {factor.evidence.slice(0, 3).map((item) => (
                      <p key={`${factor.factorName}-${item.metric}`}>
                        <span className="text-lab-cyan">{item.metric}</span>: {item.note} Sample {item.sampleSize}; A {String(item.teamAValue)} / B {String(item.teamBValue)}
                      </p>
                    ))}
                    {factor.warnings.map((warning) => (
                      <p key={warning} className="text-lab-amber">{warning}</p>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
