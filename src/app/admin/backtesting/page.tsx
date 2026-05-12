import { BacktestSummary } from "@/components/BacktestSummary";
import { runMockBacktest } from "@/lib/backtesting";

export const dynamic = "force-dynamic";

export default async function BacktestingPage() {
  const result = await runMockBacktest();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Backtesting</h1>
        <p className="mt-1 text-sm text-lab-muted">Mock backtesting прогоняет finished matches через calculatePrediction, без статичных процентов.</p>
      </div>
      <BacktestSummary result={result} />
    </div>
  );
}
