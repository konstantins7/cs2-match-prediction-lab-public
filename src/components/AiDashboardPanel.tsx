"use client";

import { useEffect, useMemo, useState } from "react";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type Dashboard = {
  ok: boolean;
  enabled: boolean;
  config: { baseUrl: string; model: string; fineTunedModel: string; timeoutMs: number; activeModel: string };
  models: { models: string[]; fineTunedAvailable: boolean };
  runtime: { queuedRequests: number; activeRequests: number; lastErrorMessage: string };
  cache: { count: number; bytes: number; ttlMs: number; path: string };
  usage: { total: number; completed: number; errors: number; cached: number; averageDurationMs: number; hourly: Record<string, number>; recentErrors: Array<Record<string, unknown>> };
  history: { total: number; success: number; errors: number; disabled: number; averageConfidence: number; sources: Record<string, number> };
  acceptedExamples: { count: number; path: string };
  fineTuning: { allowRun: boolean; commandConfigured: boolean; latestJob: Record<string, unknown> | null };
};

export function AiDashboardPanel() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");
  const [deleteAccepted, setDeleteAccepted] = useState(false);

  const refresh = async () => {
    const response = await fetch("/api/admin/ai/dashboard", { cache: "no-store" });
    const json = await response.json() as Dashboard;
    setDashboard(json);
    return json;
  };

  useEffect(() => {
    void refresh();
  }, []);

  const testAction = useAsyncAction(async () => {
    const response = await fetch("/api/admin/ai/test", { method: "POST" });
    const json = await response.json() as { ok?: boolean; durationMs?: number; error?: string; text?: string };
    setMessage(json.ok ? `Ollama OK in ${json.durationMs}ms: ${json.text ?? ""}` : `Ollama test failed: ${json.error}`);
    await refresh();
  }, { actionName: "local_ai_dashboard_test" });

  const clearCacheAction = useAsyncAction(async () => {
    const response = await fetch("/api/admin/ai/cache/clear", { method: "POST" });
    const json = await response.json() as { ok?: boolean };
    setMessage(json.ok ? "AI response cache cleared." : "Cache clear failed.");
    await refresh();
  }, { actionName: "local_ai_cache_clear" });

  async function fineTune(action: "prepare" | "run" | "activate" | "reset") {
    const response = await fetch("/api/admin/ai/finetune", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, deleteAccepted })
    });
    const json = await response.json() as Record<string, unknown>;
    setMessage(JSON.stringify(json, null, 2).slice(0, 1200));
    await refresh();
  }

  const hourly = useMemo(() => Object.entries(dashboard?.usage.hourly ?? {}).slice(-12), [dashboard]);

  return (
    <section className="space-y-5">
      <div className="rounded border border-lab-border bg-lab-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-lab-cyan">Admin</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">AI Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm text-lab-muted">Локальная панель состояния Ollama, AI cache, extraction history и guided fine-tuning. Никаких cloud AI вызовов.</p>
          </div>
          <button type="button" onClick={() => void refresh()} className="rounded border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">Refresh</button>
        </div>
        {message ? <pre className="mt-4 max-h-48 overflow-auto rounded border border-lab-border bg-black/30 p-3 text-xs text-lab-muted">{message}</pre> : null}
      </div>

      {dashboard ? (
        <>
          <div className="grid gap-4 lg:grid-cols-4">
            <StatCard label="Local AI" value={dashboard.enabled ? "enabled" : "disabled"} hint={dashboard.config.baseUrl} tone={dashboard.enabled ? "green" : "amber"} />
            <StatCard label="Active model" value={dashboard.config.activeModel || dashboard.config.model} hint={`${dashboard.models.models.length} model(s) visible`} />
            <StatCard label="Cache" value={`${dashboard.cache.count} files`} hint={`${formatBytes(dashboard.cache.bytes)} · ${Math.round(dashboard.cache.ttlMs / 86400000)}d TTL`} />
            <StatCard label="History" value={`${dashboard.history.total} runs`} hint={`avg confidence ${dashboard.history.averageConfidence}%`} />
          </div>

          <section className="rounded border border-lab-border bg-lab-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">Ollama status</h2>
                <p className="mt-1 text-sm text-lab-muted">Queue {dashboard.runtime.queuedRequests}, active {dashboard.runtime.activeRequests}, timeout {dashboard.config.timeoutMs}ms.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={testAction.isLoading} onClick={() => void testAction.execute()} className="rounded bg-lab-cyan px-3 py-2 text-sm font-semibold text-black disabled:opacity-50">{testAction.isLoading ? "Testing..." : "Test connection"}</button>
                <button type="button" disabled={clearCacheAction.isLoading} onClick={() => void clearCacheAction.execute()} className="rounded border border-lab-border px-3 py-2 text-sm text-lab-muted hover:border-lab-cyan">{clearCacheAction.isLoading ? "Clearing..." : "Clear cache"}</button>
              </div>
            </div>
            {dashboard.runtime.lastErrorMessage ? <p className="mt-2 text-sm text-lab-red">Last error: {dashboard.runtime.lastErrorMessage}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-lab-muted">
              {dashboard.models.models.length ? dashboard.models.models.map((model) => <span key={model} className="rounded border border-lab-border px-2 py-1">{model}</span>) : <span>No models visible. Start Ollama or run pnpm ai:setup.</span>}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded border border-lab-border bg-lab-panel p-4">
              <h2 className="font-semibold text-white">Usage last 24h</h2>
              <div className="mt-3 flex h-28 items-end gap-1 border-b border-lab-border">
                {hourly.length ? hourly.map(([hour, count]) => <div key={hour} className="min-w-6 bg-lab-cyan/80" title={`${hour}: ${count}`} style={{ height: `${Math.max(6, Math.min(110, count * 10))}px` }} />) : <p className="self-center text-sm text-lab-muted">No AI log events yet.</p>}
              </div>
              <p className="mt-2 text-sm text-lab-muted">Total {dashboard.usage.total}, completed {dashboard.usage.completed}, cached {dashboard.usage.cached}, errors {dashboard.usage.errors}, avg {dashboard.usage.averageDurationMs}ms.</p>
            </div>
            <div className="rounded border border-lab-border bg-lab-panel p-4">
              <h2 className="font-semibold text-white">Extraction stats</h2>
              <p className="mt-2 text-sm text-lab-muted">Success {dashboard.history.success}, errors {dashboard.history.errors}, disabled {dashboard.history.disabled}.</p>
              <div className="mt-3 space-y-1 text-sm">
                {Object.entries(dashboard.history.sources).map(([source, count]) => <p key={source} className="text-lab-muted">{source}: <span className="text-white">{count}</span></p>)}
              </div>
            </div>
          </section>

          <section className="rounded border border-lab-border bg-lab-panel p-4">
            <h2 className="font-semibold text-white">Guided fine-tuning</h2>
            <p className="mt-1 text-sm text-lab-muted">Accepted examples: {dashboard.acceptedExamples.count}. Running local training requires Python/tooling you install yourself; the app never installs heavy dependencies.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void fineTune("prepare")} className="rounded border border-lab-cyan px-3 py-2 text-sm text-lab-cyan">Prepare dataset</button>
              <button type="button" onClick={() => void fineTune("run")} className="rounded border border-lab-amber px-3 py-2 text-sm text-lab-amber">Run guided fine-tune</button>
              <button type="button" onClick={() => void fineTune("activate")} className="rounded border border-lab-green px-3 py-2 text-sm text-lab-green">Activate fine-tuned model</button>
              <button type="button" onClick={() => void fineTune("reset")} className="rounded border border-lab-border px-3 py-2 text-sm text-lab-muted">Reset to base model</button>
              <label className="flex items-center gap-2 text-sm text-lab-muted"><input type="checkbox" checked={deleteAccepted} onChange={(event) => setDeleteAccepted(event.target.checked)} /> delete accepted examples after successful run</label>
            </div>
            <p className="mt-2 text-xs text-lab-muted">Run allowed: {String(dashboard.fineTuning.allowRun)} · command configured: {String(dashboard.fineTuning.commandConfigured)}</p>
          </section>
        </>
      ) : <p className="text-sm text-lab-muted">Loading dashboard...</p>}
    </section>
  );
}

function StatCard({ label, value, hint, tone = "cyan" }: { label: string; value: string; hint: string; tone?: "cyan" | "green" | "amber" }) {
  const color = tone === "green" ? "text-lab-green" : tone === "amber" ? "text-lab-amber" : "text-lab-cyan";
  return <div className="rounded border border-lab-border bg-lab-panel p-4"><p className="text-xs uppercase text-lab-muted">{label}</p><p className={`mt-2 text-xl font-semibold ${color}`}>{value}</p><p className="mt-1 text-xs text-lab-muted">{hint}</p></div>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
