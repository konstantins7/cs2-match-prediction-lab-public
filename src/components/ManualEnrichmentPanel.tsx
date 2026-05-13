"use client";

import { useMemo, useState } from "react";
import { manualEnrichmentTemplates } from "@/lib/manualEnrichmentTemplates";

const manualTemplateLabels: Array<[keyof typeof manualEnrichmentTemplates, string]> = [
  ["roster", "Roster JSON"],
  ["player_stats", "Player Stats JSON"],
  ["map_stats", "Map Stats JSON"],
  ["veto_history", "Veto History JSON"],
  ["h2h", "H2H JSON"],
  ["news", "News/Roster Events JSON"],
  ["parsed_demo", "Parsed Demo JSON"]
];

export function ManualEnrichmentPanel({ defaultMatchId, analystSampleEnabled = false }: { defaultMatchId?: string; analystSampleEnabled?: boolean }) {
  const [template, setTemplate] = useState<keyof typeof manualEnrichmentTemplates>("roster");
  const initial = useMemo(() => buildPayload("roster", defaultMatchId), [defaultMatchId]);
  const [payload, setPayload] = useState(initial);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const isSampleTemplate = template === "analyst_pack";

  function chooseTemplate(next: keyof typeof manualEnrichmentTemplates) {
    setTemplate(next);
    setPayload(buildPayload(next, defaultMatchId));
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
    if (!defaultMatchId) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/manual-enrichment/reset-sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: defaultMatchId })
      });
      setResult(await response.json());
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Reset failed."] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div>
        <h2 className="font-semibold text-white">Manual / Sample Analyst Pack</h2>
        <p className="mt-1 text-sm text-lab-muted">
          Validate показывает preview без изменения БД. Apply сначала сохраняет raw ExternalSourceRecord, затем создаёт новые snapshots. SAMPLE DATA используется только для проверки pipeline.
        </p>
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
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={loading} onClick={() => send("validate")} className="rounded border border-lab-cyan px-3 py-2 text-sm text-lab-cyan disabled:opacity-50">
          Validate
        </button>
        <button type="button" disabled={loading || (isSampleTemplate && !analystSampleEnabled)} onClick={() => send("apply")} className="rounded bg-lab-cyan px-3 py-2 text-sm font-medium text-black disabled:opacity-50">
          {isSampleTemplate ? "Apply Sample Analyst Pack" : "Apply Manual Real Enrichment"}
        </button>
        <button type="button" disabled={loading || !defaultMatchId} onClick={resetSample} className="rounded border border-violet-400/60 px-3 py-2 text-sm text-violet-200 disabled:opacity-50">
          Reset sample data for selected match
        </button>
      </div>
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
