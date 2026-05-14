export type FeatureSnapshotView = {
  id: string;
  readinessLevel: string;
  featureSchemaVersion: string;
  modelVersion: string;
  dataQualityScore: number;
  featureCutoffTime: string | Date;
  dataLeakageCheckPassed: boolean;
  missingCriticalDataJson: string;
  featureSourcesJson: string;
  sourceConfidence: number;
  sampleSizeScore: number;
  valveRankDiff: number;
  hltvManualRankDiff: number;
  internalEloDiff: number;
  recentWinRateDiff: number;
  avgPlayerRatingDiff: number;
  mapPoolAdvantage: number;
  vetoAdvantage: number;
  pistolAdvantage: number;
  forceBuyAdvantage: number;
  newsImpactDiff: number;
  createdAt: string | Date;
};

function parseJsonList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function topFeatures(snapshot: FeatureSnapshotView) {
  return [
    ["Valve rank diff", snapshot.valveRankDiff],
    ["HLTV manual rank diff", snapshot.hltvManualRankDiff],
    ["Internal Elo diff", snapshot.internalEloDiff],
    ["Recent winrate diff", snapshot.recentWinRateDiff],
    ["Avg player rating diff", snapshot.avgPlayerRatingDiff],
    ["Map pool advantage", snapshot.mapPoolAdvantage],
    ["Veto advantage", snapshot.vetoAdvantage],
    ["Pistol advantage", snapshot.pistolAdvantage],
    ["Force-buy advantage", snapshot.forceBuyAdvantage],
    ["News impact diff", snapshot.newsImpactDiff]
  ]
    .filter(([, value]) => Math.abs(Number(value)) > 0.001)
    .sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])))
    .slice(0, 8);
}

export function FeatureSnapshotPanel({ snapshot }: { snapshot?: FeatureSnapshotView | null }) {
  if (!snapshot) {
    return (
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Снимок признаков</h2>
        <p className="mt-2 text-sm text-lab-muted">Снимок признаков ещё не создан. Запустите snapshots/predictions pipeline или “Подготовить прогноз”.</p>
      </section>
    );
  }
  const missing = parseJsonList(snapshot.missingCriticalDataJson);
  const features = topFeatures(snapshot);
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Снимок признаков</h2>
          <p className="mt-1 text-sm text-lab-muted">Persistent feature store с cutoff, lineage и проверкой утечки данных.</p>
        </div>
        <span className={snapshot.dataLeakageCheckPassed ? "rounded border border-lab-green/60 px-2 py-1 text-xs text-lab-green" : "rounded border border-lab-red/60 px-2 py-1 text-xs text-lab-red"}>
          Утечка данных: {snapshot.dataLeakageCheckPassed ? "нет" : "есть"}
        </span>
      </div>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-4">
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">Схема</dt><dd className="mt-1 text-white">{snapshot.featureSchemaVersion}</dd></div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">Cutoff</dt><dd className="mt-1 text-white">{new Date(snapshot.featureCutoffTime).toLocaleString("ru-RU")}</dd></div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">Уверенность источников</dt><dd className="mt-1 text-white">{Math.round(snapshot.sourceConfidence * 100)}%</dd></div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">Оценка выборки</dt><dd className="mt-1 text-white">{Math.round(snapshot.sampleSizeScore * 100)}%</dd></div>
      </dl>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Главные признаки</h3>
          <div className="mt-2 space-y-2 text-sm text-lab-muted">
            {features.length ? features.map(([label, value]) => (
              <p key={label} className="flex justify-between gap-3 rounded border border-lab-border bg-lab-panel2 px-3 py-2">
                <span>{label}</span>
                <span className={Number(value) >= 0 ? "text-lab-green" : "text-lab-red"}>{Number(value).toFixed(3)}</span>
              </p>
            )) : <p>Нет ненулевых сигналов признаков.</p>}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Недостающие признаки</h3>
          <ul className="mt-2 space-y-2 text-sm text-lab-muted">
            {missing.length ? missing.slice(0, 10).map((item) => <li key={item}>{item}</li>) : <li>Критичных пропусков нет.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
