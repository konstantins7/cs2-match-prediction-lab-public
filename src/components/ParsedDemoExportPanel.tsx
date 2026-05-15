"use client";

import { useMemo, useState } from "react";
import {
  PARSED_DEMO_EXPORT_PROFILE_NOTES,
  getParsedDemoProfileNote,
  parsedDemoExportExample,
  parsedDemoExportTemplate,
  parsedDemoSourceTools,
  type ParsedDemoSourceTool
} from "@/lib/parsedDemoExportProfiles";

type ParsedDemoExportPanelProps = {
  defaultMatchId: string;
  compact?: boolean;
};

type ApiResult = {
  ok?: boolean;
  applied?: boolean;
  errors?: string[];
  warnings?: string[];
  recordsPreview?: string[];
  creates?: Record<string, number>;
  recordsCreated?: Record<string, number>;
  candidatesNeedingReview?: number;
  roleExplanation?: string;
  before?: Record<string, unknown> | null;
  afterPreview?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  sourceQuality?: number;
  leakage?: { passed?: boolean; reasons?: string[] };
};

const labels: Record<ParsedDemoSourceTool, string> = {
  cs_demo_manager: "CS Demo Manager",
  awpy: "Awpy",
  demoparser: "demoparser",
  demoinfocs: "demoinfocs",
  custom: "custom parsed JSON"
};

export function ParsedDemoExportPanel({ defaultMatchId, compact = false }: ParsedDemoExportPanelProps) {
  const [sourceTool, setSourceTool] = useState<ParsedDemoSourceTool>("custom");
  const [payload, setPayload] = useState(() => JSON.stringify(parsedDemoExportTemplate(defaultMatchId, "custom"), null, 2));
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState<"validate" | "preview" | "apply" | null>(null);
  const note = useMemo(() => getParsedDemoProfileNote(sourceTool), [sourceTool]);

  function resetTemplate(nextTool: ParsedDemoSourceTool) {
    setSourceTool(nextTool);
    setPayload(JSON.stringify(parsedDemoExportTemplate(defaultMatchId, nextTool), null, 2));
    setResult(null);
  }

  async function run(action: "validate" | "preview" | "apply") {
    setLoading(action);
    setResult(null);
    try {
      const endpoint = action === "apply" ? "/api/admin/parsed-demo-export/apply" : "/api/admin/parsed-demo-export/validate";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload, mode: action === "preview" ? "preview" : "validate" })
      });
      const data = await response.json() as ApiResult;
      setResult(data);
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Request failed."] });
    } finally {
      setLoading(null);
    }
  }

  async function copyExample() {
    const example = JSON.stringify(parsedDemoExportExample(defaultMatchId, sourceTool), null, 2);
    await navigator.clipboard.writeText(example);
    setPayload(example);
  }

  function downloadTemplate() {
    const blob = new Blob([JSON.stringify(parsedDemoExportTemplate(defaultMatchId, sourceTool), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${defaultMatchId}_${sourceTool}_parsed_demo_export_template.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setPayload(await file.text());
    setResult(null);
  }

  return (
    <section id="parsed-demo-export-intake" className={compact ? "rounded border border-lab-green/35 bg-lab-panel p-4" : "rounded-2xl border border-lab-green/35 bg-lab-panel/90 p-5 shadow-[0_0_32px_rgba(34,197,94,0.08)]"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-green">JSON-first intake</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Загрузить demo/stat export</h2>
          <p className="mt-1 max-w-3xl text-sm text-lab-muted">
            Примите prepared JSON от CS Demo Manager, Awpy, demoparser, demoinfocs или custom normalized output. Raw .dem, XLSX и SQL парсеры пока inactive.
          </p>
        </div>
        <span className="rounded-full border border-lab-cyan/35 bg-lab-cyan/10 px-3 py-1 text-xs font-medium text-lab-cyan">match-scoped only</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.45fr)]">
        <div className="space-y-3">
          <label className="block text-sm text-lab-muted">
            Профиль
            <select
              value={sourceTool}
              onChange={(event) => resetTemplate(event.target.value as ParsedDemoSourceTool)}
              className="mt-1 w-full rounded-lg border border-lab-border bg-lab-panel2 px-3 py-2 text-white outline-none focus:border-lab-cyan"
            >
              {parsedDemoSourceTools.map((tool) => <option key={tool} value={tool}>{labels[tool]}</option>)}
            </select>
          </label>
          <label className="block text-sm text-lab-muted">
            JSON payload
            <textarea
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              rows={compact ? 10 : 16}
              className="mt-1 w-full resize-y rounded-lg border border-lab-border bg-black/30 p-3 font-mono text-xs text-white outline-none focus:border-lab-cyan"
              spellCheck={false}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">
              JSON file
              <input type="file" accept="application/json,.json" onChange={(event) => void loadFile(event.target.files?.[0])} className="hidden" />
            </label>
            <button type="button" onClick={() => void copyExample()} className="rounded-lg border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">
              Скопировать пример JSON
            </button>
            <button type="button" onClick={downloadTemplate} className="rounded-lg border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">
              Скачать шаблон JSON
            </button>
            <button type="button" onClick={() => void run("validate")} disabled={loading !== null} className="rounded-lg border border-lab-cyan/45 bg-lab-cyan/10 px-3 py-2 text-sm font-medium text-lab-cyan disabled:opacity-50">
              {loading === "validate" ? "Validate..." : "Validate"}
            </button>
            <button type="button" onClick={() => void run("preview")} disabled={loading !== null} className="rounded-lg border border-lab-violet/45 bg-lab-violet/10 px-3 py-2 text-sm font-medium text-lab-violet disabled:opacity-50">
              {loading === "preview" ? "Preview..." : "Preview"}
            </button>
            <button type="button" onClick={() => void run("apply")} disabled={loading !== null} className="rounded-lg border border-lab-green/45 bg-lab-green/10 px-3 py-2 text-sm font-medium text-lab-green disabled:opacity-50">
              {loading === "apply" ? "Apply..." : "Apply"}
            </button>
          </div>
        </div>

        <aside className="space-y-3">
          <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h3 className="font-semibold text-white">{note.label}: mapping notes</h3>
            <InfoList title="Ожидаемые поля" items={note.expectedFields} />
            <InfoList title="Создаёт records" items={note.targetRecords} />
            <InfoList title="Маппинг" items={note.mappingNotes} />
            <p className="mt-3 text-sm text-lab-muted">{note.forecastImpact}</p>
          </article>
          <article className="rounded-xl border border-lab-amber/25 bg-lab-amber/10 p-3 text-sm text-lab-amber">
            Этот импорт может повысить глубину данных, но прогноз станет готовым только если пройдены Real Forecast gates.
          </article>
          <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-lab-muted">
            <p><span className="text-white">post_match_analysis</span> — Эти данные подходят для разбора после матча и backtesting, но не используются как pre-match evidence.</p>
            <p className="mt-2"><span className="text-white">backtest_only</span> — Эти данные используются только для проверки модели, не для live-прогноза.</p>
          </article>
        </aside>
      </div>

      {result ? <ResultView result={result} /> : null}

      {!compact ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {PARSED_DEMO_EXPORT_PROFILE_NOTES.map((profile) => (
            <article key={profile.sourceTool} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
              <p className="text-xs uppercase text-lab-cyan">{profile.sourceTool}</p>
              <h3 className="mt-1 font-semibold text-white">{profile.label}</h3>
              <p className="mt-2 text-xs text-lab-muted">{profile.forecastImpact}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-lab-muted">
        {items.map((item) => <li key={item}>• {item}</li>)}
      </ul>
    </div>
  );
}

function ResultView({ result }: { result: ApiResult }) {
  const before = result.before ?? null;
  const after = result.after ?? result.afterPreview ?? null;
  return (
    <div className={`mt-4 rounded-xl border p-3 ${result.ok ? "border-lab-green/35 bg-lab-green/10" : "border-lab-red/35 bg-lab-red/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-white">{result.ok ? (result.applied ? "Apply complete" : "Validation / preview ok") : "Validation failed"}</h3>
        {typeof result.sourceQuality === "number" ? <span className="rounded border border-white/10 px-2 py-1 text-xs text-lab-muted">source quality {result.sourceQuality}</span> : null}
      </div>
      {result.roleExplanation ? <p className="mt-2 text-sm text-lab-muted">{result.roleExplanation}</p> : null}
      <List title="Errors" items={result.errors ?? []} tone="text-lab-red" />
      <List title="Warnings" items={result.warnings ?? []} tone="text-lab-amber" />
      <List title="Records preview" items={result.recordsPreview ?? []} tone="text-white" />
      {result.creates ? <CountGrid title="Would create" counts={result.creates} /> : null}
      {result.recordsCreated ? <CountGrid title="Created" counts={result.recordsCreated} /> : null}
      {typeof result.candidatesNeedingReview === "number" ? <p className="mt-3 text-sm text-lab-muted">Candidates needing review: <span className="text-white">{result.candidatesNeedingReview}</span></p> : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {before ? <SnapshotCard title="Before" snapshot={before} /> : null}
        {after ? <SnapshotCard title={result.applied ? "After" : "After preview"} snapshot={after} /> : null}
      </div>
      {result.leakage?.reasons?.length ? <List title="Leakage / cutoff" items={result.leakage.reasons} tone="text-lab-amber" /> : null}
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <ul className={`mt-1 space-y-1 text-sm ${tone}`}>
        {items.map((item, index) => <li key={`${title}-${index}-${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

function CountGrid({ title, counts }: { title: string; counts: Record<string, number> }) {
  return (
    <div className="mt-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(counts).map(([name, count]) => (
          <div key={name} className="rounded border border-white/10 bg-black/20 p-2">
            <p className="text-xs text-lab-muted">{name}</p>
            <p className="text-lg font-semibold text-white">{count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SnapshotCard({ title, snapshot }: { title: string; snapshot: Record<string, unknown> }) {
  const realDepth = snapshot.realDataDepth && typeof snapshot.realDataDepth === "object" ? snapshot.realDataDepth as Record<string, unknown> : null;
  return (
    <article className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-lab-muted">
      <h4 className="font-semibold text-white">{title}</h4>
      <p>Readiness: <span className="text-white">{String(snapshot.readiness ?? "n/a")}</span></p>
      <p>Real Forecast Ready: <span className="text-white">{String(snapshot.realForecastReady ?? snapshot.expectedRealForecastReady ?? "n/a")}</span></p>
      <p>Real Data Depth: <span className="text-white">{realDepth ? `${String(realDepth.level)}/5 · ${String(realDepth.label)}` : "n/a"}</span></p>
      <p>Confidence: <span className="text-white">{String(snapshot.confidence ?? "n/a")}</span></p>
    </article>
  );
}
