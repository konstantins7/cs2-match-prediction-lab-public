"use client";

import { useMemo, useState } from "react";
import {
  inspectOfflineDatasetCsv,
  offlineDatasetProfiles,
  type OfflineDatasetInspection,
  type OfflineDatasetTopValue,
  type OfflineDatasetType
} from "@/lib/offlineDatasetInspector";

const datasetTypes = Object.keys(offlineDatasetProfiles) as OfflineDatasetType[];

export function OfflineDatasetInspectorPanel() {
  const [datasetType, setDatasetType] = useState<OfflineDatasetType>("results");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<OfflineDatasetInspection | null>(null);
  const [message, setMessage] = useState("");
  const profile = offlineDatasetProfiles[datasetType];
  const loadedBytes = useMemo(() => new Blob([content]).size, [content]);

  function inspect() {
    setMessage("");
    setResult(inspectOfflineDatasetCsv({ datasetType, content }));
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().match(/\.(csv|tsv|txt)$/)) {
      setMessage("Для 0.7.4 inspector используйте CSV/TSV/TXT. XLSX остаётся future/inactive.");
      return;
    }
    setMessage("Файл прочитан локально в браузере. Ничего не отправлено в live forecast records.");
    const next = await file.text();
    setContent(next);
    setResult(inspectOfflineDatasetCsv({ datasetType, content: next }));
  }

  return (
    <section className="rounded border border-lab-cyan/35 bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-cyan">MVP 0.7.4 · inspect-only</p>
          <h2 className="font-semibold text-white">Offline calibration datasets</h2>
          <p className="mt-1 max-w-3xl text-sm text-lab-muted">
            Kaggle CSV можно анализировать для training/calibration metadata, но эти файлы не являются live forecast source и не могут поднять Real Forecast Ready.
          </p>
        </div>
        <span className="rounded-full border border-lab-amber/35 bg-lab-amber/10 px-3 py-1 text-xs font-medium text-lab-amber">
          license check required
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <label className="block text-sm text-lab-muted">
            Dataset type
            <select
              value={datasetType}
              onChange={(event) => {
                setDatasetType(event.target.value as OfflineDatasetType);
                setResult(null);
              }}
              className="mt-1 w-full rounded-lg border border-lab-border bg-lab-panel2 px-3 py-2 text-white outline-none focus:border-lab-cyan"
            >
              {datasetTypes.map((type) => <option key={type} value={type}>{offlineDatasetProfiles[type].filename}</option>)}
            </select>
          </label>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <h3 className="font-semibold text-white">{profile.title}</h3>
            <p className="mt-1 text-sm text-lab-muted">{profile.description}</p>
            <p className="mt-2 text-xs text-lab-amber">
              Назначение: training/calibration only. Not live forecast source. Cannot raise Real Forecast Ready.
            </p>
            <p className="mt-2 break-words font-mono text-[11px] text-lab-muted">{profile.expectedColumns.join(", ")}</p>
          </div>

          <label className="block text-sm text-lab-muted">
            CSV/TSV content
            <textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setResult(null);
              }}
              rows={10}
              className="mt-1 w-full resize-y rounded-lg border border-lab-border bg-black/30 p-3 font-mono text-xs text-white outline-none focus:border-lab-cyan"
              spellCheck={false}
              placeholder="Paste a small sample or load a local CSV/TSV file."
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">
              Upload CSV/TSV
              <input type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(event) => void loadFile(event.target.files?.[0])} className="hidden" />
            </label>
            <button type="button" onClick={inspect} className="rounded-lg border border-lab-cyan/45 bg-lab-cyan/10 px-3 py-2 text-sm font-medium text-lab-cyan hover:bg-lab-cyan/15">
              Inspect metadata
            </button>
            <button
              type="button"
              onClick={() => {
                setContent("");
                setResult(null);
                setMessage("");
              }}
              className="rounded-lg border border-lab-border px-3 py-2 text-sm text-lab-muted hover:border-lab-cyan"
            >
              Clear
            </button>
            <span className="text-xs text-lab-muted">{loadedBytes ? `${Math.round(loadedBytes / 1024)} KB loaded locally` : "No file loaded"}</span>
          </div>
          {message ? <p className="text-sm text-lab-amber">{message}</p> : null}
        </div>

        <aside className="space-y-3">
          <SafetyCard title="Что это даёт" items={["rows / columns", "date range", "top maps", "top teams/events", "warnings"]} />
          <SafetyCard title="Что это не делает" items={["не пишет Match/Team/Player", "не создаёт scoped records", "не меняет predictions", "не влияет на source coverage", "не повышает Real Forecast Ready"]} tone="amber" />
        </aside>
      </div>

      {result ? <InspectionResult result={result} /> : null}
    </section>
  );
}

function InspectionResult({ result }: { result: OfflineDatasetInspection }) {
  return (
    <div className={`mt-4 rounded-xl border p-3 ${result.ok ? "border-lab-green/35 bg-lab-green/10" : "border-lab-red/35 bg-lab-red/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-white">{result.title}</h3>
        <span className="rounded border border-white/10 px-2 py-1 text-xs text-lab-muted">{result.delimiter === "\t" ? "tab TSV" : `${result.delimiter} CSV`}</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Mini title="Rows" value={String(result.rows)} />
        <Mini title="Columns" value={String(result.columns)} />
        <Mini title="Date from" value={result.dateRange.from ?? "n/a"} />
        <Mini title="Date to" value={result.dateRange.to ?? "n/a"} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <TopList title="Top maps" items={result.topMaps} />
        <TopList title="Top teams" items={result.topTeams} />
        <TopList title="Top events" items={result.topEvents} />
      </div>
      <List title="Warnings" items={result.warnings} tone="text-lab-amber" />
      <List title="Errors" items={result.errors} tone="text-lab-red" />
      <details className="mt-3 text-xs text-lab-muted">
        <summary className="cursor-pointer text-lab-cyan">Columns detected</summary>
        <p className="mt-2 break-words font-mono text-[11px]">{result.columnNames.join(", ") || "none"}</p>
      </details>
    </div>
  );
}

function Mini({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-2">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  );
}

function TopList({ title, items }: { title: string; items: OfflineDatasetTopValue[] }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-lab-muted">
        {items.length ? items.map((item) => <li key={`${title}-${item.value}`}>{item.value}: <span className="text-white">{item.count}</span></li>) : <li>n/a</li>}
      </ul>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <ul className={`mt-1 space-y-1 text-sm ${tone}`}>
        {items.map((item) => <li key={`${title}-${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

function SafetyCard({ title, items, tone = "cyan" }: { title: string; items: string[]; tone?: "cyan" | "amber" }) {
  const text = tone === "amber" ? "text-lab-amber" : "text-lab-cyan";
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <h3 className={`font-semibold ${text}`}>{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-lab-muted">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}
