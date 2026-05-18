"use client";

import Link from "next/link";
import { useState } from "react";
import type { DataQualityProblemMatch } from "@/lib/dataQualityDashboard";

type ApiResponse = {
  ok: boolean;
  result?: {
    problemMatches?: DataQualityProblemMatch[];
  };
  error?: string;
};

export function DataQualityProblemMatchesPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DataQualityProblemMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setOpen((value) => !value);
    if (rows || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/data-quality?includeProblemMatches=true", { cache: "no-store" });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Failed to load problem matches.");
      setRows(payload.result?.problemMatches ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load problem matches.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Проблемные почти готовые матчи</h2>
          <p className="mt-1 text-sm text-lab-muted">Coverage выше 50, но Real Forecast Ready ещё false.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded border border-lab-cyan px-3 py-1.5 text-sm text-lab-cyan hover:bg-lab-cyan hover:text-black"
        >
          {open ? "Скрыть проблемные матчи" : "Показать проблемные матчи"}
        </button>
      </div>
      {open ? (
        <div className="mt-4">
          {loading ? <p className="text-sm text-lab-muted">Загружаю...</p> : null}
          {error ? <p className="text-sm text-lab-red">{error}</p> : null}
          {!loading && !error && rows ? (
            rows.length === 0 ? (
              <p className="text-sm text-lab-muted">Почти готовых заблокированных матчей сейчас нет.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-lab-muted">
                    <tr>
                      <th className="py-2 pr-3">Дата</th>
                      <th className="py-2 pr-3">Матч</th>
                      <th className="py-2 pr-3">Coverage</th>
                      <th className="py-2 pr-3">Tier</th>
                      <th className="py-2">Blockers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.matchId} className="border-t border-lab-border">
                        <td className="py-2 pr-3 text-lab-muted">{new Date(row.startTime).toLocaleString("ru-RU")}</td>
                        <td className="py-2 pr-3">
                          <Link href={row.href} className="text-lab-cyan hover:underline">{row.teams}</Link>
                          <p className="text-xs text-lab-muted">{row.eventName}</p>
                        </td>
                        <td className="py-2 pr-3 text-white">{row.coverageScore}/100</td>
                        <td className="py-2 pr-3 text-lab-muted">{row.forecastabilityTier}</td>
                        <td className="py-2 text-lab-amber">{row.blockers.length ? row.blockers.join("; ") : "No blockers reported"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
