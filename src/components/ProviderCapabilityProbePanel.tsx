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
    <section id="provider-capability-probe" className="rounded border border-lab-cyan/40 bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Что реально доступно из источников сейчас</h2>
          <p className="mt-1 text-sm text-lab-muted">Проверка возможностей показывает, какие данные реально доступны сейчас, без вызова неподтверждённых paid/deep endpoints.</p>
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
                  {provider.configured ? "Подключено" : "Не подключено"}
                </span>
              </div>
              <p className="mt-2 text-xs text-lab-muted">{humanizeCapabilityText(provider.friendlyMessage)}</p>
              <p className="mt-3 text-xs uppercase text-lab-muted">Что доступно</p>
              <ul className="mt-1 space-y-1 text-xs text-lab-cyan">
                {(provider.unlocked.length ? provider.unlocked : ["нет разблокированной глубокой статистики"]).map((item) => <li key={item}>{humanizeCapabilityText(item)}</li>)}
              </ul>
              {provider.blocked.length ? (
                <>
                  <p className="mt-3 text-xs uppercase text-lab-muted">Что недоступно / требует доступа</p>
                  <ul className="mt-1 space-y-1 text-xs text-lab-amber">
                    {provider.blocked.map((item) => <li key={item}>{humanizeCapabilityText(item)}</li>)}
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

function humanizeCapabilityText(value: string) {
  const replacements: Record<string, string> = {
    "key configured": "ключ добавлен",
    "capability probe available": "проверка возможностей доступна",
    "not confirmed": "не подтверждено",
    "deep telemetry pending access confirmation": "глубокая статистика пока не подтверждена",
    "competitions endpoint reachable": "endpoint соревнований доступен",
    "players route configured with explicit known player IDs only": "игроки доступны только по подтверждённым FACEIT IDs",
    "teams route configured with explicit team context": "команды доступны только по подтверждённому team context",
    "no broad FACEIT crawl": "массовый FACEIT crawl отключён",
    "no FACEIT player search by nickname": "поиск FACEIT игроков по nickname отключён",
    "no FACEIT team search by name": "поиск FACEIT команд по name отключён",
    "explicit IDs/context required": "нужны явные IDs/context",
    "Central Data reachable": "Central Data доступен",
    "Series State reachable": "Series State доступен",
    "Series State pending until a known series id is available": "Series State pending до known series id",
    "Series Events API unavailable on Open Access": "Series Events недоступен на Open Access",
    "File Download API unavailable on Open Access": "File Download недоступен на Open Access",
    "Stats Feed unavailable on Open Access": "Stats Feed недоступен на Open Access",
    "GRID key missing": "GRID key отсутствует",
    "ENABLE_GRID_SYNC=false": "GRID sync отключён",
    configured: "подключено",
    missing: "не подключено",
    unlocked: "доступно",
    blocked: "недоступно",
    paid: "требует доступа",
    future: "будущее"
  };
  return Object.entries(replacements).reduce((text, [from, to]) => text.replaceAll(from, to), replacements[value] ?? value);
}
