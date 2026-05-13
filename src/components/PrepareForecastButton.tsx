"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PrepareResult = {
  ok: boolean;
  result?: {
    message: string;
    after: { realForecastReady: boolean; readiness: string; dataQualityScore: number; confidenceScore: number };
    nextActions: string[];
  };
  error?: string;
};

export function PrepareForecastButton({ matchId, variant = "primary" }: { matchId: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actions, setActions] = useState<string[]>([]);

  async function run() {
    setBusy(true);
    setMessage("Готовлю прогноз по выбранному матчу...");
    setActions([]);
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare_match", matchId })
      });
      const json = (await response.json()) as PrepareResult;
      if (!json.ok || !json.result) throw new Error(json.error ?? "Не удалось подготовить прогноз.");
      setMessage(json.result.message);
      setActions(json.result.nextActions);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось подготовить прогноз.");
    } finally {
      setBusy(false);
    }
  }

  const className =
    variant === "primary"
      ? "rounded bg-lab-cyan px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
      : "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-cyan hover:border-lab-cyan disabled:opacity-60";

  return (
    <div className="space-y-2">
      <button type="button" disabled={busy} onClick={run} className={className}>
        {busy ? "Готовлю прогноз..." : "Подготовить прогноз"}
      </button>
      {message && (
        <div className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
          <p className="text-white">{message}</p>
          {actions.length > 0 && (
            <ul className="mt-2 space-y-1">
              {actions.map((action, index) => <li key={`${action}-${index}`}>Дальше: {action}</li>)}
            </ul>
          )}
          <button type="button" onClick={() => router.refresh()} className="mt-2 text-lab-cyan">
            Обновить страницу
          </button>
        </div>
      )}
    </div>
  );
}
