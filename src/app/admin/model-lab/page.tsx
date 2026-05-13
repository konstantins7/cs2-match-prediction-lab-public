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
        <p className="text-sm uppercase tracking-wide text-lab-cyan">MVP 0.4.1</p>
        <h1 className="text-2xl font-semibold text-white">Model Lab</h1>
        <p className="mt-1 text-sm text-lab-muted">Feature store, source coverage, readiness calibration и экспорт training dataset. Это исследовательский слой, не ML production.</p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Feature schema" value={FEATURE_SCHEMA_VERSION} />
        <Stat label="Model version" value={FEATURE_MODEL_VERSION} />
        <Stat label="Snapshots" value={snapshots.length} />
        <Stat label="Dataset columns" value={TRAINING_DATASET_COLUMNS.length} />
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Export training dataset CSV</h2>
            <p className="mt-1 text-sm text-lab-muted">Только finished matches с winnerTeamId, без analyst_sample, без leakage. Включает readinessLevel, cutoff, modelVersion и leakage flag.</p>
          </div>
          <a className="rounded border border-lab-cyan px-3 py-2 text-sm text-lab-cyan hover:bg-lab-cyan hover:text-black" href="/api/admin/model-lab/training-dataset">
            Export CSV
          </a>
        </div>
      </section>

      <SourceCoverageMatrix rows={coverageRows} />

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Feature Snapshot table</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-lab-muted">
              <tr>
                <th className="py-2 pr-3">Match</th>
                <th>Readiness</th>
                <th>DQ</th>
                <th>Cutoff</th>
                <th>Elo diff</th>
                <th>Rank diff</th>
                <th>Map/Veto</th>
                <th>Leakage</th>
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
                  <td className={snapshot.dataLeakageCheckPassed ? "text-lab-green" : "text-lab-red"}>{snapshot.dataLeakageCheckPassed ? "passed" : "failed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Calibration by readiness</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          {calibration.map((row) => (
            <article key={row.readinessLevel} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <h3 className="font-medium text-white">{row.readinessLevel}</h3>
              {row.sampleSize === 0 ? (
                <p className="mt-2 text-sm text-lab-muted">{row.message}</p>
              ) : (
                <dl className="mt-2 space-y-1 text-sm text-lab-muted">
                  <div><dt>Sample</dt><dd className="text-white">{row.sampleSize}</dd></div>
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
          <h2 className="font-semibold text-white">Data leakage summary</h2>
          <div className="mt-3 space-y-2 text-sm text-lab-muted">
            {leakageSummary.map((row) => <p key={String(row.dataLeakageCheckPassed)}>{row.dataLeakageCheckPassed ? "Passed" : "Failed"}: {row._count.dataLeakageCheckPassed}</p>)}
          </div>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel p-4">
          <h2 className="font-semibold text-white">Model layer</h2>
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
