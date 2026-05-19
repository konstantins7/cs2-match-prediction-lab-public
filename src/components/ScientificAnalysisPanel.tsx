"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Analysis = {
  matchId: string;
  cache: "hit" | "miss";
  dataQuality: { level: "green" | "yellow" | "red"; score: number; sampleSummary: Record<string, number>; warnings: string[] };
  playerMapEfficiency: Array<{ teamName: string; nickname: string; mapName: string; rating: number; normalizedRating: number; trendSlope: number; sampleSize: number; movingAverage: Array<{ day: string; value: number }> }>;
  teamSynergy: Array<{ teamName: string; rosterStability: number; leaderEffect: number; roleDiversity: number | null; pairCorrelations: Array<{ playerA: string; playerB: string; correlation: number; sampleSize: number }>; warnings: string[] }>;
  mapProbabilities: Array<{ mapName: string; teamAWinProbability: number; teamBWinProbability: number; teamASample: number; teamBSample: number; warnings: string[] }>;
  prediction: { teamA: string; teamB: string; teamAProbability: number; components: Record<string, number>; warnings: string[] };
  parsedDemo: { pistolRounds: number } | null;
  scientificFactors: Array<{ id: string; label: string; status: "available" | "partial" | "missing"; impact: number; explanation: string; warnings: string[]; details: Record<string, unknown> }>;
  outliers: Array<{ id: string; value: number; zScore: number }>;
  csv: string;
};

type ApiResponse = { ok: boolean; analysis?: Analysis; error?: string };

const periodOptions = [10, 20, 40];

export function ScientificAnalysisPanel({ matchId, teamA, teamB }: { matchId: string; teamA: string; teamB: string }) {
  const [periodDays, setPeriodDays] = useState(40);
  const [decayDays, setDecayDays] = useState(14);
  const [weights, setWeights] = useState({ elo: 34, maps: 43, synergy: 23 });
  const [selected, setSelected] = useState<string>("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      mode: "deep",
      v: "1",
      periodDays: String(periodDays),
      decayDays: String(decayDays),
      teamA,
      teamB,
      eloWeight: String(weights.elo),
      mapsWeight: String(weights.maps),
      synergyWeight: String(weights.synergy)
    });
    fetch(`/api/match-analysis/${encodeURIComponent(matchId)}?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<ApiResponse>)
      .then((json) => {
        if (!json.ok || !json.analysis) throw new Error(json.error ?? "Scientific analysis unavailable.");
        setAnalysis(json.analysis);
        setSelected((current) => current || (json.analysis?.playerMapEfficiency[0] ? keyFor(json.analysis.playerMapEfficiency[0]) : ""));
      })
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "Scientific analysis failed.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [matchId, teamA, teamB, periodDays, decayDays, weights]);

  const selectedMetric = useMemo(() => analysis?.playerMapEfficiency.find((row) => keyFor(row) === selected), [analysis, selected]);

  return (
    <section className="space-y-4">
      <div className="rounded border border-lab-border bg-lab-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-lab-cyan">Scientific analysis</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Научный анализ</h2>
            <p className="mt-2 max-w-3xl text-sm text-lab-muted">
              Расчёт читает только локальные normalized files из private inbox. Он не делает запросы в интернет и не влияет на Real Forecast Ready.
            </p>
          </div>
          {analysis ? (
            <div className="text-right">
              <p className="text-sm text-lab-muted">{analysis.prediction.teamA || teamA}</p>
              <p className="text-4xl font-semibold text-lab-cyan">{Math.round(analysis.prediction.teamAProbability)}%</p>
              <p className="text-sm text-lab-muted">model probability · cache {analysis.cache}</p>
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <ControlBlock title="Период">
            <div className="flex gap-2">
              {periodOptions.map((value) => (
                <button key={value} type="button" onClick={() => setPeriodDays(value)} className={periodDays === value ? activeButton : passiveButton}>{value}d</button>
              ))}
            </div>
          </ControlBlock>
          <ControlBlock title="Decay days">
            <input aria-label="decay days" type="range" min={7} max={40} value={decayDays} onChange={(event) => setDecayDays(Number(event.target.value))} className="w-full" />
            <p className="text-xs text-lab-muted">{decayDays} days</p>
          </ControlBlock>
          <WeightControl label="Elo" value={weights.elo} onChange={(value) => setWeights((current) => ({ ...current, elo: value }))} />
          <WeightControl label="Maps" value={weights.maps} onChange={(value) => setWeights((current) => ({ ...current, maps: value }))} />
          <WeightControl label="Synergy" value={weights.synergy} onChange={(value) => setWeights((current) => ({ ...current, synergy: value }))} />
        </div>
        {loading ? <p className="mt-4 text-sm text-lab-muted">Считаю локальную математику...</p> : null}
        {error ? <p className="mt-4 text-sm text-lab-red">{error}</p> : null}
      </div>

      {analysis ? (
        <>
          <QualityCard analysis={analysis} />
          <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
            <Heatmap rows={analysis.playerMapEfficiency} selected={selected} onSelect={setSelected} />
            <TrendCard metric={selectedMetric} />
          </div>
          <ScientificFactorsCard factors={analysis.scientificFactors} />
          <EloTrendCard analysis={analysis} />
          <div className="grid gap-4 lg:grid-cols-2">
            <MapProbabilityTable rows={analysis.mapProbabilities} teamA={teamA} teamB={teamB} />
            <SynergyTable rows={analysis.teamSynergy} />
          </div>
          {analysis.parsedDemo ? (
            <section className="rounded border border-lab-border bg-lab-panel p-4">
              <h3 className="font-semibold text-white">Parsed demo round analytics</h3>
              <p className="mt-2 text-sm text-lab-muted">Pistol rounds detected: {analysis.parsedDemo.pistolRounds}. CT/T splits appear here when parsed demo exports include round-side winners.</p>
            </section>
          ) : (
            <section className="rounded border border-lab-border bg-lab-panel p-4">
              <h3 className="font-semibold text-white">Раунд-анализ</h3>
              <p className="mt-2 text-sm text-lab-muted">Недостаточно данных для раундового анализа. Загрузите parsed demo export через /admin/imports, чтобы увидеть economy, pistol и clutch summaries.</p>
            </section>
          )}
          <p className="text-xs text-lab-muted">PDF экспорт пока отложен: используйте печать страницы браузера и Save as PDF. CSV ниже содержит агрегаты и player-map rows.</p>
          <CsvDownload csv={analysis.csv} matchId={matchId} />
        </>
      ) : null}
    </section>
  );
}

function ScientificFactorsCard({ factors }: { factors: Analysis["scientificFactors"] }) {
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <h3 className="font-semibold text-white">Advisory scientific factors</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {factors.length ? factors.map((factor) => (
          <article key={factor.id} className="rounded border border-lab-border bg-lab-panel2 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-white">{factor.label}</p>
              <span className={factor.status === "available" ? "text-lab-green" : factor.status === "partial" ? "text-lab-amber" : "text-lab-muted"}>{factor.status}</span>
            </div>
            <p className="mt-1 text-sm text-lab-muted">{factor.explanation}</p>
            <p className="mt-2 text-sm text-lab-cyan">Impact: {factor.impact > 0 ? "+" : ""}{factor.impact}% advisory</p>
            {factor.warnings.length ? <p className="mt-1 text-xs text-lab-amber">{factor.warnings[0]}</p> : null}
          </article>
        )) : <p className="text-sm text-lab-muted">No advisory factors available.</p>}
      </div>
    </section>
  );
}

function EloTrendCard({ analysis }: { analysis: Analysis }) {
  const data = [
    { point: "Elo", value: analysis.prediction.components.elo ?? 50 },
    { point: "Maps", value: analysis.prediction.components.maps ?? 50 },
    { point: "Synergy", value: analysis.prediction.components.synergy ?? 50 },
    { point: "Final", value: analysis.prediction.teamAProbability }
  ];
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <h3 className="font-semibold text-white">Model trend view</h3>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="point" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" domain={[0, 100]} />
            <Tooltip contentStyle={{ background: "#101620", border: "1px solid rgba(148,163,184,0.25)", color: "#fff" }} />
            <Line type="monotone" dataKey="value" stroke="#44ffd6" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function QualityCard({ analysis }: { analysis: Analysis }) {
  const color = analysis.dataQuality.level === "green" ? "text-lab-green border-lab-green/50" : analysis.dataQuality.level === "yellow" ? "text-lab-amber border-lab-amber/50" : "text-lab-red border-lab-red/50";
  return (
    <section className={`rounded border bg-lab-panel p-4 ${color}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-white">Data quality: {analysis.dataQuality.score}/100</h3>
        <span className="rounded border border-current px-2 py-1 text-xs uppercase">{analysis.dataQuality.level}</span>
      </div>
      <p className="mt-2 text-sm text-lab-muted">Samples: {Object.entries(analysis.dataQuality.sampleSummary).map(([key, value]) => `${key}=${value}`).join(", ")}</p>
      {analysis.outliers.length ? <p className="mt-2 text-sm text-lab-amber">Outliers detected: {analysis.outliers.slice(0, 3).map((row) => `${row.id} z=${row.zScore}`).join("; ")}</p> : null}
      {analysis.dataQuality.warnings.length ? <ul className="mt-2 space-y-1 text-sm text-lab-muted">{analysis.dataQuality.warnings.slice(0, 6).map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
    </section>
  );
}

function Heatmap({ rows, selected, onSelect }: { rows: Analysis["playerMapEfficiency"]; selected: string; onSelect: (value: string) => void }) {
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <h3 className="font-semibold text-white">Player-map efficiency</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-lab-muted"><tr><th className="py-2">Player</th><th>Map</th><th>KPD</th><th>Trend</th><th>Sample</th></tr></thead>
          <tbody className="divide-y divide-lab-border">
            {rows.length ? rows.map((row) => {
              const key = keyFor(row);
              const intensity = Math.max(0, Math.min(1, (row.normalizedRating - 0.8) / 0.5));
              return (
                <tr key={key} className={selected === key ? "bg-lab-cyan/10" : ""}>
                  <td className="py-2 text-white">{row.nickname}<span className="ml-2 text-xs text-lab-muted">{row.teamName}</span></td>
                  <td>{row.mapName}</td>
                  <td><button type="button" onClick={() => onSelect(key)} className="rounded px-2 py-1 text-black" style={{ backgroundColor: `rgba(68, 255, 214, ${0.25 + intensity * 0.75})` }}>{row.normalizedRating.toFixed(2)}</button></td>
                  <td className={row.trendSlope >= 0 ? "text-lab-green" : "text-lab-red"}>{row.trendSlope.toFixed(3)}</td>
                  <td>{row.sampleSize}</td>
                </tr>
              );
            }) : <tr><td className="py-3 text-lab-muted" colSpan={5}>Нет player_stats rows для heatmap.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrendCard({ metric }: { metric?: Analysis["playerMapEfficiency"][number] }) {
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <h3 className="font-semibold text-white">Trend detail</h3>
      {metric ? (
        <>
          <p className="mt-2 text-sm text-lab-muted">{metric.nickname} · {metric.mapName} · rating {metric.rating}</p>
          <div className="mt-4 flex h-32 items-end gap-1 border-b border-lab-border">
            {(metric.movingAverage.length ? metric.movingAverage : [{ day: "sample", value: metric.rating }]).map((point) => (
              <div key={point.day} title={`${point.day}: ${point.value}`} className="w-5 bg-lab-cyan/80" style={{ height: `${Math.max(8, Math.min(120, point.value * 70))}px` }} />
            ))}
          </div>
        </>
      ) : <p className="mt-2 text-sm text-lab-muted">Кликни ячейку heatmap, чтобы увидеть тренд.</p>}
    </section>
  );
}

function MapProbabilityTable({ rows, teamA, teamB }: { rows: Analysis["mapProbabilities"]; teamA: string; teamB: string }) {
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <h3 className="font-semibold text-white">Map win probabilities</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-lab-muted"><tr><th className="py-2">Map</th><th>{teamA}</th><th>{teamB}</th><th>Sample</th></tr></thead>
          <tbody className="divide-y divide-lab-border">
            {rows.length ? rows.map((row) => <tr key={row.mapName}><td className="py-2 text-white">{row.mapName}</td><td>{Math.round(row.teamAWinProbability)}%</td><td>{Math.round(row.teamBWinProbability)}%</td><td>{row.teamASample}/{row.teamBSample}</td></tr>) : <tr><td className="py-3 text-lab-muted" colSpan={4}>Нет map_stats rows.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SynergyTable({ rows }: { rows: Analysis["teamSynergy"] }) {
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <h3 className="font-semibold text-white">Team synergy</h3>
      <div className="mt-3 space-y-3">
        {rows.length ? rows.map((row) => (
          <article key={row.teamName} className="rounded border border-lab-border bg-lab-panel2 p-3">
            <p className="font-medium text-white">{row.teamName}</p>
            <p className="mt-1 text-sm text-lab-muted">Stability {Math.round(row.rosterStability * 100)}% · leader effect {row.leaderEffect.toFixed(2)} · role diversity {row.roleDiversity === null ? "n/a" : Math.round(row.roleDiversity * 100) + "%"}</p>
            <p className="mt-1 text-xs text-lab-muted">Top pair: {row.pairCorrelations.sort((a, b) => b.correlation - a.correlation)[0]?.playerA ?? "n/a"} / {row.pairCorrelations.sort((a, b) => b.correlation - a.correlation)[0]?.playerB ?? "n/a"}</p>
          </article>
        )) : <p className="text-sm text-lab-muted">Нет roster/player rows для synergy.</p>}
      </div>
    </section>
  );
}

function CsvDownload({ csv, matchId }: { csv: string; matchId: string }) {
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  return <a href={href} download={`${matchId}_scientific_metrics.csv`} className="inline-flex rounded border border-lab-cyan px-3 py-2 text-sm text-lab-cyan">Download scientific metrics CSV</a>;
}

function WeightControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <ControlBlock title={`${label} weight`}>
      <input aria-label={`${label} weight`} type="range" min={0} max={100} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full" />
      <p className="text-xs text-lab-muted">{value}</p>
    </ControlBlock>
  );
}

function ControlBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded border border-lab-border bg-lab-panel2 p-3"><p className="mb-2 text-xs uppercase text-lab-muted">{title}</p>{children}</div>;
}

function keyFor(row: Analysis["playerMapEfficiency"][number]) {
  return `${row.teamName}|${row.nickname}|${row.mapName}`;
}

const activeButton = "rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black";
const passiveButton = "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted";
