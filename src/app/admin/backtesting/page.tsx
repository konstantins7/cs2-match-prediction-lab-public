import { BacktestSummary } from "@/components/BacktestSummary";
import { runMockBacktest, type BacktestModel } from "@/lib/backtesting";

export const dynamic = "force-dynamic";

const models: BacktestModel[] = ["rule_based", "elo", "bayesian_map", "weighted", "ensemble"];

export default async function BacktestingPage({ searchParams }: { searchParams: Promise<{ model?: string }> }) {
  const params = await searchParams;
  const model = models.includes(params.model as BacktestModel) ? params.model as BacktestModel : "rule_based";
  const [all, proFocus, demo, panda, sample] = await Promise.all([
    runMockBacktest("all", model),
    runMockBacktest("pro_focus", model),
    runMockBacktest("demo", model),
    runMockBacktest("pandascore_fixtures", model),
    runMockBacktest("sample_dev_only", model)
  ]);
  const csv = toCsv([proFocus, all, demo, panda, sample]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Backtesting</h1>
        <p className="mt-1 text-sm text-lab-muted">Backtesting прогоняет finished matches через calculatePrediction и разделяет Pro Focus, demo, PandaScore fixtures-only и sample/dev validation. Sample/dev data validates pipeline, not model accuracy.</p>
      </div>
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Advisory model comparison</h2>
        <p className="mt-1 text-sm text-lab-muted">Only this backtesting view changes model variants; saved predictions and calculatePrediction remain untouched.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {models.map((item) => (
            <a key={item} href={`/admin/backtesting?model=${item}`} className={item === model ? "rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black" : "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted"}>{item}</a>
          ))}
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download={`backtesting-${model}.csv`} className="rounded border border-lab-cyan px-3 py-1.5 text-sm text-lab-cyan">Export CSV</a>
        </div>
      </section>
      <BacktestSummary result={proFocus} />
      <BacktestSummary result={all} />
      <BacktestSummary result={demo} />
      <BacktestSummary result={panda} />
      <BacktestSummary result={sample} />
    </div>
  );
}

function toCsv(results: Awaited<ReturnType<typeof runMockBacktest>>[]) {
  const headers = ["scope", "model", "testedMatches", "accuracy", "brierScore", "logLoss", "averageConfidence"];
  const rows = results.map((result) => [
    result.scope ?? "",
    result.model ?? "",
    result.testedMatches,
    result.accuracy,
    result.brierScore,
    result.logLoss,
    result.averageConfidence
  ]);
  return `${headers.join(",")}\n${rows.map((row) => row.join(",")).join("\n")}\n`;
}
