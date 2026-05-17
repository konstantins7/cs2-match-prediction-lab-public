"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MatchFeedRefreshResult, MatchFeedStatus } from "@/lib/matchFeedCache";

type ApiResponse = {
  ok: boolean;
  error?: string;
  result?: MatchFeedRefreshResult;
};

export function MatchFeedRefreshButton({ status, compact = false }: { status: MatchFeedStatus; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MatchFeedRefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_match_feed" })
      });
      const json = (await response.json()) as ApiResponse;
      if (!json.ok || !json.result) throw new Error(json.error ?? "Не удалось обновить список матчей.");
      setResult(json.result);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обновить список матчей.");
    } finally {
      setBusy(false);
    }
  }

  const activeStatus = result?.after ?? status;
  return (
    <section className={compact ? "rounded border border-lab-border bg-lab-panel p-4" : "rounded border border-lab-cyan/40 bg-lab-panel p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-lab-cyan">Match Feed Cache</p>
          <h2 className="mt-1 font-semibold text-white">Обновить список матчей</h2>
          <p className="mt-1 text-sm text-lab-muted">
            Страницы показывают локальный cache. Sync запускается только этой кнопкой и сравнивает новый live/upcoming список с прошлым.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className="rounded bg-lab-cyan px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Обновляю матчи..." : "Обновить список матчей"}
        </button>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <SmallStat label="Live" value={activeStatus.liveCount} />
        <SmallStat label="Upcoming" value={activeStatus.upcomingCount} />
        <SmallStat label="Всего в cache" value={activeStatus.cachedCount} />
        <SmallStat label="Last updated" value={formatDate(activeStatus.lastUpdated)} tone={activeStatus.isStale ? "amber" : "green"} />
      </div>
      <p className="mt-2 text-xs text-lab-muted">
        Cache считается stale после {activeStatus.staleAfterMinutes} минут. Stale/removed матчи только показываются в отчёте, без удаления.
      </p>
      {error ? <p className="mt-3 text-sm text-lab-red">{error}</p> : null}
      {result ? (
        <div className="mt-4 rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-sm font-medium text-white">Match feed refresh готов</p>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <SmallStat label="New" value={result.delta.counts.new} tone="green" />
            <SmallStat label="Updated" value={result.delta.counts.updated} tone="cyan" />
            <SmallStat label="Unchanged" value={result.delta.counts.unchanged} />
            <SmallStat label="Stale/removed" value={result.delta.counts.stale} tone="amber" />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Panel
              title="Sync summary"
              items={result.syncSummary.map(
                (item) => `${item.jobType}: ${item.status}, fetched ${item.recordsFetched}, changed ${item.recordsUpdated}, skipped ${item.recordsSkipped}`
              )}
            />
            <Panel title="Notes" items={result.notes} />
          </div>
          <DeltaPreview title="New/updated" items={[...result.delta.new, ...result.delta.updated]} />
          <DeltaPreview title="Stale/removed" items={result.delta.stale} />
        </div>
      ) : null}
    </section>
  );
}

function SmallStat({ label, value, tone = "muted" }: { label: string; value: number | string; tone?: "green" | "cyan" | "amber" | "muted" }) {
  const color = tone === "green" ? "text-lab-green" : tone === "cyan" ? "text-lab-cyan" : tone === "amber" ? "text-lab-amber" : "text-white";
  return (
    <div className="rounded border border-lab-border px-3 py-2">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className={`mt-1 text-sm ${color}`}>{value}</p>
    </div>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-lab-border p-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-lab-muted">
        {items.slice(0, 6).map((item) => <li key={`${title}-${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

function DeltaPreview({ title, items }: { title: string; items: MatchFeedRefreshResult["delta"]["new"] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 rounded border border-lab-border p-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <div className="mt-2 grid gap-2">
        {items.slice(0, 5).map((item) => (
          <div key={`${title}-${item.key}`} className="rounded border border-lab-border bg-lab-panel p-2 text-xs">
            <p className="text-white">{item.teamAName} vs {item.teamBName}</p>
            <p className="mt-1 text-lab-muted">{item.status} · {item.format} · {item.startTime.slice(0, 16).replace("T", " ")} · {item.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "never";
  return value.slice(0, 16).replace("T", " ");
}
