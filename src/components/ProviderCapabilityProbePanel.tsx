"use client";

import { useState } from "react";
import type { ProviderCapabilityProbeResult } from "@/lib/providerCapabilityProbe";

type ApiResponse = {
  ok: boolean;
  error?: string;
  result?: ProviderCapabilityProbeResult;
};

export function ProviderCapabilityProbePanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProviderCapabilityProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "provider_capability_probe" })
      });
      const json = await response.json() as ApiResponse;
      if (!json.ok || !json.result) throw new Error(json.error ?? "Не удалось проверить источники.");
      setResult(json.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось проверить источники.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded border border-lab-cyan/40 bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Что реально доступно из источников сейчас</h2>
          <p className="mt-1 text-sm text-lab-muted">Provider Capability Probe показывает source-of-truth по fixtures, rankings, players, map/veto, GRID telemetry, parsed demo и API limits без вызова unconfirmed paid/deep endpoints.</p>
        </div>
        <button type="button" disabled={busy} onClick={run} className="rounded bg-lab-cyan px-3 py-2 text-sm font-medium text-black disabled:opacity-60">
          {busy ? "Проверяю..." : "Проверить возможности источников"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-lab-red">{error}</p> : null}
      {result ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {result.providers.map((provider) => (
            <article key={provider.source} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-white">{provider.label}</h3>
                <span className={provider.configured ? "text-xs uppercase text-lab-green" : "text-xs uppercase text-lab-amber"}>
                  {provider.configured ? "configured" : "missing"}
                </span>
              </div>
              <p className="mt-2 text-xs text-lab-muted">{provider.friendlyMessage}</p>
              <p className="mt-3 text-xs uppercase text-lab-muted">Unlocked</p>
              <ul className="mt-1 space-y-1 text-xs text-lab-cyan">
                {(provider.unlocked.length ? provider.unlocked : ["нет разблокированных deep data"]).map((item) => <li key={item}>{item}</li>)}
              </ul>
              {provider.blocked.length ? (
                <>
                  <p className="mt-3 text-xs uppercase text-lab-muted">Blocked / paid / future</p>
                  <ul className="mt-1 space-y-1 text-xs text-lab-amber">
                    {provider.blocked.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
