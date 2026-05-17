"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ForecastAutopilotMode, ForecastAutopilotResult } from "@/lib/autoResearchShared";

type ApiResponse = {
  ok: boolean;
  error?: string;
  result?: ForecastAutopilotResult;
};

const modes: Array<{ value: ForecastAutopilotMode; label: string; description: string }> = [
  { value: "fast", label: "Быстро", description: "Только auto free sources." },
  { value: "deeper", label: "Глубже", description: "Free + подключённые API." },
  { value: "max", label: "Максимум", description: "Auto + API + wizard/manual/parsed demo." }
];

export function ForecastAutopilotButton({ matchId, compact = false }: { matchId?: string; compact?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<ForecastAutopilotMode>("fast");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ForecastAutopilotResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(scope: "current" | "best" = matchId ? "current" : "best") {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forecast_autopilot", mode, matchId: scope === "current" ? matchId : undefined })
      });
      const json = await response.json() as ApiResponse;
      if (!json.ok || !json.result) throw new Error(json.error ?? "Autopilot не смог подготовить прогноз.");
      setResult(json.result);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Autopilot не смог подготовить прогноз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={compact ? "rounded border border-lab-border bg-lab-panel2 p-4" : "rounded border border-lab-cyan/40 bg-lab-panel p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-lab-cyan">Forecast Autopilot</p>
          <h2 className="mt-1 font-semibold text-white">{matchId ? "Подготовить прогноз для этого матча" : "Найти лучший матч для прогноза"}</h2>
          <p className="mt-1 text-sm text-lab-muted">
            {matchId
              ? "Current Match Autopilot не переключает цель молча: он проверит этот матч и сравнит его с лучшим кандидатом."
              : "Best Match Autopilot обновит разрешённое, оценит upcoming матчи и выберет лучший legal-data candidate."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => run(matchId ? "current" : "best")} className="rounded bg-lab-cyan px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">
            {busy ? "Готовлю прогноз..." : matchId ? "Подготовить прогноз для этого матча" : "Найти лучший матч для прогноза"}
          </button>
          {matchId ? (
            <button type="button" disabled={busy} onClick={() => run("best")} className="rounded border border-lab-border px-4 py-2 text-sm font-semibold text-lab-cyan hover:border-lab-cyan disabled:opacity-60">
              Найти матч с лучшими данными
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {modes.map((item) => (
          <label key={item.value} className={mode === item.value ? "rounded border border-lab-cyan bg-lab-panel p-3" : "rounded border border-lab-border bg-lab-panel2 p-3"}>
            <input className="mr-2" type="radio" name={`autopilot-mode-${matchId ?? "global"}`} value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)} />
            <span className="text-sm font-medium text-white">{item.label}</span>
            <p className="mt-1 text-xs text-lab-muted">{item.description}</p>
          </label>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-lab-red">{error}</p> : null}
      {result ? (
        <div className="mt-4 rounded border border-lab-border bg-lab-panel2 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">{result.message}</p>
              <p className="mt-1 text-xs text-lab-muted">
                Mode: {result.mode} · state: {result.state} · readiness: {result.readinessLevel ?? "summary"}
                {result.coverageScore !== undefined ? ` · coverage ${result.coverageScore}/100` : ""}
                {result.forecastabilityTier ? ` · Forecastability: ${tierLabel(result.forecastabilityTier)}` : ""}
              </p>
            </div>
            <Link href={withMatch(result.primaryAction.href, matchId)} className="rounded bg-lab-cyan px-3 py-2 text-sm font-semibold text-black">
              {result.primaryAction.label}
            </Link>
          </div>
          <p className="mt-2 text-sm text-lab-muted">{result.primaryAction.reason}</p>
          {result.currentCandidate && result.bestCandidate && result.currentCandidate.matchId !== result.bestCandidate.matchId ? (
            <div className="mt-3 rounded border border-lab-amber/50 bg-lab-amber/10 p-3 text-sm text-lab-muted">
              <p className="font-medium text-lab-amber">Почему текущий матч не лучший candidate</p>
              <p className="mt-1">{result.whyNotSelected}</p>
              <p className="mt-1">
                Этот матч: {result.currentCandidate.coverageScore}/100 · {result.currentCandidate.forecastabilityLabel}. Лучший: {result.bestCandidate.coverageScore}/100 · {result.bestCandidate.forecastabilityLabel}.
              </p>
              <Link href={result.bestCandidate.href} className="mt-2 inline-flex rounded border border-lab-cyan/50 px-2 py-1 text-xs text-lab-cyan hover:bg-lab-cyan/10">
                Открыть лучший матч
              </Link>
            </div>
          ) : null}
          {result.bestCandidate ? <CandidateCard title="Лучший кандидат" candidate={result.bestCandidate} /> : null}
          {result.coverageBreakdown?.length ? <CoverageBreakdown items={result.coverageBreakdown} /> : null}
          {result.secondaryActions.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {result.secondaryActions.slice(0, 2).map((action) => (
                <Link key={action.label} href={withMatch(action.href, matchId)} className="rounded border border-lab-border px-2 py-1 text-xs text-lab-cyan hover:border-lab-cyan">
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Panel title="Автоматически удалось" items={result.succeeded} />
            <Panel title="Ещё не хватает" items={result.blockers?.length ? result.blockers : result.unavailable} />
          </div>
          {result.topCandidates?.length ? (
            <div className="mt-3 rounded border border-lab-border p-3">
              <p className="text-xs uppercase text-lab-muted">Top candidates</p>
              <div className="mt-2 grid gap-2">
                {result.topCandidates.slice(0, 5).map((candidate, index) => (
                  <div key={candidate.matchId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-lab-border bg-lab-panel p-2 text-xs">
                    <div>
                      <p className="text-white">{index + 1}. {candidate.teamAName} vs {candidate.teamBName}</p>
                      <p className="mt-1 text-lab-muted">{candidate.coverageScore}/100 · {candidate.forecastabilityLabel} · {candidate.whySelected ?? candidate.whyNotSelected ?? candidate.selectionReason}</p>
                    </div>
                    <Link href={candidate.href} className="rounded border border-lab-cyan/50 px-2 py-1 text-lab-cyan hover:bg-lab-cyan/10">Открыть</Link>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Panel title="Provider contribution" items={(result.providerContributions ?? []).map((item) => `${item.source}: ${item.status} · ${item.contribution}`)} />
            <Panel title="Why selected / not selected" items={[result.selectionReason, result.whyNotSelected].filter(Boolean) as string[]} />
          </div>
          <div className="mt-3 rounded border border-lab-border p-3">
            <p className="text-xs uppercase text-lab-muted">Где взять данные</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {result.sourceSuggestions.slice(0, 4).map((suggestion) => (
                <div key={suggestion.label} className="text-xs text-lab-muted">
                  <span className="text-white">{suggestion.label}:</span> {suggestion.sources.join(" · ")}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function tierLabel(tier: string) {
  const labels: Record<string, string> = {
    READY: "Готов к реальному прогнозу",
    NEARLY_READY: "Почти готов",
    BASIC_ONLY: "Только базовый прогноз",
    BLOCKED: "Заблокирован",
    NOT_ENOUGH_DATA: "Недостаточно данных"
  };
  return labels[tier] ?? tier;
}

function CandidateCard({ title, candidate }: { title: string; candidate: NonNullable<ForecastAutopilotResult["bestCandidate"]> }) {
  return (
    <div className="mt-3 rounded border border-lab-cyan/45 bg-lab-cyan/10 p-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-white">{candidate.teamAName} vs {candidate.teamBName}</p>
          <p className="mt-1 text-xs text-lab-muted">{candidate.eventName} · {candidate.format} · {candidate.coverageScore}/100 · {candidate.forecastabilityLabel}</p>
        </div>
        <Link href={candidate.href} className="rounded bg-lab-cyan px-2 py-1 text-xs font-semibold text-black">Открыть</Link>
      </div>
      <p className="mt-2 text-sm text-lab-muted">{candidate.selectionReason}</p>
    </div>
  );
}

function CoverageBreakdown({ items }: { items: NonNullable<ForecastAutopilotResult["coverageBreakdown"]> }) {
  return (
    <div className="mt-3 rounded border border-lab-border p-3">
      <p className="text-xs uppercase text-lab-muted">Coverage breakdown</p>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="rounded border border-lab-border bg-lab-panel p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-white">{item.label}</span>
              <span className={item.status === "yes" ? "text-lab-green" : item.status === "partial" ? "text-lab-amber" : "text-lab-red"}>{item.points}/{item.maxPoints}</span>
            </div>
            <p className="mt-1 text-lab-muted">{item.explanation}</p>
            {item.blocker ? <p className="mt-1 text-lab-amber">{item.blocker}</p> : null}
            {item.freshness ? (
              <p className="mt-1 text-lab-muted">
                freshness {item.freshness.freshnessDays ?? "n/a"}d · period {item.freshness.dataPeriod ?? "n/a"} · target {item.freshness.targetStartTime.slice(0, 10)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-lab-border p-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-lab-muted">
        {items.slice(0, 6).map((item) => <li key={`${title}-${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

function withMatch(href: string, matchId?: string) {
  if (!matchId || !href.startsWith("/admin/research-queue")) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}matchId=${encodeURIComponent(matchId)}`;
}
