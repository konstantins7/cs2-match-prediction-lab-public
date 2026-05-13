"use client";

import { useState } from "react";
import type { SourceStatus } from "@/lib/sources/types";

type Action = {
  label: string;
  source?: SourceStatus["source"];
  jobType?: string;
  action?: string;
  requiredSource?: SourceStatus["source"];
  payload?: string;
};

const actions: Action[] = [
  { label: "Sync PandaScore Free Fixtures", action: "pandascore_free", requiredSource: "pandascore" },
  { label: "Sync Valve Rankings", source: "valve-rankings", jobType: "valve_rankings", requiredSource: "valve-rankings" },
  { label: "Sync Steam/CS Updates", source: "cs-updates", jobType: "game_meta_updates", requiredSource: "cs-updates" },
  { label: "Run All Free Sync", action: "run_all" },
  { label: "Rebuild Snapshots", action: "rebuild_snapshots" },
  { label: "Build basic form snapshots", action: "build_basic_form_snapshots" },
  { label: "Recalculate Upcoming Predictions", action: "recalculate_upcoming" }
];

export function SourceSyncPanel({ statuses }: { statuses: SourceStatus[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("Sync запускается только отсюда или через CLI; страницы сайта не запускают импорт.");
  const [manualPayload, setManualPayload] = useState("");
  const [hltvRankingPayload, setHltvRankingPayload] = useState("");
  const [parsedDemoPayload, setParsedDemoPayload] = useState("");
  const bySource = new Map(statuses.map((status) => [status.source, status]));

  async function run(action: Action) {
    setBusy(action.label);
    setMessage("Запуск sync job...");
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action)
      });
      const json = (await response.json()) as { ok: boolean; error?: string; result?: unknown; results?: unknown };
      setMessage(json.ok ? `${action.label}: job accepted. Обновите страницу, чтобы увидеть свежий SourceHealth.` : json.error ?? "Sync failed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runManualImport() {
    await run({ label: "Manual import", action: "manual_import", payload: manualPayload });
  }

  async function runParsedDemoImport() {
    await run({ label: "Parsed demo import", action: "parsed_demo_import", payload: parsedDemoPayload });
  }

  async function runHltvManualRankingImport() {
    await run({ label: "HLTV manual ranking import", action: "hltv_manual_ranking_import", payload: hltvRankingPayload });
  }

  return (
    <div className="space-y-4">
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Sync actions</h2>
        <p className="mt-1 text-sm text-lab-muted">{message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action) => {
            const status = action.requiredSource ? bySource.get(action.requiredSource) : null;
            const disabled = Boolean(status && !status.enabled) || busy !== null;
            return (
              <button
                key={action.label}
                type="button"
                disabled={disabled}
                onClick={() => run(action)}
                title={status && !status.enabled ? status.message : action.label}
                className="rounded border border-lab-border px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:text-lab-muted hover:border-lab-cyan"
              >
                {busy === action.label ? "Running..." : action.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">HLTV Manual Ranking Reference</h2>
        <p className="mt-1 text-sm text-lab-muted">Без scraping: только ручной CSV/JSON reference import для rank snapshots.</p>
        <textarea
          value={hltvRankingPayload}
          onChange={(event) => setHltvRankingPayload(event.target.value)}
          placeholder='{"source":"hltv_manual_reference","rankingDate":"2026-05-12","teams":[{"rank":1,"teamName":"Team Name","hltvReferenceUrl":"https://www.hltv.org/team/..."}]}'
          className="mt-3 min-h-28 w-full rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-white outline-none focus:border-lab-cyan"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={runHltvManualRankingImport}
          className="mt-3 rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
        >
          Import HLTV Manual Ranking
        </button>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Manual JSON/CSV fallback</h2>
        <textarea
          value={manualPayload}
          onChange={(event) => setManualPayload(event.target.value)}
          placeholder='{"source":"manual","entityType":"matches","matches":[{"eventName":"Open Qualifier","startTime":"2026-05-13T18:00:00.000Z","format":"BO3","teamA":"Example One","teamB":"Example Two","status":"upcoming","maps":[]}]}'
          className="mt-3 min-h-28 w-full rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-white outline-none focus:border-lab-cyan"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={runManualImport}
          className="mt-3 rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
        >
          Import Manual JSON/CSV
        </button>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Parsed Demo JSON Import</h2>
        <p className="mt-1 text-sm text-lab-muted">Импорт локального parsed demo JSON для PlayerStatSnapshot, TeamMapStat и TeamFormSnapshot.</p>
        <textarea
          value={parsedDemoPayload}
          onChange={(event) => setParsedDemoPayload(event.target.value)}
          placeholder='{"teams":[],"playerStats":[],"mapStats":[],"teamForms":[]}'
          className="mt-3 min-h-28 w-full rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-white outline-none focus:border-lab-cyan"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={runParsedDemoImport}
          className="mt-3 rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
        >
          Import Parsed Demo JSON
        </button>
      </section>
    </div>
  );
}
