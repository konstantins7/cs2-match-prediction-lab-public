"use client";

import { useMemo, useState } from "react";
import { manualEnrichmentTemplates } from "@/lib/manualEnrichmentTemplates";
import type { ResearchTask } from "@/lib/researchQueueCore";

const manualTemplateLabels: Array<[keyof typeof manualEnrichmentTemplates, string]> = [
  ["manual_real_pack", "Manual Real Pack"],
  ["roster", "Roster JSON"],
  ["player_stats", "Player Stats JSON"],
  ["map_stats", "Map Stats JSON"],
  ["veto_history", "Veto History JSON"],
  ["h2h", "H2H JSON"],
  ["news", "News/Roster Events JSON"],
  ["parsed_demo", "Parsed Demo JSON"]
];

type MatchOption = {
  matchId: string;
  label: string;
  tasks: ResearchTask[];
};

const builderSteps = [
  ["ranking", "Step 1 — Team identity / rank", "ranking confirmation + basic results -> может поднять до L2", "Confirm rank/team match"],
  ["roster", "Step 2 — Roster", "roster -> открывает путь к L2/L3", "Bind roster"],
  ["player_stats", "Step 3 — Player stats", "roster + player stats -> L2 strong / L3 weak", "Import player stats"],
  ["map_stats", "Step 4 — Map stats", "roster + player stats + map stats -> L3 partial", "Import map stats"],
  ["veto_history", "Step 5 — Veto history", "roster + player/map/veto -> L3 full", "Import veto history"],
  ["h2h", "Step 6 — H2H", "H2H добавляет matchup context", "Add H2H"],
  ["news", "Step 7 — News / roster events", "news улучшает risk/confidence explanation", "Add news/roster events"],
  ["final", "Step 8 — Final readiness recalculation", "Apply -> rebuild snapshots -> recalculate predictions -> readiness before/after", "Recalculate predictions"]
] as const;

export function ManualEnrichmentPanel({ defaultMatchId, analystSampleEnabled = false, matchOptions = [] }: { defaultMatchId?: string; analystSampleEnabled?: boolean; matchOptions?: MatchOption[] }) {
  const [selectedMatchId, setSelectedMatchId] = useState(defaultMatchId ?? "pandascore_match_1474573");
  const [template, setTemplate] = useState<keyof typeof manualEnrichmentTemplates>("manual_real_pack");
  const initial = useMemo(() => buildPayload("manual_real_pack", selectedMatchId), [selectedMatchId]);
  const [payload, setPayload] = useState(initial);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const isSampleTemplate = template === "analyst_pack";
  const selectedOption = matchOptions.find((option) => option.matchId === selectedMatchId);
  const resultRecord = result && typeof result === "object" ? result as Record<string, unknown> : null;
  const blockStatuses = Array.isArray(resultRecord?.blockStatuses) ? resultRecord.blockStatuses as Array<Record<string, unknown>> : [];
  const payloadRecord = useMemo(() => {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [payload]);
  const metadata = (payloadRecord.metadata && typeof payloadRecord.metadata === "object" ? payloadRecord.metadata : payloadRecord) as Record<string, unknown>;

  function chooseTemplate(next: keyof typeof manualEnrichmentTemplates) {
    setTemplate(next);
    setPayload(buildPayload(next, selectedMatchId));
    setResult(null);
  }

  function chooseMatch(next: string) {
    setSelectedMatchId(next);
    setPayload(buildPayload(template, next));
    setResult(null);
  }

  async function send(endpoint: "validate" | "apply") {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(`/api/admin/manual-enrichment/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload })
      });
      const json = await response.json();
      setResult(json);
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Request failed."] });
    } finally {
      setLoading(false);
    }
  }

  async function resetSample() {
    if (!selectedMatchId) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/manual-enrichment/reset-sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: selectedMatchId })
      });
      setResult(await response.json());
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Reset failed."] });
    } finally {
      setLoading(false);
    }
  }

  async function resetManual() {
    if (!selectedMatchId) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/manual-enrichment/reset-manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: selectedMatchId })
      });
      setResult(await response.json());
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Reset manual_real failed."] });
    } finally {
      setLoading(false);
    }
  }

  async function exportManual() {
    if (!selectedMatchId) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/manual-enrichment/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: selectedMatchId })
      });
      const json = await response.json();
      setResult(json);
      if (json?.pack) setPayload(JSON.stringify(json.pack, null, 2));
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Export failed."] });
    } finally {
      setLoading(false);
    }
  }

  function stepStatus(step: (typeof builderSteps)[number]) {
    if (step[0] === "final") {
      if (resultRecord?.applied) return "applied";
      if (resultRecord?.ok === false) return "invalid";
      return "missing";
    }
    const preview = blockStatuses.find((status) => status.block === step[0]);
    if (preview?.status) return String(preview.status);
    const task = selectedOption?.tasks.find((item) => item.task === step[3]);
    if (task?.status === "done") return "applied";
    if (task?.status === "blocked") return "needs_review";
    return "missing";
  }

  function stepPreview(step: (typeof builderSteps)[number]) {
    return blockStatuses.find((status) => status.block === step[0]);
  }

  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div>
        <h2 className="font-semibold text-white">Real Data Acquisition Pack Wizard</h2>
        <p className="mt-1 text-sm text-lab-muted">
          Основной workflow для manual_real: проходите шаги, проверяйте blockQuality, затем Apply. Validate показывает preview без изменения БД. Apply сначала сохраняет raw ExternalSourceRecord, затем создаёт match-scoped domain records. Пользователь отвечает за достоверность ручных данных.
        </p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_2fr]">
        <label className="text-sm text-lab-muted">
          Selected match
          <select
            value={selectedMatchId}
            onChange={(event) => chooseMatch(event.target.value)}
            className="mt-1 w-full rounded border border-lab-border bg-lab-panel2 px-3 py-2 text-white outline-none focus:border-lab-cyan"
          >
            {matchOptions.length ? matchOptions.map((option) => (
              <option key={option.matchId} value={option.matchId}>{option.label}</option>
            )) : <option value={selectedMatchId}>{selectedMatchId}</option>}
          </select>
        </label>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {builderSteps.map((step) => {
            const preview = stepPreview(step);
            const status = stepStatus(step);
            return (
            <div key={step[0]} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-white">{step[1]}</p>
                <span className={statusClass(status)}>{status}</span>
              </div>
              <p className="mt-2 text-xs text-lab-muted">{step[2]}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-lab-muted">
                <dt>sourceMode</dt><dd className="text-white">{String(resultRecord?.sourceMode ?? (template === "analyst_pack" ? "analyst_sample" : "manual_real"))}</dd>
                <dt>sourceName</dt><dd className="text-white">{String(metadata.sourceName ?? "missing") || "missing"}</dd>
                <dt>collectedAt</dt><dd className="text-white">{String(metadata.collectedAt ?? "missing")}</dd>
                <dt>sampleSize</dt><dd className="text-white">{String(metadata.sampleSize ?? "missing")}</dd>
                <dt>confidence</dt><dd className="text-white">{String(metadata.confidence ?? "missing")}</dd>
                <dt>usedInPrediction</dt><dd className="text-white">{status === "applied" || status === "valid" ? "yes after Apply" : "no"}</dd>
                <dt>reasonIfNotUsed</dt><dd className="text-white">{status === "missing" ? "missing data" : status === "invalid" ? "validation failed" : "-"}</dd>
                <dt>blockQuality</dt><dd className="text-white">{preview?.quality !== undefined ? `${Math.round(Number(preview.quality) * 100)}/100` : step[0] === "final" && resultRecord?.manualRealPackQuality && typeof resultRecord.manualRealPackQuality === "object" ? `${String((resultRecord.manualRealPackQuality as Record<string, unknown>).score)}/100` : "n/a"}</dd>
              </dl>
            </div>
          );})}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {manualTemplateLabels.map(([key, label]) => (
          <button key={key} type="button" onClick={() => chooseTemplate(key)} className={template === key ? "rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black" : "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan"}>
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={!analystSampleEnabled}
          onClick={() => chooseTemplate("analyst_pack")}
          className={template === "analyst_pack" ? "rounded bg-violet-300 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40" : "rounded border border-violet-400/50 px-3 py-1.5 text-sm text-violet-200 hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-40"}
        >
          Generate Sample Analyst Pack
        </button>
      </div>

      {!analystSampleEnabled ? (
        <p className="mt-3 rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
          Sample generator disabled. Set ENABLE_ANALYST_SAMPLE=true locally to validate the pipeline with dev-only SAMPLE DATA.
        </p>
      ) : null}

      {isSampleTemplate ? (
        <div className="mt-3 rounded border border-violet-400/50 bg-violet-950/20 p-3 text-sm text-violet-100">
          <strong>SAMPLE DATA:</strong> этот pack match-scoped и исключён из real actionable/backtesting metrics. Он доказывает analyst workflow, но не является реальным прогнозом.
        </div>
      ) : (
        <div className="mt-3 rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
          Manual real enrichment: вставляйте только вручную проверенные реальные данные. SAMPLE и MANUAL REAL не смешиваются без badge.
        </div>
      )}

      <textarea
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        spellCheck={false}
        className="mt-3 min-h-[300px] w-full rounded border border-lab-border bg-lab-panel2 p-3 font-mono text-xs text-white outline-none focus:border-lab-cyan"
      />
      <p className="mt-2 text-xs text-lab-muted">Advanced JSON fallback. Wizard cards above are the primary workflow; textarea remains for batch import/export and precise analyst packs.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={loading} onClick={() => send("validate")} className="rounded border border-lab-cyan px-3 py-2 text-sm text-lab-cyan disabled:opacity-50">
          Validate
        </button>
        <button type="button" disabled={loading || (isSampleTemplate && !analystSampleEnabled)} onClick={() => send("apply")} className="rounded bg-lab-cyan px-3 py-2 text-sm font-medium text-black disabled:opacity-50">
          {isSampleTemplate ? "Apply Sample Analyst Pack" : "Apply Manual Real Enrichment"}
        </button>
        <button type="button" disabled={loading || !selectedMatchId} onClick={resetManual} className="rounded border border-lab-red/60 px-3 py-2 text-sm text-lab-red disabled:opacity-50">
          Reset manual_real data for selected match
        </button>
        <button type="button" disabled={loading || !selectedMatchId} onClick={exportManual} className="rounded border border-lab-green/60 px-3 py-2 text-sm text-lab-green disabled:opacity-50">
          Export current data pack JSON
        </button>
        <button type="button" disabled={loading || !selectedMatchId} onClick={resetSample} className="rounded border border-violet-400/60 px-3 py-2 text-sm text-violet-200 disabled:opacity-50">
          Reset sample data for selected match
        </button>
      </div>
      {Array.isArray(resultRecord?.whatStillMissing) && resultRecord.whatStillMissing.length ? (
        <div className="mt-3 rounded border border-lab-amber/60 bg-lab-panel2 p-3 text-sm text-lab-amber">
          What is still missing: {(resultRecord.whatStillMissing as string[]).join(", ")}
        </div>
      ) : null}
      {result ? (
        <pre className="mt-3 max-h-96 overflow-auto rounded border border-lab-border bg-lab-panel2 p-3 text-xs text-lab-muted">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

function buildPayload(template: keyof typeof manualEnrichmentTemplates, matchId?: string) {
  return JSON.stringify({ ...manualEnrichmentTemplates[template], matchId: matchId ?? manualEnrichmentTemplates[template].matchId }, null, 2);
}

function statusClass(status: string) {
  if (status === "applied" || status === "valid") return "rounded border border-lab-green/60 px-2 py-1 text-xs text-lab-green";
  if (status === "partial") return "rounded border border-lab-amber/60 px-2 py-1 text-xs text-lab-amber";
  if (status === "needs_review" || status === "invalid") return "rounded border border-lab-red/60 px-2 py-1 text-xs text-lab-red";
  return "rounded border border-lab-border px-2 py-1 text-xs text-lab-muted";
}
