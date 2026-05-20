"use client";

import { useEffect, useMemo, useState } from "react";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type HistoryRecord = {
  id: string;
  timestamp: string;
  matchId?: string;
  status: string;
  detectedSource?: string;
  sourceSite?: string;
  promptVersion?: string;
  promptVariant?: string;
  confidence?: number;
  durationMs?: number;
  cached?: boolean;
  sheetCounts: Record<string, number>;
  warnings: string[];
  errors: string[];
  inputPreview?: string;
  rawOutput?: unknown;
  badExample?: boolean;
};

type HistoryResponse = {
  ok: boolean;
  records: HistoryRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function AiHistoryPanel() {
  const [rows, setRows] = useState<HistoryRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [matchId, setMatchId] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<HistoryRecord | null>(null);
  const [message, setMessage] = useState("");

  const params = useMemo(() => {
    const next = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (matchId) next.set("matchId", matchId);
    if (status) next.set("status", status);
    if (source) next.set("source", source);
    return next;
  }, [page, matchId, status, source]);

  async function load() {
    const response = await fetch(`/api/admin/ai/history?${params.toString()}`, { cache: "no-store" });
    const json = await response.json() as HistoryResponse;
    setRows(json.records ?? []);
    setTotal(json.total ?? 0);
    setTotalPages(json.totalPages ?? 1);
  }

  useEffect(() => {
    void load();
  }, [params]);

  const deleteAction = useAsyncAction(async () => {
    const confirm = window.prompt("Type DELETE_AI_HISTORY to archive and clear current AI history.");
    if (confirm !== "DELETE_AI_HISTORY") return;
    const response = await fetch("/api/admin/ai/history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete-all", confirm })
    });
    const json = await response.json() as { ok?: boolean; error?: string };
    setMessage(json.ok ? "AI history archived and cleared." : json.error || "Clear failed.");
    setSelected(null);
    await load();
  }, { actionName: "local_ai_history_clear" });

  async function markBad(id: string) {
    const response = await fetch("/api/admin/ai/history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark-bad", id, bad: true })
    });
    const json = await response.json() as { ok?: boolean; record?: HistoryRecord };
    if (json.record) setSelected(json.record);
    await load();
  }

  return (
    <section className="space-y-5">
      <div className="rounded border border-lab-border bg-lab-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-lab-cyan">Admin</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">AI extraction history</h1>
            <p className="mt-2 max-w-3xl text-sm text-lab-muted">История локальных AI extraction runs. Ввод хранится redacted/truncated; полный ввод только при явном env opt-in.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/admin/ai/history?action=export&${params.toString()}`} className="rounded border border-lab-cyan px-3 py-2 text-sm text-lab-cyan">Export CSV</a>
            <button type="button" disabled={deleteAction.isLoading} onClick={() => void deleteAction.execute()} className="rounded border border-lab-red/60 px-3 py-2 text-sm text-lab-red disabled:opacity-50">Delete all</button>
          </div>
        </div>
        {message ? <p className="mt-3 text-sm text-lab-amber">{message}</p> : null}
      </div>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input value={matchId} onChange={(event) => { setPage(1); setMatchId(event.target.value); }} placeholder="matchId" className="rounded border border-lab-border bg-black/20 px-3 py-2 text-white" />
          <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="rounded border border-lab-border bg-black/20 px-3 py-2 text-white">
            <option value="">any status</option>
            <option value="success">success</option>
            <option value="partial">partial</option>
            <option value="error">error</option>
            <option value="disabled">disabled</option>
          </select>
          <input value={source} onChange={(event) => { setPage(1); setSource(event.target.value); }} placeholder="source" className="rounded border border-lab-border bg-black/20 px-3 py-2 text-white" />
          <button type="button" onClick={() => void load()} className="rounded border border-lab-cyan px-3 py-2 text-sm text-lab-cyan">Refresh</button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section className="overflow-x-auto rounded border border-lab-border bg-lab-panel">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-lab-panel2 uppercase text-lab-muted">
              <tr><th className="p-3">Time</th><th>Match</th><th>Status</th><th>Source</th><th>Confidence</th><th>Sheets</th><th>Flags</th></tr>
            </thead>
            <tbody className="divide-y divide-lab-border">
              {rows.map((row) => (
                <tr key={row.id} onClick={() => setSelected(row)} className="cursor-pointer hover:bg-white/5">
                  <td className="p-3 text-lab-muted">{row.timestamp}</td>
                  <td className="p-3 text-white">{row.matchId}</td>
                  <td className={row.status === "success" ? "p-3 text-lab-green" : row.status === "error" ? "p-3 text-lab-red" : "p-3 text-lab-amber"}>{row.status}</td>
                  <td className="p-3">{row.detectedSource || row.sourceSite || "unknown"}</td>
                  <td className="p-3">{row.confidence ?? ""}</td>
                  <td className="p-3">{Object.entries(row.sheetCounts || {}).map(([key, value]) => `${key}:${value}`).join(", ")}</td>
                  <td className="p-3">{row.badExample ? "bad/excluded" : row.cached ? "cached" : ""}</td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={7} className="p-4 text-lab-muted">No AI history records found.</td></tr> : null}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-lab-border p-3 text-sm text-lab-muted">
            <span>Total {total}. Page {page}/{totalPages}.</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded border border-lab-border px-2 py-1 disabled:opacity-50">Prev</button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded border border-lab-border px-2 py-1 disabled:opacity-50">Next</button>
            </div>
          </div>
        </section>

        <aside className="rounded border border-lab-border bg-lab-panel p-4">
          <h2 className="font-semibold text-white">Detail</h2>
          {selected ? (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-lab-muted">ID <span className="text-white">{selected.id}</span></p>
              <p className="text-lab-muted">Prompt <span className="text-white">{selected.promptVersion} / {selected.promptVariant}</span></p>
              <div>
                <p className="text-xs uppercase text-lab-muted">Input preview</p>
                <pre className="mt-1 max-h-40 overflow-auto rounded border border-lab-border bg-black/30 p-2 text-xs text-lab-muted">{selected.inputPreview || "No input preview stored."}</pre>
              </div>
              <div>
                <p className="text-xs uppercase text-lab-muted">Raw output</p>
                <pre className="mt-1 max-h-72 overflow-auto rounded border border-lab-border bg-black/30 p-2 text-xs text-lab-muted">{JSON.stringify(selected.rawOutput ?? {}, null, 2)}</pre>
              </div>
              <button type="button" onClick={() => void markBad(selected.id)} className="rounded border border-lab-amber px-3 py-2 text-sm text-lab-amber">Mark bad / exclude from training</button>
            </div>
          ) : <p className="mt-3 text-sm text-lab-muted">Select a record to inspect redacted details.</p>}
        </aside>
      </div>
    </section>
  );
}
