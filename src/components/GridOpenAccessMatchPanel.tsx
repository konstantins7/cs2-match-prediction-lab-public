"use client";

import { useState } from "react";
import type { GridMatchEnrichmentResult, GridMatchStatus } from "@/lib/gridOpenAccess";

type ApiResponse = {
  ok: boolean;
  error?: string;
  result?: GridMatchEnrichmentResult | (GridMatchStatus & { ok?: boolean; aliasesCreated?: number; aliasesUpdated?: number; errors?: string[] });
};

export function GridOpenAccessMatchPanel({ initialStatus }: { initialStatus: GridMatchStatus }) {
  const [status, setStatus] = useState<GridMatchStatus>(initialStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const [gridSeriesId, setGridSeriesId] = useState(initialStatus.gridSeriesId ?? "");
  const [message, setMessage] = useState("GRID Open Access улучшает coverage/depth, но Real Forecast Ready всё равно требует map/veto, quality gates и отсутствие needs_review.");

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = (await response.json()) as ApiResponse;
    if (!json.ok || !json.result) throw new Error(json.error ?? "GRID Open Access action failed.");
    return json.result;
  }

  async function mapSeries() {
    setBusy("mapping");
    try {
      const result = await post({ action: "grid_oa_manual_series_mapping", matchId: status.matchId, gridSeriesId });
      setStatus((current) => ({
        ...current,
        matched: true,
        gridSeriesId,
        seriesStateAvailable: "pending"
      }));
      const aliasesCreated = "aliasesCreated" in result ? result.aliasesCreated ?? 0 : 0;
      const aliasesUpdated = "aliasesUpdated" in result ? result.aliasesUpdated ?? 0 : 0;
      setMessage(`GRID series id связан: создано aliases ${aliasesCreated}, обновлено ${aliasesUpdated}. Теперь можно обновить Series State.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось связать GRID series id.");
    } finally {
      setBusy(null);
    }
  }

  async function enrich() {
    setBusy("enrich");
    try {
      const result = await post({ action: "grid_oa_enrich_match", matchId: status.matchId });
      const next = result as GridMatchEnrichmentResult;
      setStatus(next);
      setMessage(next.notes?.[0] ?? `GRID Series State обновлён: fetched ${next.recordsFetched}, created ${next.recordsCreated}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GRID Series State недоступен.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-lab-cyan/35 bg-lab-panel/85 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">GRID Open Access</h2>
          <p className="mt-1 text-sm text-lab-muted">Official OA context: Central Data + Series State only. Series Events, File Download и Stats Feed недоступны на Open Access.</p>
        </div>
        <button
          type="button"
          disabled={busy !== null || !status.enabled || !status.gridSeriesId}
          onClick={enrich}
          className="rounded bg-lab-cyan px-3 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "enrich" ? "Обновляю..." : "Обновить GRID Open Access data"}
        </button>
      </div>
      <dl className="mt-3 grid gap-2 text-sm text-lab-muted md:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-xs uppercase">ключ</dt><dd className={status.configured ? "text-lab-green" : "text-lab-amber"}>{status.configured ? "добавлен" : "не подключён"}</dd></div>
        <div><dt className="text-xs uppercase">series matched</dt><dd className={status.matched ? "text-lab-green" : "text-lab-amber"}>{status.matched ? "yes" : "no"}</dd></div>
        <div><dt className="text-xs uppercase">gridSeriesId</dt><dd className="break-all text-white">{status.gridSeriesId ?? "нужно связать"}</dd></div>
        <div><dt className="text-xs uppercase">Series State</dt><dd className="text-white">{status.seriesStateAvailable === true ? "доступно" : status.seriesStateAvailable === false ? "нет" : "pending"}</dd></div>
        <div><dt className="text-xs uppercase">records fetched</dt><dd className="text-white">{status.recordsFetched}</dd></div>
        <div><dt className="text-xs uppercase">created/updated</dt><dd className="text-white">{status.recordsCreated}/{status.recordsUpdated}</dd></div>
        <div><dt className="text-xs uppercase">needs review</dt><dd className="text-white">{status.needsReviewCount}</dd></div>
        <div><dt className="text-xs uppercase">last sync</dt><dd className="text-white">{status.lastSync ?? "ещё не запускался"}</dd></div>
      </dl>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-xs uppercase text-lab-muted">Доступные типы данных</p>
          <p className="mt-2 text-sm text-lab-cyan">{status.availableDataTypes.length ? status.availableDataTypes.join(", ") : "series context появится после Central Data sync / manual mapping"}</p>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-xs uppercase text-lab-muted">Недоступно на Open Access</p>
          <p className="mt-2 text-sm text-lab-amber">{status.unsupportedProducts.join(", ")}</p>
        </div>
      </div>
      {!status.gridSeriesId ? (
        <div className="mt-4 rounded border border-lab-amber/50 bg-lab-panel2 p-3">
          <p className="text-sm text-lab-amber">Если автоматическое совпадение не найдено, свяжите GRID series id вручную.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={gridSeriesId}
              onChange={(event) => setGridSeriesId(event.target.value)}
              placeholder="GRID series id"
              className="min-w-64 rounded border border-lab-border bg-lab-panel px-3 py-2 text-sm text-white outline-none focus:border-lab-cyan"
            />
            <button
              type="button"
              disabled={busy !== null || !gridSeriesId.trim()}
              onClick={mapSeries}
              className="rounded border border-lab-cyan/60 px-3 py-2 text-sm text-lab-cyan disabled:opacity-50"
            >
              {busy === "mapping" ? "Связываю..." : "Связать GRID series id"}
            </button>
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-sm text-lab-muted">{message}</p>
    </section>
  );
}
