import Link from "next/link";
import { DataQualityProblemMatchesPanel } from "@/components/DataQualityProblemMatchesPanel";
import { SourceModeBadge } from "@/components/SourceModeBadge";
import { getCalculatedMatches } from "@/lib/data/matches";
import { buildDataQualityDashboardSummary } from "@/lib/dataQualityDashboard";
import { getHiddenProFocusReasons } from "@/lib/proFocusCoverage";
import { getResearchQueueRows, summarizeResearchQueue } from "@/lib/researchQueue";

export const dynamic = "force-dynamic";

export default async function DataQualityPage() {
  const [rows, hidden, researchRows, qualitySummary] = await Promise.all([
    getCalculatedMatches({ limit: 30, focus: "all" }),
    getHiddenProFocusReasons(),
    getResearchQueueRows(80),
    buildDataQualityDashboardSummary()
  ]);
  const sorted = rows.sort((a, b) => a.prediction.dataQualityScore - b.prediction.dataQualityScore);
  const researchSummary = summarizeResearchQueue(researchRows);
  const groups = [
    ["Только базовые данные", rows.filter((row) => row.prediction.probabilityCap?.reasons.some((reason) => reason.includes("Fixture-only"))).length],
    ["Нет рейтинга", rows.filter((row) => row.prediction.warnings.some((warning) => warning.includes("unranked") || warning.includes("ranking baseline"))).length],
    ["Нет формы команды", rows.filter((row) => row.prediction.warnings.some((warning) => warning.includes("Нет свежей формы"))).length],
    ["Нет состава", rows.filter((row) => row.prediction.riskBreakdown.missingData.some((item) => item.includes("player roster"))).length],
    ["Нет player stats", rows.filter((row) => row.prediction.warnings.some((warning) => warning.toLowerCase().includes("player"))).length],
    ["Нет map/veto", rows.filter((row) => row.prediction.warnings.some((warning) => warning.toLowerCase().includes("map") || warning.toLowerCase().includes("veto"))).length],
    ["Нет H2H", rows.filter((row) => row.prediction.warnings.some((warning) => warning.includes("H2H"))).length],
    ["Конфликт источников", rows.filter((row) => row.prediction.warnings.some((warning) => warning.includes("sourceConflict"))).length],
    ["Нужно проверить", rows.filter((row) => row.match.needsReview).length]
  ] as const;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Качество данных</h1>
        <p className="mt-1 text-sm text-lab-muted">Показывает матчи с малым sample, unknown veto, news uncertainty и низким confidence.</p>
      </div>
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Data quality foundation</h2>
            <p className="mt-1 text-sm text-lab-muted">Source coverage, saved picks, blockers and private inbox validation.</p>
          </div>
          <p className="text-xs text-lab-muted">Generated {new Date(qualitySummary.generatedAt).toLocaleString("ru-RU")}</p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <SummaryStat label="Final picks" value={qualitySummary.predictionPicks.totalFinal} />
          <SummaryStat label="Real Forecast Ready" value={qualitySummary.predictionPicks.realForecastReady} />
          <SummaryStat label="Inbox files" value={qualitySummary.privateInbox.filesFound} />
          <SummaryStat label="Validation failed" value={qualitySummary.privateInbox.validationFailed} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <QualityTable title="Source coverage" rows={qualitySummary.sourceCounts.slice(0, 12).map((row) => ({
            label: `${row.dataType} · ${row.sourceMode}`,
            value: row.count,
            detail: row.source
          }))} />
          <QualityTable title="Prediction pick status" rows={[
            ...qualitySummary.predictionPicks.byStatus.map((row) => ({ label: row.status, value: row.count })),
            ...qualitySummary.predictionPicks.bySourceBucket.map((row) => ({ label: row.sourceBucket, value: row.count, detail: "source bucket" }))
          ]} />
          <QualityTable title="Top blockers" rows={qualitySummary.topBlockers.slice(0, 10).map((row) => ({
            label: row.blocker,
            value: row.count
          }))} />
        </div>
      </section>
      <DataQualityProblemMatchesPanel />
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Группы проблем покрытия</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {groups.map(([label, count]) => (
            <div key={label} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <p className="text-xs uppercase text-lab-muted">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{count}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Сводка задач по прогнозам</h2>
            <p className="mt-1 text-sm text-lab-muted">Матчи ниже L3 Analytical и общий объём ручного добора данных.</p>
          </div>
          <Link href="/admin/research-queue" className="text-sm text-lab-cyan">Открыть задачи по прогнозам</Link>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <SummaryStat label="Ниже аналитического" value={researchSummary.matchesBelowAnalytical} />
          <SummaryStat label="Всего задач" value={researchSummary.tasksTotal} />
          <SummaryStat label="Высокий приоритет" value={researchSummary.highPriority} />
          <SummaryStat label="Заблокировано" value={researchSummary.blocked} />
        </div>
      </section>
      <div className="grid gap-3">
        {sorted.map(({ match, prediction }) => (
          <article key={match.id} className="rounded border border-lab-border bg-lab-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">{match.teamA.name} vs {match.teamB.name}</h2>
                <p className="mt-1 text-sm text-lab-muted">{match.eventName} · DQ {prediction.dataQualityScore}/100 · confidence {prediction.confidenceScore}/100</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SourceModeBadge sourceMode={match.sourceMode} needsReview={match.needsReview} />
                <Link href={`/match/${match.id}`} className="text-sm text-lab-cyan">Разбор</Link>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-lab-amber">
              {(prediction.riskBreakdown.missingData.length ? prediction.riskBreakdown.missingData : ["Mock data достаточно полные для MVP."]).slice(0, 4).map((item, index) => <li key={`${match.id}-missing-${index}`}>{item}</li>)}
              {prediction.warnings.filter((warning) => warning.includes("sourceConflict")).map((warning, index) => <li key={`${match.id}-conflict-${index}`}>{warning}</li>)}
            </ul>
          </article>
        ))}
      </div>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Почему матч скрыт из Pro Focus?</h2>
        <div className="mt-3 grid gap-3">
          {hidden.length === 0 ? <p className="text-sm text-lab-muted">Скрытых real матчей сейчас нет.</p> : hidden.map((row) => (
            <article key={row.id} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-white">{row.label}</h3>
                  <p className="mt-1 text-sm text-lab-muted">{row.eventName} · {row.visibilityTier} · score {row.priorityScore}</p>
                </div>
                <SourceModeBadge sourceMode={row.sourceMode} />
              </div>
              <ul className="mt-2 space-y-1 text-sm text-lab-amber">
                {(row.hiddenReasons.length ? row.hiddenReasons : ["hidden by low Pro Focus score"]).map((reason, index) => <li key={`${row.id}-${index}`}>{reason}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel2 p-3">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function QualityTable({ title, rows }: { title: string; rows: Array<{ label: string; value: number; detail?: string }> }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel2 p-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? <p className="text-sm text-lab-muted">No rows yet.</p> : rows.map((row) => (
          <div key={`${title}-${row.label}-${row.detail ?? ""}`} className="flex items-start justify-between gap-3 border-b border-lab-border/60 pb-2 last:border-b-0 last:pb-0">
            <div>
              <p className="text-sm text-white">{row.label}</p>
              {row.detail ? <p className="text-xs text-lab-muted">{row.detail}</p> : null}
            </div>
            <p className="text-sm font-semibold text-lab-cyan">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
