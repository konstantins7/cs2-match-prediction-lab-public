"use client";

import { useMemo, useState } from "react";
import {
  analystSheetLabel,
  analystSheetTemplates,
  analystSheetTypes,
  buildAnalystSheetTemplate,
  buildTargetAnalystSheetTemplate,
  type AnalystSheetTemplateContext,
  type AnalystSheetType
} from "@/lib/analystSheetTemplates";

type AnalystSheetImportPanelProps = {
  defaultMatchId: string;
  compact?: boolean;
  initialContent?: "templates" | "empty";
  templateContext?: AnalystSheetTemplateContext;
};

type ApiResult = {
  ok?: boolean;
  applied?: boolean;
  sheetValid?: boolean;
  manualRealPackValid?: boolean;
  errors?: string[];
  warnings?: string[];
  rowsParsed?: number;
  rowsBySheet?: Record<string, number>;
  sheetsLoaded?: AnalystSheetType[];
  coveredBlocks?: string[];
  missingBlocks?: string[];
  recordsPreview?: string[];
  convertedManualRealPack?: Record<string, unknown> | null;
  before?: Record<string, unknown> | null;
  afterPreview?: Record<string, unknown> | null;
  applyResult?: Record<string, unknown>;
};

export function AnalystSheetImportPanel({ defaultMatchId, compact = false, initialContent = "templates", templateContext }: AnalystSheetImportPanelProps) {
  const [selectedSheet, setSelectedSheet] = useState<AnalystSheetType>("roster");
  const templateContent = (sheetType: AnalystSheetType) => templateContext
    ? buildTargetAnalystSheetTemplate(sheetType, templateContext)
    : buildAnalystSheetTemplate(sheetType);
  const [contents, setContents] = useState<Record<AnalystSheetType, string>>(() => Object.fromEntries(
    analystSheetTypes.map((sheetType) => [sheetType, initialContent === "templates" ? templateContent(sheetType) : ""])
  ) as Record<AnalystSheetType, string>);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [fileWarning, setFileWarning] = useState("");
  const template = analystSheetTemplates[selectedSheet];
  const loadedSheets = useMemo(() => analystSheetTypes.filter((sheetType) => contents[sheetType].trim().length > 0), [contents]);

  function setSelectedContent(value: string) {
    setContents((current) => ({ ...current, [selectedSheet]: value }));
    setResult(null);
  }

  function sheetsFor(scope: "selected" | "all") {
    const sheetTypes = scope === "selected" ? [selectedSheet] : loadedSheets;
    return sheetTypes.map((sheetType) => ({ sheetType, content: contents[sheetType] })).filter((sheet) => sheet.content.trim().length > 0);
  }

  async function request(action: "validate" | "preview" | "apply", scope: "selected" | "all") {
    if (action === "apply" && sheetsFor(scope).length === 0) {
      setResult({
        ok: false,
        applied: false,
        errors: ["Нет реальных CSV/TSV данных для Apply. Сначала вставьте или загрузите заполненную таблицу."],
        warnings: ["workflow ready = yes; Real Forecast Ready остаётся no без валидных real sheets."],
        rowsParsed: 0,
        sheetsLoaded: [],
        coveredBlocks: [],
        missingBlocks: analystSheetTypes.filter((sheetType) => ["roster", "player_stats", "map_stats", "veto_history"].includes(sheetType)).map((sheetType) => analystSheetTemplates[sheetType].coveredBlock)
      });
      return;
    }
    setLoading(`${action}-${scope}`);
    setResult(null);
    try {
      const endpoint = action === "apply" ? "/api/admin/analyst-sheet/apply" : "/api/admin/analyst-sheet/validate";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: defaultMatchId, sheets: sheetsFor(scope), mode: action })
      });
      const json = await response.json() as ApiResult;
      setResult(json);
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Request failed."] });
    } finally {
      setLoading(null);
    }
  }

  async function copyTemplate() {
    const value = templateContent(selectedSheet);
    await navigator.clipboard.writeText(value);
    setSelectedContent(value);
  }

  function downloadTemplate() {
    const blob = new Blob([templateContent(selectedSheet)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = template.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      setFileWarning("XLSX parser будет позже. Сейчас сохраните таблицу как CSV или TSV.");
      return;
    }
    setFileWarning("");
    setSelectedContent(await file.text());
  }

  return (
    <section id="analyst-sheet-import" className={compact ? "rounded border border-lab-cyan/35 bg-lab-panel p-4" : "rounded-2xl border border-lab-cyan/35 bg-lab-panel/90 p-5 shadow-[0_0_32px_rgba(56,189,248,0.08)]"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-cyan">CSV-first analyst import</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Загрузить analyst sheet</h2>
          <p className="mt-1 max-w-3xl text-sm text-lab-muted">
            CSV, TSV или copy-paste таблица конвертируется в existing manual_real_pack. XLSX, SQL и raw .dem parser worker остаются future/inactive.
          </p>
        </div>
        <span className="rounded-full border border-lab-amber/35 bg-lab-amber/10 px-3 py-1 text-xs font-medium text-lab-amber">без новых parser deps</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
        <div className="space-y-3">
          <label className="block text-sm text-lab-muted">
            Тип таблицы
            <select
              value={selectedSheet}
              onChange={(event) => {
                setSelectedSheet(event.target.value as AnalystSheetType);
                setResult(null);
              }}
              className="mt-1 w-full rounded-lg border border-lab-border bg-lab-panel2 px-3 py-2 text-white outline-none focus:border-lab-cyan"
            >
              {analystSheetTypes.map((sheetType) => <option key={sheetType} value={sheetType}>{analystSheetLabel(sheetType)}</option>)}
            </select>
          </label>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <h3 className="font-semibold text-white">{template.title}</h3>
            <p className="mt-1 text-sm text-lab-muted">{template.description}</p>
            <p className="mt-2 text-xs text-lab-amber">Шаблон — это пример структуры. Его нельзя применить без реальных данных.</p>
            {templateContext ? (
              <p className="mt-1 text-xs text-lab-muted">
                Target template: {templateContext.matchId} · {templateContext.teamAName} vs {templateContext.teamBName}; placeholder rows оставлены с sampleSize=0/confidence=0.
              </p>
            ) : null}
            <p className="mt-2 break-words font-mono text-[11px] text-lab-muted">{template.columns.join(", ")}</p>
          </div>

          <label className="block text-sm text-lab-muted">
            CSV/TSV content
            <textarea
              value={contents[selectedSheet]}
              onChange={(event) => setSelectedContent(event.target.value)}
              rows={compact ? 8 : 14}
              className="mt-1 w-full resize-y rounded-lg border border-lab-border bg-black/30 p-3 font-mono text-xs text-white outline-none focus:border-lab-cyan"
              spellCheck={false}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">
              Upload CSV/TSV
              <input type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(event) => void loadFile(event.target.files?.[0])} className="hidden" />
            </label>
            <button type="button" onClick={() => void copyTemplate()} className="rounded-lg border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">
              Скопировать CSV template
            </button>
            <button type="button" onClick={downloadTemplate} className="rounded-lg border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">
              Скачать CSV template
            </button>
          </div>
          {fileWarning ? <p className="text-sm text-lab-amber">{fileWarning}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Action onClick={() => void request("validate", "selected")} loading={loading === "validate-selected"} label="Validate" />
            <Action onClick={() => void request("preview", "selected")} loading={loading === "preview-selected"} label="Preview" tone="violet" />
            <Action onClick={() => void request("apply", "selected")} loading={loading === "apply-selected"} label="Apply" tone="green" />
            <Action onClick={() => void request("validate", "all")} loading={loading === "validate-all"} label="Validate all" />
            <Action onClick={() => void request("preview", "all")} loading={loading === "preview-all"} label="Preview combined pack" tone="violet" />
            <Action onClick={() => void request("apply", "all")} loading={loading === "apply-all"} label="Apply combined pack" tone="green" />
          </div>
        </div>

        <aside className="space-y-3">
          <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h3 className="font-semibold text-white">Import session</h3>
            <p className="mt-1 text-sm text-lab-muted">State хранится только на этой странице. DB session не создаётся.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {loadedSheets.map((sheetType) => (
                <span key={sheetType} className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">
                  {analystSheetLabel(sheetType)}
                </span>
              ))}
            </div>
          </article>
          <article className="rounded-xl border border-lab-amber/25 bg-lab-amber/10 p-3 text-sm text-lab-amber">
            Если вы загрузили только составы, это улучшит покрытие данных, но для аналитического прогноза ещё нужны player stats, map stats и veto.
          </article>
        </aside>
      </div>

      {result ? <ResultView result={result} /> : null}
    </section>
  );
}

function Action({ label, loading, onClick, tone = "cyan" }: { label: string; loading: boolean; onClick: () => void; tone?: "cyan" | "violet" | "green" }) {
  const color = tone === "green" ? "border-lab-green/45 bg-lab-green/10 text-lab-green" : tone === "violet" ? "border-lab-violet/45 bg-lab-violet/10 text-lab-violet" : "border-lab-cyan/45 bg-lab-cyan/10 text-lab-cyan";
  return (
    <button type="button" onClick={onClick} disabled={loading} className={`rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 ${color}`}>
      {loading ? `${label}...` : label}
    </button>
  );
}

function ResultView({ result }: { result: ApiResult }) {
  const applyAfter = result.applyResult?.after && typeof result.applyResult.after === "object" ? result.applyResult.after as Record<string, unknown> : null;
  const applyChanges = Array.isArray(result.applyResult?.whatChanged) ? result.applyResult.whatChanged.map(String) : [];
  return (
    <div className={`mt-4 rounded-xl border p-3 ${result.ok ? "border-lab-green/35 bg-lab-green/10" : "border-lab-red/35 bg-lab-red/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-white">{result.applied ? "Apply complete" : result.ok ? "Validation / preview ok" : "Needs fixes"}</h3>
        <span className="rounded border border-white/10 px-2 py-1 text-xs text-lab-muted">{result.rowsParsed ?? 0} rows parsed</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Mini title="Sheets loaded" value={(result.sheetsLoaded ?? []).join(", ") || "none"} />
        <Mini title="Covered blocks" value={(result.coveredBlocks ?? []).join(", ") || "none"} />
        <Mini title="Missing blocks" value={(result.missingBlocks ?? []).join(", ") || "none"} />
      </div>
      <List title="Errors" items={result.errors ?? []} tone="text-lab-red" />
      <List title="Warnings" items={result.warnings ?? []} tone="text-lab-amber" />
      <List title="Records that would be created" items={result.recordsPreview ?? []} tone="text-white" />
      <List title="Records created after apply" items={applyChanges} tone="text-lab-green" />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {result.before ? <Snapshot title="Before" snapshot={result.before} /> : null}
        {result.afterPreview ? <Snapshot title="After preview" snapshot={result.afterPreview} /> : null}
        {applyAfter ? <Snapshot title="After apply" snapshot={applyAfter} /> : null}
      </div>
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

function Snapshot({ title, snapshot }: { title: string; snapshot: Record<string, unknown> }) {
  const realDepth = snapshot.realDataDepth && typeof snapshot.realDataDepth === "object" ? snapshot.realDataDepth as Record<string, unknown> : null;
  const dataQuality = snapshot.dataQualityScore ?? snapshot.dataQuality;
  const confidence = snapshot.confidenceScore ?? snapshot.confidence;
  return (
    <article className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-lab-muted">
      <h4 className="font-semibold text-white">{title}</h4>
      <p>Readiness: <span className="text-white">{String(snapshot.readiness ?? "n/a")}</span></p>
      <p>Real Forecast Ready: <span className="text-white">{String(snapshot.realForecastReady ?? "n/a")}</span></p>
      <p>Data Quality: <span className="text-white">{String(dataQuality ?? "n/a")}</span></p>
      <p>Confidence: <span className="text-white">{String(confidence ?? "n/a")}</span></p>
      <p>Real Data Depth: <span className="text-white">{realDepth ? `${String(realDepth.level)}/5 · ${String(realDepth.label)}` : "n/a"}</span></p>
    </article>
  );
}
