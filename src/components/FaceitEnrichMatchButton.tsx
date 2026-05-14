"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type FaceitEnrichResponse = {
  ok: boolean;
  error?: string;
  result?: {
    configured: boolean;
    enabled: boolean;
    reachable: boolean;
    teamContext: boolean;
    playerContext: boolean;
    stats: boolean;
    recordsFetched: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsSkipped: number;
    candidatesNeedingReview: number;
    errors: string[];
    notes: string[];
  };
};

export function FaceitEnrichMatchButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FaceitEnrichResponse["result"] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage("Проверяю FACEIT context только для выбранного матча...");
    setResult(null);
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "faceit_enrich_match", matchId })
      });
      const json = (await response.json()) as FaceitEnrichResponse;
      if (!json.ok || !json.result) throw new Error(json.error ?? json.result?.errors?.[0] ?? "FACEIT context enrichment failed.");
      setResult(json.result);
      setMessage("FACEIT context enrichment завершён. FACEIT остаётся optional context и не делает Real Forecast Ready сам по себе.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "FACEIT context enrichment недоступен.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="rounded border border-lab-border px-4 py-2 text-sm font-semibold text-lab-cyan hover:border-lab-cyan disabled:opacity-60"
      >
        {busy ? "Обогащаю FACEIT..." : "Обогатить FACEIT context"}
      </button>
      {message ? (
        <div className="max-w-xl rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
          <p className="text-white">{message}</p>
          {result ? (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div><dt>key configured</dt><dd className="text-white">{result.configured ? "yes" : "no"}</dd></div>
              <div><dt>reachable</dt><dd className="text-white">{result.reachable ? "yes" : "no"}</dd></div>
              <div><dt>team context</dt><dd className="text-white">{result.teamContext ? "yes" : "no"}</dd></div>
              <div><dt>player context</dt><dd className="text-white">{result.playerContext ? "yes" : "no"}</dd></div>
              <div><dt>stats</dt><dd className="text-white">{result.stats ? "yes" : "no"}</dd></div>
              <div><dt>records</dt><dd className="text-white">{result.recordsFetched} fetched / {result.recordsCreated} created / {result.recordsUpdated} updated</dd></div>
              <div className="col-span-2"><dt>candidates needing review</dt><dd className="text-white">{result.candidatesNeedingReview}</dd></div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
