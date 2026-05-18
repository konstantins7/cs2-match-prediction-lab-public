"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeatureSnapshotView } from "./FeatureSnapshotPanel";

type MatchFeatureSnapshotView = FeatureSnapshotView & {
  teamAAvgPlayerRating: number;
  teamBAvgPlayerRating: number;
  teamATotalMapsPlayed: number;
  teamBTotalMapsPlayed: number;
};

type ApiResponse = {
  ok: boolean;
  snapshot?: MatchFeatureSnapshotView | null;
  error?: string;
};

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function listFromJson(value: string) {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

function sourceRows(value: string) {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  return Object.entries(parsed as Record<string, Record<string, unknown>>)
    .filter(([, item]) => item && typeof item === "object")
    .slice(0, 8)
    .map(([key, item]) => ({
      key,
      mode: String(item.sourceMode ?? "unknown"),
      confidence: typeof item.confidence === "number" ? Math.round(item.confidence * 100) : null,
      sampleSize: typeof item.sampleSize === "number" ? item.sampleSize : null
    }));
}

export function MatchFeaturesPanel({ matchId, initialSnapshot }: { matchId: string; initialSnapshot?: MatchFeatureSnapshotView | null }) {
  const [snapshot, setSnapshot] = useState<MatchFeatureSnapshotView | null | undefined>(initialSnapshot);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/match-features/${encodeURIComponent(matchId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as ApiResponse;
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Feature snapshot lookup failed.");
        if (!cancelled) setSnapshot(payload.snapshot ?? null);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Feature snapshot lookup failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const missing = useMemo(() => listFromJson(snapshot?.missingCriticalDataJson ?? "[]"), [snapshot?.missingCriticalDataJson]);
  const sources = useMemo(() => sourceRows(snapshot?.featureSourcesJson ?? "{}"), [snapshot?.featureSourcesJson]);

  if (error) {
    return (
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">ML features</h2>
        <p className="mt-2 text-sm text-lab-red">{error}</p>
      </section>
    );
  }

  if (snapshot === undefined) {
    return (
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">ML features</h2>
        <p className="mt-2 text-sm text-lab-muted">Загружаю последний feature snapshot...</p>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">ML features</h2>
        <p className="mt-2 text-sm text-lab-muted">Feature snapshot пока не создан для этого матча.</p>
      </section>
    );
  }

  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">ML features</h2>
          <p className="mt-1 text-sm text-lab-muted">Последний MatchFeatureSnapshot: readiness, raw поля и source lineage.</p>
        </div>
        <span className={snapshot.dataLeakageCheckPassed ? "rounded border border-lab-green/60 px-2 py-1 text-xs text-lab-green" : "rounded border border-lab-red/60 px-2 py-1 text-xs text-lab-red"}>
          Leakage: {snapshot.dataLeakageCheckPassed ? "passed" : "failed"}
        </span>
      </div>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-4">
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">Readiness</dt><dd className="mt-1 text-white">{snapshot.readinessLevel}</dd></div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">Model</dt><dd className="mt-1 text-white">{snapshot.modelVersion}</dd></div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">A avg rating</dt><dd className="mt-1 text-white">{snapshot.teamAAvgPlayerRating.toFixed(3)}</dd></div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">B avg rating</dt><dd className="mt-1 text-white">{snapshot.teamBAvgPlayerRating.toFixed(3)}</dd></div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">A maps</dt><dd className="mt-1 text-white">{snapshot.teamATotalMapsPlayed}</dd></div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">B maps</dt><dd className="mt-1 text-white">{snapshot.teamBTotalMapsPlayed}</dd></div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">DQ</dt><dd className="mt-1 text-white">{snapshot.dataQualityScore}/100</dd></div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3"><dt className="text-lab-muted">Source confidence</dt><dd className="mt-1 text-white">{Math.round(snapshot.sourceConfidence * 100)}%</dd></div>
      </dl>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Missing critical data</h3>
          <ul className="mt-2 space-y-2 text-sm text-lab-muted">
            {missing.length ? missing.slice(0, 10).map((item) => <li key={item}>{item}</li>) : <li>Критичных пропусков нет.</li>}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Feature sources</h3>
          <div className="mt-2 space-y-2 text-sm text-lab-muted">
            {sources.length ? sources.map((row) => (
              <p key={row.key} className="flex flex-wrap justify-between gap-2 rounded border border-lab-border bg-lab-panel2 px-3 py-2">
                <span>{row.key}: {row.mode}</span>
                <span>{row.sampleSize !== null ? `n=${row.sampleSize}` : "n/a"}{row.confidence !== null ? ` · ${row.confidence}%` : ""}</span>
              </p>
            )) : <p>No source lineage rows.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
