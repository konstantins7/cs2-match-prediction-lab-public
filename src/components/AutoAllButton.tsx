"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { AutoAllJobView } from "@/lib/autoAllJobs";
import type { AutoFillMode } from "../../tools/auto-fill";
import { ProgressPanel } from "./ProgressPanel";
import { SourceLineage } from "./SourceLineage";

type ApiResponse = {
  ok: boolean;
  job?: AutoAllJobView;
  error?: string;
};

const modes: Array<{ value: AutoFillMode; label: string }> = [
  { value: "fast", label: "Fast" },
  { value: "deeper", label: "Deeper" },
  { value: "max", label: "Max" }
];

export function AutoAllButton({
  matchId,
  teamA,
  teamB,
  compact = false
}: {
  matchId: string;
  teamA: string;
  teamB: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AutoFillMode>("deeper");
  const [job, setJob] = useState<AutoAllJobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lineageRefresh, setLineageRefresh] = useState(0);
  const { execute: run, isLoading: busy } = useAsyncAction(runAutoAll, {
    actionName: "auto_all",
    onError: (caught) => setError(caught.message)
  });

  async function runAutoAll() {
    setError(null);
    setJob(null);
    const response = await fetch("/api/auto-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, teamA, teamB, mode })
    });
    const json = await response.json() as ApiResponse;
    if (!json.ok || !json.job) throw new Error(json.error ?? "Auto-All could not start.");
    setJob(json.job);
    await poll(json.job.jobId);
  }

  async function poll(jobId: string) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await delay(500);
      const response = await fetch(`/api/auto-all?jobId=${encodeURIComponent(jobId)}`);
      const json = await response.json() as ApiResponse;
      if (!json.ok || !json.job) throw new Error(json.error ?? "Auto-All status unavailable.");
      setJob(json.job);
      if (json.job.status === "completed") {
        setLineageRefresh((value) => value + 1);
        router.refresh();
        return;
      }
      if (json.job.status === "error") throw new Error(json.job.error ?? "Auto-All failed.");
    }
    throw new Error("Auto-All timed out after 60 seconds.");
  }

  return (
    <section className={compact ? "rounded border border-lab-border bg-lab-panel2 p-4" : "rounded border border-lab-cyan/45 bg-lab-panel p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-lab-cyan">Auto-All data collection</p>
          <h2 className={compact ? "mt-1 font-semibold text-white" : "mt-1 text-xl font-semibold text-white"}>Автоматически собрать всё</h2>
          <p className="mt-1 max-w-3xl text-sm text-lab-muted">
            Запускает безопасные источники и пишет только normalized files в private inbox. Apply остаётся только через /admin/imports.
          </p>
          <p className="mt-1 text-xs text-lab-amber">
            Benchmark baseline: без ключей 0% RFR до auto-fill и 100% manual fallback, поэтому UI показывает попытки честно, без обещания готового прогноза.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="rounded bg-lab-cyan px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Сбор данных..." : "Автоматически собрать всё"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {modes.map((item) => (
          <label key={item.value} className={mode === item.value ? "rounded border border-lab-cyan bg-lab-cyan/10 px-3 py-1.5 text-sm text-white" : "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted"}>
            <input className="mr-2" type="radio" name={`auto-all-mode-${matchId}`} checked={mode === item.value} onChange={() => setMode(item.value)} />
            {item.label}
          </label>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-lab-red">{error}</p> : null}
      {job ? (
        <div className="mt-4 space-y-3">
          <ProgressPanel progress={job.progress} />
          {job.result ? (
            <div className={job.result.stillMissing.length ? "rounded border border-lab-amber/50 bg-lab-amber/10 p-3" : "rounded border border-lab-green/50 bg-lab-green/10 p-3"}>
              <p className="font-medium text-white">{job.result.nextAction}</p>
              <p className="mt-1 text-sm text-lab-muted">
                Prepared rows: {job.result.writes.reduce((sum, write) => sum + write.rows, 0)} · still missing: {job.result.stillMissing.join(", ") || "none"}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      {!compact ? <div className="mt-4"><SourceLineage matchId={matchId} refreshKey={lineageRefresh} compact /></div> : null}
    </section>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
