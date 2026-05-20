export type BacktestResult = {
  scope?: string;
  model?: string;
  testedMatches: number;
  correctPredictions: number;
  accuracy: number;
  brierScore: number;
  logLoss: number;
  averageConfidence: number;
  calibrationBuckets: Array<{ bucket: string; matches: number; accuracy: number; avgConfidence: number }>;
  errorBreakdown: Array<{ label: string; count: number; note: string }>;
};

export function BacktestSummary({ result }: { result: BacktestResult }) {
  if (result.testedMatches === 0) {
    return (
      <div className="rounded border border-lab-border bg-lab-panel p-4">
        {result.scope && <h2 className="text-lg font-semibold text-white">{scopeLabel(result.scope)}{result.model ? ` · ${modelLabel(result.model)}` : ""}</h2>}
        <p className="mt-2 text-sm text-lab-amber">Недостаточно матчей для backtesting в этом scope.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {result.scope && <h2 className="text-lg font-semibold text-white">{scopeLabel(result.scope)}{result.model ? ` · ${modelLabel(result.model)}` : ""}</h2>}
      <div className="grid gap-3 md:grid-cols-6">
        <Stat label="Tested" value={String(result.testedMatches)} />
        <Stat label="Correct" value={String(result.correctPredictions)} />
        <Stat label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} />
        <Stat label="Brier Score" value={result.brierScore.toFixed(3)} />
        <Stat label="Log loss" value={result.logLoss.toFixed(3)} />
        <Stat label="Avg confidence" value={`${Math.round(result.averageConfidence)}%`} />
      </div>
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Calibration buckets</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-lab-muted">
              <tr><th className="py-2">Bucket</th><th>Matches</th><th>Accuracy</th><th>Avg confidence</th></tr>
            </thead>
            <tbody className="divide-y divide-lab-border">
              {result.calibrationBuckets.map((bucket) => (
                <tr key={bucket.bucket}>
                  <td className="py-2">{bucket.bucket}</td>
                  <td>{bucket.matches}</td>
                  <td>{Math.round(bucket.accuracy * 100)}%</td>
                  <td>{Math.round(bucket.avgConfidence)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Ошибки модели</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {result.errorBreakdown.map((item) => (
            <div key={item.label} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <p className="font-medium text-white">{item.label}: {item.count}</p>
              <p className="mt-1 text-sm text-lab-muted">{item.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function scopeLabel(scope: string) {
  if (scope === "pro_focus") return "Pro Focus only";
  if (scope === "demo") return "Demo only";
  if (scope === "pandascore_fixtures") return "PandaScore fixtures-only";
  if (scope === "sample_dev_only") return "Sample/dev only";
  return "All matches";
}

function modelLabel(model: string) {
  if (model === "elo") return "Elo advisory";
  if (model === "bayesian_map") return "Bayesian maps";
  if (model === "weighted") return "Weighted advisory";
  if (model === "ensemble") return "Ensemble advisory";
  return "Rule-based";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel p-4">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
