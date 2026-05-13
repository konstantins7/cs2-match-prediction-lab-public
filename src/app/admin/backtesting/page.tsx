import { BacktestSummary } from "@/components/BacktestSummary";
import { runMockBacktest } from "@/lib/backtesting";

export const dynamic = "force-dynamic";

export default async function BacktestingPage() {
  const [all, proFocus, demo, panda, sample] = await Promise.all([
    runMockBacktest("all"),
    runMockBacktest("pro_focus"),
    runMockBacktest("demo"),
    runMockBacktest("pandascore_fixtures"),
    runMockBacktest("sample_dev_only")
  ]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Backtesting</h1>
        <p className="mt-1 text-sm text-lab-muted">Backtesting прогоняет finished matches через calculatePrediction и разделяет Pro Focus, demo, PandaScore fixtures-only и sample/dev validation. Sample/dev data validates pipeline, not model accuracy.</p>
      </div>
      <BacktestSummary result={proFocus} />
      <BacktestSummary result={all} />
      <BacktestSummary result={demo} />
      <BacktestSummary result={panda} />
      <BacktestSummary result={sample} />
    </div>
  );
}
