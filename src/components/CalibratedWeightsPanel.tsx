"use client";

import { useEffect, useState } from "react";

type State = {
  configured: boolean;
  sampleSize?: number;
  message: string;
};

export function CalibratedWeightsPanel() {
  const [state, setState] = useState<State>({ configured: false, message: "Checking calibrated weights..." });

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const response = await fetch("/api/admin/model/calibrated-weights");
    const json = await response.json() as { configured?: boolean; payload?: { sampleSize?: number } };
    setState({
      configured: Boolean(json.configured),
      sampleSize: json.payload?.sampleSize,
      message: json.configured ? "Calibrated weights file is available for preview." : "Using default model weights."
    });
  }

  async function reset() {
    await fetch("/api/admin/model/calibrated-weights", { method: "DELETE" });
    await refresh();
  }

  return (
    <section className="rounded border border-lab-amber/50 bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Калиброванные веса</h2>
          <p className="mt-1 text-sm text-lab-muted">{state.message}{state.sampleSize ? ` Sample: ${state.sampleSize} finished matches.` : ""}</p>
          <p className="mt-2 text-xs text-lab-amber">Эти веса улучшают backtesting, но могут снизить стабильность на новых данных. По умолчанию production prediction их не использует.</p>
        </div>
        <button type="button" onClick={reset} className="rounded border border-lab-border px-3 py-2 text-sm text-lab-muted hover:border-lab-red hover:text-lab-red">
          Сбросить к стандартным весам
        </button>
      </div>
    </section>
  );
}
