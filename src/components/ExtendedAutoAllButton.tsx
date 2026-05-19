"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type ExtendedEvent = {
  step: string;
  status: "running" | "success" | "warning" | "error";
  message: string;
  data?: {
    diagnosticTable?: Array<{ dataType: string; source: string; status: string; reason: string; rows: number; nextAction: string }>;
    writes?: Array<{ file: string; source: string; rows: number }>;
    nextAction?: string;
  };
};

export function ExtendedAutoAllButton({ matchId, teamA, teamB }: { matchId: string; teamA: string; teamB: string }) {
  const router = useRouter();
  const sourceRef = useRef<EventSource | null>(null);
  const [events, setEvents] = useState<ExtendedEvent[]>([]);
  const [dryRun, setDryRun] = useState(false);
  const { execute: run, isLoading: running } = useAsyncAction(runExtended, { actionName: "auto_all_extended" });

  function runExtended() {
    return new Promise<void>((resolve, reject) => {
    sourceRef.current?.close();
    setEvents([]);
    const params = new URLSearchParams({
      matchId,
      teamA,
      teamB,
      mode: "max",
      includeH2h: "true",
      dryRun: String(dryRun)
    });
    const source = new EventSource(`/api/auto-all-extended?${params.toString()}`);
    sourceRef.current = source;
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as ExtendedEvent;
      setEvents((current) => [...current, event]);
      if (event.step === "complete" || event.status === "error") {
        source.close();
        sourceRef.current = null;
        if (event.step === "complete") {
          router.refresh();
          resolve();
        } else {
          reject(new Error(event.message));
        }
      }
    };
    source.onerror = () => {
      setEvents((current) => [...current, { step: "connection", status: "error", message: "SSE connection closed before completion." }]);
      source.close();
      sourceRef.current = null;
      reject(new Error("SSE connection closed before completion."));
    };
    });
  }

  const latest = events.at(-1);
  const diagnostics = latest?.data?.diagnosticTable ?? [];
  return (
    <section className="rounded border border-lab-amber/50 bg-lab-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-lab-amber">Extended research auto</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Всё возможное auto</h2>
          <p className="mt-1 max-w-3xl text-sm text-lab-muted">
            Запускает safe baseline, затем opt-in research источники. Файлы попадают только в private inbox; Apply всё равно требует ручного подтверждения.
          </p>
          <p className="mt-1 text-xs text-lab-muted">Если research-флаги выключены, команда честно отработает как safe baseline и покажет blockers.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <label className="flex items-center gap-2 text-sm text-lab-muted">
            <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
            Dry-run
          </label>
          <button
            type="button"
            disabled={running}
            onClick={() => void run()}
            className="rounded bg-lab-amber px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? "Ищу максимум..." : "Всё возможное auto"}
          </button>
        </div>
      </div>
      {events.length ? (
        <div className="mt-4 space-y-3">
          <div className="rounded border border-lab-border bg-lab-panel2 p-3">
            <p className="text-xs uppercase text-lab-muted">Live progress</p>
            <div className="mt-2 space-y-1 text-sm">
              {events.slice(-8).map((event, index) => (
                <p key={`${event.step}-${index}`} className={event.status === "error" ? "text-lab-red" : event.status === "warning" ? "text-lab-amber" : event.status === "success" ? "text-lab-green" : "text-lab-muted"}>
                  {event.step}: {event.message}
                </p>
              ))}
            </div>
          </div>
          {diagnostics.length ? (
            <div className="overflow-x-auto rounded border border-lab-border bg-lab-panel2 p-3">
              <table className="min-w-full text-left text-xs">
                <thead className="uppercase text-lab-muted">
                  <tr><th className="py-2">Type</th><th>Source</th><th>Status</th><th>Rows</th><th>Reason</th><th>Next</th></tr>
                </thead>
                <tbody className="divide-y divide-lab-border">
                  {diagnostics.slice(0, 20).map((row, index) => (
                    <tr key={`${row.dataType}-${row.source}-${index}`}>
                      <td className="py-2 text-white">{row.dataType}</td>
                      <td>{row.source}</td>
                      <td>{row.status}</td>
                      <td>{row.rows}</td>
                      <td className="max-w-sm truncate">{row.reason}</td>
                      <td className="max-w-sm truncate">{row.nextAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
