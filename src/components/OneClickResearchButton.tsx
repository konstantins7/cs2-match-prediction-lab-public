"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GLOBAL_RESEARCH_PROGRESS_STEPS, type OneClickResult } from "@/lib/autoResearchShared";

type ApiResponse = {
  ok: boolean;
  error?: string;
  result?: OneClickResult;
};

const labels = [
  ["matches", "Матчей"],
  ["readyForecasts", "Готовых прогнозов"],
  ["basicPreview", "Basic preview"],
  ["needsManualData", "Матчей с нехваткой данных"],
  ["teamsWithRank", "Команд с рейтингом"]
] as const;

export function OneClickResearchButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState<OneClickResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setStepIndex(0);
    const timer = window.setInterval(() => {
      setStepIndex((value) => Math.min(value + 1, GLOBAL_RESEARCH_PROGRESS_STEPS.length - 2));
    }, 700);
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "one_click_global_refresh" })
      });
      const json = (await response.json()) as ApiResponse;
      if (!json.ok || !json.result) throw new Error(json.error ?? "Не удалось обновить данные.");
      setStepIndex(GLOBAL_RESEARCH_PROGRESS_STEPS.length - 1);
      setResult(json.result);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обновить данные.");
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <section className={compact ? "rounded border border-lab-border bg-lab-panel p-4" : "rounded border border-lab-cyan/40 bg-lab-panel p-5"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Обновить всё доступное автоматически</h2>
          <p className="mt-1 text-sm text-lab-muted">Запускает только бесплатные/basic источники и пересчёт. Deep data автоматически не появляется.</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className="rounded bg-lab-cyan px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? GLOBAL_RESEARCH_PROGRESS_STEPS[stepIndex] : "Обновить всё доступное автоматически"}
        </button>
      </div>
      {(busy || result || error) && (
        <div className="mt-4 rounded border border-lab-border bg-lab-panel2 p-3">
          {busy && (
            <ol className="grid gap-2 text-sm md:grid-cols-2">
              {GLOBAL_RESEARCH_PROGRESS_STEPS.map((step, index) => (
                <li key={step} className={index <= stepIndex ? "text-lab-cyan" : "text-lab-muted"}>
                  {index + 1}. {step}
                </li>
              ))}
            </ol>
          )}
          {error && <p className="text-sm text-lab-red">{error}</p>}
          {result && (
            <div className="space-y-3">
              <p className="text-sm text-lab-green">Готово. Данные страницы обновлены через router.refresh().</p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                {labels.map(([key, label]) => (
                  <DiffStat key={key} label={label} before={result.summary.before[key]} after={result.summary.after[key]} />
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <SmallStat label="Матчей обновлено" value={result.summary.updatedMatches} />
                <SmallStat label="Новых матчей" value={result.summary.newMatches} />
                <SmallStat label="Прогнозов пересчитано" value={result.summary.predictionsRecalculated} />
              </div>
              {result.summary.sourceIssues.length > 0 && (
                <div className="rounded border border-lab-amber/60 p-3">
                  <p className="text-sm font-medium text-lab-amber">Источники не обновились</p>
                  <ul className="mt-2 space-y-1 text-sm text-lab-muted">
                    {result.summary.sourceIssues.map((issue, index) => (
                      <li key={`${issue.source}-${index}`}>{issue.source}: {issue.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button type="button" onClick={() => router.refresh()} className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-cyan hover:border-lab-cyan">
                Обновить страницу
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DiffStat({ label, before, after }: { label: string; before: number; after: number }) {
  return (
    <div className="rounded border border-lab-border px-3 py-2">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className="mt-1 text-sm text-white">{before} → {after}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-lab-border px-3 py-2">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  );
}
