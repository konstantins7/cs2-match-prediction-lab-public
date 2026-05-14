"use client";

import { useState } from "react";

type FaceitManualImportResponse = {
  ok: boolean;
  error?: string;
  result?: {
    aliasesCreated: number;
    aliasesUpdated: number;
    candidatesCreated: number;
    candidatesUpdated: number;
    errors: string[];
  };
};

const placeholder = `entityType,name,faceitId
team,Natus Vincere,<faceitTeamId>
player,playerNickname,<faceitPlayerId>`;

export function FaceitManualIdImportPanel({ compact = false }: { compact?: boolean }) {
  const [payload, setPayload] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Manual FACEIT IDs only: no search by nickname, no team-name crawl, no broad sync.");

  async function run() {
    setBusy(true);
    setMessage("Импортирую FACEIT IDs как manual aliases...");
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "faceit_manual_id_import", payload })
      });
      const json = (await response.json()) as FaceitManualImportResponse;
      if (!json.ok || !json.result) throw new Error(json.error ?? "FACEIT manual ID import failed.");
      setMessage(
        `FACEIT IDs: aliases ${json.result.aliasesCreated} created / ${json.result.aliasesUpdated} updated; needs_review ${json.result.candidatesCreated + json.result.candidatesUpdated}. ${json.result.errors[0] ?? ""}`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "FACEIT manual ID import недоступен.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <h2 className="font-semibold text-white">Manual FACEIT ID Import</h2>
      <p className="mt-1 text-sm text-lab-muted">
        FACEIT используется только как optional context source. Импорт создаёт `EntityAlias`; low-confidence mapping уходит в `needs_review`.
      </p>
      <textarea
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        placeholder={compact ? "entityType,name,faceitId" : placeholder}
        className={`${compact ? "min-h-20" : "min-h-28"} mt-3 w-full rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-white outline-none focus:border-lab-cyan`}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className="rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
        >
          {busy ? "Импортирую..." : "Импортировать FACEIT IDs"}
        </button>
        <p className="text-sm text-lab-muted">{message}</p>
      </div>
    </section>
  );
}
