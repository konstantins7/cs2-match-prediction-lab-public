"use client";

import { useState } from "react";
import type { FullMatchAnalysisResult, FullMatchAnalysisStepStatus } from "@/lib/fullMatchAnalysis";

type ApiResponse = {
  ok: boolean;
  error?: string;
  result?: FullMatchAnalysisResult;
};

const modes = [
  { value: "fast", label: "Быстро" },
  { value: "deep", label: "Глубже" },
  { value: "max", label: "Максимум" }
] as const;

export function FullMatchAnalysisPanel({ matchId }: { matchId: string }) {
  const [mode, setMode] = useState<(typeof modes)[number]["value"]>("fast");
  const [savePrediction, setSavePrediction] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FullMatchAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "full_match_analysis", matchId, mode, savePrediction })
      });
      const json = (await response.json()) as ApiResponse;
      if (!json.ok || !json.result) throw new Error(json.error ?? "Полный анализ не удалось выполнить.");
      setResult(json.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Полный анализ не удалось выполнить.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="full-analysis" className="rounded border border-lab-cyan/50 bg-lab-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-lab-cyan">One-click analysis</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Полный анализ</h2>
          <p className="mt-2 max-w-3xl text-sm text-lab-muted">
            Проверяет матч через уже разрешённые источники и текущий cache. CSV/manual данные не применяются отсюда: они остаются только в отдельном Validate / Preview / Apply flow.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className="rounded bg-lab-cyan px-5 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Анализирую..." : "Полный анализ"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {modes.map((item) => (
          <label key={item.value} className={mode === item.value ? "rounded border border-lab-cyan bg-lab-cyan/10 px-3 py-1.5 text-sm text-white" : "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted"}>
            <input className="mr-2" type="radio" checked={mode === item.value} onChange={() => setMode(item.value)} />
            {item.label}
          </label>
        ))}
      </div>
      <label className="mt-3 flex max-w-3xl items-start gap-2 rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
        <input className="mt-1" type="checkbox" checked={savePrediction} onChange={(event) => setSavePrediction(event.target.checked)} />
        <span>
          Сохранить final предикт, если Real Forecast Ready=true. Если матч уже начался или final pick уже есть, система сохранит только AnalysisJob и не перезапишет исходный предикт.
        </span>
      </label>
      {error ? <p className="mt-3 text-sm text-lab-red">{error}</p> : null}
      {result ? <AnalysisResult result={result} /> : null}
    </section>
  );
}

function AnalysisResult({ result }: { result: FullMatchAnalysisResult }) {
  return (
    <div className="mt-5 space-y-4">
      <div className={result.resultState === "ready" ? "rounded border border-lab-green/50 bg-lab-green/10 p-4" : "rounded border border-lab-amber/50 bg-lab-amber/10 p-4"}>
        <h3 className={result.resultState === "ready" ? "font-semibold text-lab-green" : "font-semibold text-lab-amber"}>{result.message}</h3>
        <p className="mt-2 text-sm text-lab-muted">
          {result.forecast.teamAName}: {result.forecast.teamAProbability}% · {result.forecast.teamBName}: {result.forecast.teamBProbability}% · confidence {result.forecast.confidenceScore}/100 · risk {result.forecast.riskLevel}
        </p>
        {!result.forecast.realForecastReady ? (
          <>
            <p className="mt-2 font-medium text-white">Финальный прогноз пока не готов</p>
            <p className="mt-1 text-sm text-lab-muted">
              Лучший доступный preview показан, но финальный прогноз заблокирован existing Real Forecast gates.
            </p>
          </>
        ) : null}
      </div>

      <div className="rounded border border-lab-border bg-lab-panel2 p-4">
        <p className="text-xs uppercase text-lab-muted">Progress timeline</p>
        <ol className="mt-3 grid gap-2 md:grid-cols-2">
          {result.progressTimeline.map((step) => (
            <li key={step.id} className="rounded border border-lab-border bg-lab-panel p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white">{step.label}</span>
                <span className={statusClass(step.status)}>{statusLabel(step.status)}</span>
              </div>
              <p className="mt-1 text-sm text-lab-muted">{step.explanation}</p>
              {step.connectorResults?.length ? (
                <ul className="mt-2 space-y-1 text-xs text-lab-muted">
                  {step.connectorResults.slice(0, 4).map((connector) => (
                    <li key={`${step.id}-${connector.connectorId}`}>
                      {connector.label}: <span className="text-white">{connector.status}</span>
                      {connector.normalizedPayloadSummary ? ` · ${connector.normalizedPayloadSummary}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-lab-border bg-lab-panel2 p-4">
          <p className="text-xs uppercase text-lab-muted">Главное следующее действие</p>
          <p className="mt-2 font-semibold text-white">{result.primaryNextAction.label}</p>
          <p className="mt-1 text-sm text-lab-muted">{result.primaryNextAction.reason}</p>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-4">
          <p className="text-xs uppercase text-lab-muted">Blockers</p>
          <ul className="mt-2 space-y-1 text-sm text-lab-muted">
            {(result.blockers.length ? result.blockers : ["Критичных blockers нет."]).slice(0, 6).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="rounded border border-lab-border bg-lab-panel2 p-4">
        <p className="text-xs uppercase text-lab-muted">Prediction lifecycle</p>
        <p className="mt-2 font-semibold text-white">{result.lifecycle.message}</p>
        <p className="mt-1 text-sm text-lab-muted">
          AnalysisJob: {result.lifecycle.analysisJobId}
          {result.lifecycle.predictionPickId ? ` · PredictionPick: ${result.lifecycle.predictionPickId}` : ""}
          {result.lifecycle.existingPredictionPickId ? ` · Existing final pick: ${result.lifecycle.existingPredictionPickId}` : ""}
        </p>
      </div>

      <details className="rounded border border-lab-border bg-lab-panel2 p-4">
        <summary className="cursor-pointer font-medium text-lab-cyan">Data gap resolver</summary>
        <div className="mt-3 grid gap-3 text-sm text-lab-muted lg:grid-cols-2">
          <div>
            <p className="text-white">Missing blocks</p>
            <p className="mt-1">{result.dataGapResolution.missingBlocks.join(", ") || "none"}</p>
          </div>
          <div>
            <p className="text-white">Still missing</p>
            <p className="mt-1">{result.dataGapResolution.stillMissing.join(", ") || "none"}</p>
          </div>
          <div>
            <p className="text-white">Attempted resolvers</p>
            <p className="mt-1">{result.dataGapResolution.attemptedResolvers.join(", ") || "none"}</p>
          </div>
          <div>
            <p className="text-white">Trusted local imports</p>
            <p className="mt-1">{result.dataGapResolution.trustedLocalImportsEnabled ? "enabled" : "disabled / preview-only"}</p>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs text-lab-muted">
            <thead className="uppercase">
              <tr><th className="py-2">Connector</th><th>Status</th><th>Records</th><th>Summary</th></tr>
            </thead>
            <tbody className="divide-y divide-lab-border">
              {result.dataGapResolution.connectorResults.map((connector) => (
                <tr key={connector.connectorId}>
                  <td className="py-2 text-white">{connector.label}</td>
                  <td>{connector.status}</td>
                  <td>{connector.recordsCreated + connector.recordsUpdated}</td>
                  <td>{connector.normalizedPayloadSummary ?? connector.blockers[0] ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-lab-border bg-lab-panel2 p-4">
          <p className="text-xs uppercase text-lab-muted">Top factors</p>
          <ul className="mt-2 space-y-2 text-sm text-lab-muted">
            {result.forecast.topFactors.map((factor) => (
              <li key={factor.factorName}>
                <span className="text-white">{factor.factorName}</span> · impact {factor.impact.toFixed(2)} · {factor.explanation}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-4">
          <p className="text-xs uppercase text-lab-muted">Map / veto summary</p>
          <p className="mt-2 text-sm text-lab-muted">{result.forecast.mapVetoSummary}</p>
          {result.forecast.warnings.length ? (
            <ul className="mt-3 space-y-1 text-sm text-lab-amber">
              {result.forecast.warnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
        </div>
      </div>

      <details className="rounded border border-lab-border bg-lab-panel2 p-4">
        <summary className="cursor-pointer font-medium text-lab-cyan">Advanced details</summary>
        <div className="mt-3 grid gap-3 text-sm text-lab-muted md:grid-cols-2">
          <p>Forecastability: {result.forecast.forecastabilityLabel} · coverage {result.forecast.coverageScore}/100</p>
          <p>Readiness: {result.forecast.readinessLevel}</p>
          <p>Prepare: {result.prepare.before.readiness} → {result.prepare.after.readiness}</p>
          <p>Prediction audit: {result.prepare.predictionAuditId}</p>
        </div>
      </details>
    </div>
  );
}

function statusLabel(status: FullMatchAnalysisStepStatus) {
  if (status === "success") return "ok";
  if (status === "partial") return "partial";
  if (status === "blocked") return "blocked";
  if (status === "error") return "error";
  return "missing";
}

function statusClass(status: FullMatchAnalysisStepStatus) {
  if (status === "success") return "text-lab-green";
  if (status === "partial") return "text-lab-amber";
  if (status === "blocked") return "text-lab-red";
  if (status === "error") return "text-lab-red";
  return "text-lab-muted";
}
