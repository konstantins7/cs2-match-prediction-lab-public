import { getAdminHealthSnapshot } from "@/lib/automation/doctor";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const snapshot = await getAdminHealthSnapshot();
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-zinc-500">CS2 Match Prediction Lab</p>
        <h1 className="text-3xl font-semibold">Automation Health</h1>
        <p className="text-sm text-zinc-500">Local-only diagnostics for setup, AI, scheduler, storage, cleanup, and automation jobs.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric title="Status" value={snapshot.ok ? "Healthy" : "Needs attention"} tone={snapshot.ok ? "good" : "warn"} />
        <Metric title="Node memory" value={`${snapshot.process.memoryMb} MB`} />
        <Metric title="AI queue" value={`${snapshot.ai.queue.activeRequests} active / ${snapshot.ai.queue.queuedRequests} queued`} />
        <Metric title="AI cache" value={`${snapshot.ai.cache.count} files`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Doctor checks">
          <div className="space-y-3">
            {snapshot.checks.map((check) => (
              <div key={check.name} className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-3">
                  <strong>{check.name}</strong>
                  <span className={check.ok ? "text-emerald-400" : check.severity === "error" ? "text-red-400" : "text-yellow-300"}>{check.ok ? "ok" : check.severity}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{check.detail}</p>
                {check.fix ? <p className="mt-1 text-xs text-zinc-500">{check.fix}</p> : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Ollama and AI">
          <dl className="space-y-2 text-sm">
            <Row label="Enabled" value={snapshot.ollama.enabled ? "yes" : "no"} />
            <Row label="Base URL" value={snapshot.ollama.baseUrl} />
            <Row label="Models" value={snapshot.ollama.models.length ? snapshot.ollama.models.join(", ") : "none listed"} />
            <Row label="Fine-tuned" value={snapshot.ollama.fineTunedAvailable ? "available" : "not available"} />
            <Row label="24h requests" value={`${snapshot.ai.usage.total} (${snapshot.ai.usage.errors} errors)`} />
            <Row label="Avg duration" value={`${snapshot.ai.usage.averageDurationMs} ms`} />
          </dl>
        </Panel>

        <Panel title="Storage">
          <dl className="space-y-2 text-sm">
            <Row label="DB" value={formatBytes(snapshot.storage.dbBytes)} />
            <Row label="data/" value={formatBytes(snapshot.storage.dataBytes)} />
            <Row label="logs" value={formatBytes(snapshot.storage.logBytes)} />
            <Row label="cache" value={formatBytes(snapshot.storage.cacheBytes)} />
            <Row label="Cleanup" value={snapshot.storage.freeDiskHint} />
          </dl>
        </Panel>

        <Panel title="Automation">
          <dl className="space-y-2 text-sm">
            <Row label="Enabled" value={snapshot.automation.enabled ? "yes" : "no"} />
            <Row label="PID" value={snapshot.automation.pid ? String(snapshot.automation.pid) : "not running"} />
            <Row label="Heartbeat" value={snapshot.automation.lastHeartbeat || "never"} />
            <Row label="State" value={snapshot.automation.statePath} />
          </dl>
          <div className="mt-4 space-y-2 text-xs text-zinc-400">
            {Object.entries(snapshot.automation.lastRuns).map(([job, result]) => (
              <div key={job} className="rounded bg-zinc-950 p-2">
                <strong>{job}</strong>: {result?.status} - {result?.message}
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Metric({ title, value, tone }: { title: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
      <div className={tone === "good" ? "mt-2 text-xl font-semibold text-emerald-300" : tone === "warn" ? "mt-2 text-xl font-semibold text-yellow-300" : "mt-2 text-xl font-semibold"}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-800 pb-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right text-zinc-200">{value}</dd>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
