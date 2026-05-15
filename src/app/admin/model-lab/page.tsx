import { SourceCoverageMatrix } from "@/components/SourceCoverageMatrix";
import { FEATURE_SCHEMA_VERSION, FEATURE_MODEL_VERSION } from "@/lib/features/matchFeatureSnapshot";
import { getCalibrationByReadiness } from "@/lib/modelLab/calibration";
import { calculateGlickoStyleUncertainty, calculateTrueSkillStylePlaceholder } from "@/lib/modelLab/ratings";
import { TRAINING_DATASET_COLUMNS } from "@/lib/modelLab/trainingDataset";
import { prisma } from "@/lib/prisma";
import { buildSourceCoverageMatrix } from "@/lib/sourceCoverageMatrix";
import { getSourceStatuses } from "@/lib/sources/sourceHealth";

export const dynamic = "force-dynamic";

export default async function ModelLabPage() {
  const [snapshots, calibration, statuses, leakageSummary] = await Promise.all([
    prisma.matchFeatureSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { match: { include: { teamA: true, teamB: true } } }
    }),
    getCalibrationByReadiness(),
    getSourceStatuses(),
    prisma.matchFeatureSnapshot.groupBy({ by: ["dataLeakageCheckPassed"], _count: { dataLeakageCheckPassed: true } })
  ]);
  const coverageRows = buildSourceCoverageMatrix(undefined, statuses);
  const lowSampleUncertainty = calculateGlickoStyleUncertainty({ matchesPlayed: 2, rosterStability: 0.35, isNewRoster: true });
  const stableUncertainty = calculateGlickoStyleUncertainty({ matchesPlayed: 42, rosterStability: 0.82 });
  const trueskillPlaceholder = calculateTrueSkillStylePlaceholder({ playerRatings: [{ rating: 1510, uncertainty: 95 }, { rating: 1545, uncertainty: 78 }] });

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm uppercase tracking-wide text-lab-cyan">MVP 0.6.1</p>
        <h1 className="text-2xl font-semibold text-white">Лаборатория модели</h1>
        <p className="mt-1 text-sm text-lab-muted">Снимки признаков, покрытие источников, калибровка готовности прогноза и экспорт датасета для обучения. Это исследовательский слой, не ML production.</p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Схема признаков" value={FEATURE_SCHEMA_VERSION} />
        <Stat label="Версия модели" value={FEATURE_MODEL_VERSION} />
        <Stat label="Снимки признаков" value={snapshots.length} />
        <Stat label="Колонки датасета" value={TRAINING_DATASET_COLUMNS.length} />
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Экспорт датасета для обучения CSV</h2>
            <p className="mt-1 text-sm text-lab-muted">Только завершённые матчи с winnerTeamId, без analyst_sample и без утечки данных. Включает уровень готовности, cutoff, версию модели и leakage flag.</p>
          </div>
          <a className="rounded border border-lab-cyan px-3 py-2 text-sm text-lab-cyan hover:bg-lab-cyan hover:text-black" href="/api/admin/model-lab/training-dataset">
            Экспорт CSV
          </a>
        </div>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Offline research datasets</h2>
        <p className="mt-1 text-sm text-lab-muted">
          Эти источники предназначены только для research/calibration после проверки лицензии. Они не являются live forecast source и не могут поднимать Real Forecast Ready.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {[
            "Kaggle CS:GO Professional Matches",
            "CS:GO top20 matches datasets",
            "Historical demo/stat exports"
          ].map((name) => (
            <article key={name} className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
              <h3 className="font-medium text-white">{name}</h3>
              <p className="mt-2">Назначение: training/calibration only.</p>
              <p className="mt-1 text-lab-amber">License check required. Not live forecast source.</p>
            </article>
          ))}
        </div>
      </section>

      <SourceCoverageMatrix rows={coverageRows} />

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Таблица снимков признаков</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-lab-muted">
              <tr>
                <th className="py-2 pr-3">Матч</th>
                <th>Готовность</th>
                <th>Качество данных</th>
                <th>Cutoff</th>
                <th>Elo diff</th>
                <th>Rank diff</th>
                <th>Map/Veto</th>
                <th>Утечка данных</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lab-border text-lab-muted">
              {snapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td className="py-2 pr-3 text-white">{snapshot.match.teamA.name} vs {snapshot.match.teamB.name}</td>
                  <td>{snapshot.readinessLevel}</td>
                  <td>{Math.round(snapshot.dataQualityScore)}</td>
                  <td>{snapshot.featureCutoffTime.toISOString().slice(0, 10)}</td>
                  <td>{snapshot.internalEloDiff.toFixed(1)}</td>
                  <td>{snapshot.valveRankDiff.toFixed(1)}</td>
                  <td>{snapshot.mapPoolAdvantage.toFixed(2)} / {snapshot.vetoAdvantage.toFixed(2)}</td>
                  <td className={snapshot.dataLeakageCheckPassed ? "text-lab-green" : "text-lab-red"}>{snapshot.dataLeakageCheckPassed ? "нет" : "есть"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Калибровка по готовности прогноза</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          {calibration.map((row) => (
            <article key={row.readinessLevel} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <h3 className="font-medium text-white">{row.readinessLevel}</h3>
              {row.sampleSize === 0 ? (
                <p className="mt-2 text-sm text-lab-muted">{row.message}</p>
              ) : (
                <dl className="mt-2 space-y-1 text-sm text-lab-muted">
                  <div><dt>Выборка</dt><dd className="text-white">{row.sampleSize}</dd></div>
                  <div><dt>Accuracy</dt><dd className="text-white">{Math.round((row.accuracy ?? 0) * 100)}%</dd></div>
                  <div><dt>Brier</dt><dd className="text-white">{row.brierScore?.toFixed(3)}</dd></div>
                  <div><dt>Log loss</dt><dd className="text-white">{row.logLoss?.toFixed(3)}</dd></div>
                  <div><dt>ECE placeholder</dt><dd className="text-white">{row.ece?.toFixed(3)}</dd></div>
                </dl>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-lab-border bg-lab-panel p-4">
          <h2 className="font-semibold text-white">Сводка по утечке данных</h2>
          <div className="mt-3 space-y-2 text-sm text-lab-muted">
            {leakageSummary.map((row) => <p key={String(row.dataLeakageCheckPassed)}>{row.dataLeakageCheckPassed ? "Без утечки" : "Есть утечка"}: {row._count.dataLeakageCheckPassed}</p>)}
          </div>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel p-4">
          <h2 className="font-semibold text-white">Слой модели</h2>
          <ul className="mt-3 space-y-2 text-sm text-lab-muted">
            <li>Internal Elo: реально пересчитывается после finished matches.</li>
            <li>Glicko-style uncertainty: эвристика. New/low-sample RD {lowSampleUncertainty.ratingDeviation}, stable RD {stableUncertainty.ratingDeviation}.</li>
            <li>TrueSkill-style placeholder: структура будущей модели, teamSkill {trueskillPlaceholder.teamSkill}, uncertainty {trueskillPlaceholder.uncertainty}.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel p-3">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className="mt-1 break-all text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

