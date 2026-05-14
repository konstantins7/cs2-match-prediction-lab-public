"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ForecastAutopilotMode, ForecastAutopilotResult } from "@/lib/autoResearchShared";

type ApiResponse = {
  ok: boolean;
  error?: string;
  result?: ForecastAutopilotResult;
};

const modes: Array<{ value: ForecastAutopilotMode; label: string; description: string }> = [
  { value: "fast", label: "Быстро", description: "Только auto free sources." },
  { value: "deeper", label: "Глубже", description: "Free + подключённые API." },
  { value: "max", label: "Максимум", description: "Auto + API + wizard/manual/parsed demo." }
];

export function ForecastAutopilotButton({ matchId, compact = false }: { matchId?: string; compact?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<ForecastAutopilotMode>("fast");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ForecastAutopilotResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forecast_autopilot", mode, matchId })
      });
      const json = await response.json() as ApiResponse;
      if (!json.ok || !json.result) throw new Error(json.error ?? "Autopilot не смог подготовить прогноз.");
      setResult(json.result);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Autopilot не смог подготовить прогноз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={compact ? "rounded border border-lab-border bg-lab-panel2 p-4" : "rounded border border-lab-cyan/40 bg-lab-panel p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-lab-cyan">Forecast Autopilot</p>
          <h2 className="mt-1 font-semibold text-white">Получить лучший возможный прогноз сейчас</h2>
          <p className="mt-1 text-sm text-lab-muted">Режим “не парюсь”: сайт сам обновит доступное, проверит источники и покажет одно главное действие.</p>
        </div>
        <button type="button" disabled={busy} onClick={run} className="rounded bg-lab-cyan px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">
          {busy ? "Готовлю прогноз..." : "Получить лучший возможный прогноз сейчас"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {modes.map((item) => (
          <label key={item.value} className={mode === item.value ? "rounded border border-lab-cyan bg-lab-panel p-3" : "rounded border border-lab-border bg-lab-panel2 p-3"}>
            <input className="mr-2" type="radio" name={`autopilot-mode-${matchId ?? "global"}`} value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)} />
            <span className="text-sm font-medium text-white">{item.label}</span>
            <p className="mt-1 text-xs text-lab-muted">{item.description}</p>
          </label>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-lab-red">{error}</p> : null}
      {result ? (
        <div className="mt-4 rounded border border-lab-border bg-lab-panel2 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">{result.message}</p>
              <p className="mt-1 text-xs text-lab-muted">Mode: {result.mode} · state: {result.state} · readiness: {result.readinessLevel ?? "summary"}</p>
            </div>
            <Link href={withMatch(result.primaryAction.href, matchId)} className="rounded bg-lab-cyan px-3 py-2 text-sm font-semibold text-black">
              {result.primaryAction.label}
            </Link>
          </div>
          <p className="mt-2 text-sm text-lab-muted">{result.primaryAction.reason}</p>
          {result.secondaryActions.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {result.secondaryActions.slice(0, 2).map((action) => (
                <Link key={action.label} href={withMatch(action.href, matchId)} className="rounded border border-lab-border px-2 py-1 text-xs text-lab-cyan hover:border-lab-cyan">
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Panel title="Автоматически удалось" items={result.succeeded} />
            <Panel title="Ещё не хватает" items={result.unavailable} />
          </div>
          <div className="mt-3 rounded border border-lab-border p-3">
            <p className="text-xs uppercase text-lab-muted">Где взять данные</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {result.sourceSuggestions.slice(0, 4).map((suggestion) => (
                <div key={suggestion.label} className="text-xs text-lab-muted">
                  <span className="text-white">{suggestion.label}:</span> {suggestion.sources.join(" · ")}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-lab-border p-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-lab-muted">
        {items.slice(0, 6).map((item) => <li key={`${title}-${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

function withMatch(href: string, matchId?: string) {
  if (!matchId || !href.startsWith("/admin/research-queue")) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}matchId=${encodeURIComponent(matchId)}`;
}
