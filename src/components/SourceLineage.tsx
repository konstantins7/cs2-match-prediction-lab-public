"use client";

import { useEffect, useState } from "react";
import type { AutoAllLineageResult } from "@/lib/autoAllLineage";

type ApiResponse = {
  ok: boolean;
  result?: AutoAllLineageResult;
  error?: string;
};

export function SourceLineage({ matchId, refreshKey = 0, compact = false }: { matchId: string; refreshKey?: number; compact?: boolean }) {
  const [lineage, setLineage] = useState<AutoAllLineageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const response = await fetch(`/api/auto-all?view=lineage&matchId=${encodeURIComponent(matchId)}`);
        const json = await response.json() as ApiResponse;
        if (!json.ok || !json.result) throw new Error(json.error ?? "Source lineage unavailable.");
        if (!cancelled) setLineage(json.result);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Source lineage unavailable.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [matchId, refreshKey]);

  return (
    <section className={compact ? "rounded border border-lab-border bg-lab-panel2 p-3" : "rounded border border-lab-border bg-lab-panel p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-cyan">Source lineage</p>
          <h3 className="mt-1 font-semibold text-white">Private inbox evidence</h3>
        </div>
        <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">{lineage?.files.length ?? 0} file(s)</span>
      </div>
      {error ? <p className="mt-3 text-sm text-lab-red">{error}</p> : null}
      {lineage ? (
        <div className="mt-3 space-y-3">
          {lineage.files.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="uppercase text-lab-muted">
                  <tr>
                    <th className="py-2">File</th>
                    <th>Status</th>
                    <th>Rows</th>
                    <th>Source</th>
                    <th>Confidence</th>
                    <th>Blocks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-lab-border">
                  {lineage.files.map((file) => (
                    <tr key={file.fileName}>
                      <td className="py-2 text-white">{file.fileName}</td>
                      <td className={file.validationStatus === "passed" ? "text-lab-green" : file.validationStatus === "failed" ? "text-lab-red" : "text-lab-amber"}>{file.validationStatus}</td>
                      <td className="text-lab-muted">{file.rowsParsed}</td>
                      <td className="text-lab-muted">{file.sourceNames.join(", ") || "-"}</td>
                      <td className="text-lab-muted">{file.confidenceValues.join(", ") || "-"}</td>
                      <td className="text-lab-muted">{file.blocksCovered.join(", ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-lab-muted">No accepted private-inbox files found yet.</p>
          )}
          <p className="text-sm text-lab-muted">{lineage.nextAction}</p>
        </div>
      ) : !error ? (
        <p className="mt-3 text-sm text-lab-muted">Loading source lineage...</p>
      ) : null}
    </section>
  );
}
