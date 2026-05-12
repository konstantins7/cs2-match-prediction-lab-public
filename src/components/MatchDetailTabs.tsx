"use client";

import { useState } from "react";
import { DataQualityPanel } from "./DataQualityPanel";
import { FactorBreakdownTable } from "./FactorBreakdownTable";
import { FactorContributionChart } from "./FactorContributionChart";
import { MapPoolMatrix } from "./MapPoolMatrix";
import { NewsImpactPanel } from "./NewsImpactPanel";
import { PlayerFormTable } from "./PlayerFormTable";
import { ProbabilityBar } from "./ProbabilityBar";
import { VetoScenarioCard } from "./VetoScenarioCard";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { RiskBadge } from "./RiskBadge";
import type { PredictionInput, PredictionOutput } from "@/lib/predictionEngine";
import { formatDateTime } from "@/lib/format";

const tabs = ["Overview", "Factor Breakdown", "Maps & Veto", "Players", "News & Events", "Head-to-Head", "Risk & Confidence", "Explanation"] as const;

export function MatchDetailTabs({ input, prediction }: { input: PredictionInput; prediction: PredictionOutput }) {
  const [active, setActive] = useState<(typeof tabs)[number]>("Overview");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={active === tab ? "rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black" : "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan hover:text-white"}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === "Overview" && (
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded border border-lab-border bg-lab-panel p-5">
            <p className="text-sm uppercase tracking-wide text-lab-cyan">{input.match.eventName}</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{input.teamA.name} vs {input.teamB.name}</h1>
            <p className="mt-2 text-sm text-lab-muted">{input.match.stage} · {formatDateTime(input.match.startTime)} · {input.match.format} · {input.match.isLan ? "LAN" : "Online"}</p>
            <p className="mt-4 text-sm leading-6 text-lab-muted">{prediction.explanation}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ConfidenceBadge value={prediction.confidenceScore} />
              <RiskBadge value={prediction.riskLevel} />
              <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">DQ {prediction.dataQualityScore}/100</span>
            </div>
          </div>
          <div className="rounded border border-lab-border bg-lab-panel p-5">
            <ProbabilityBar teamAName={input.teamA.name} teamBName={input.teamB.name} teamAProbability={prediction.teamAProbability} teamBProbability={prediction.teamBProbability} />
          </div>
        </section>
      )}

      {active === "Factor Breakdown" && (
        <section className="space-y-4">
          <FactorContributionChart factors={prediction.factors} />
          <FactorBreakdownTable factors={prediction.factors} teamAName={input.teamA.name} teamBName={input.teamB.name} />
        </section>
      )}

      {active === "Maps & Veto" && (
        <section className="space-y-4">
          <MapPoolMatrix input={input} />
          <div className="grid gap-4 lg:grid-cols-3">
            {prediction.vetoScenarios.map((scenario) => <VetoScenarioCard key={scenario.name} scenario={scenario} />)}
          </div>
        </section>
      )}

      {active === "Players" && (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold text-white">{input.teamA.name}</h2>
          <PlayerFormTable players={input.playersA} stats={input.playerStatsA} />
          <h2 className="text-xl font-semibold text-white">{input.teamB.name}</h2>
          <PlayerFormTable players={input.playersB} stats={input.playerStatsB} />
        </section>
      )}

      {active === "News & Events" && <NewsImpactPanel news={input.news} />}

      {active === "Head-to-Head" && (
        <section className="rounded border border-lab-border bg-lab-panel p-4">
          <h2 className="font-semibold text-white">Head-to-Head</h2>
          <div className="mt-3 space-y-2 text-sm text-lab-muted">
            {input.h2h.length === 0 ? <p>Релевантных H2H для текущих составов нет.</p> : input.h2h.map((entry) => (
              <p key={entry.matchId}>{formatDateTime(entry.date)} · {entry.format} · relevance {Math.round(entry.relevanceScore * 100)}% · roster similarity {Math.round(((entry.teamARosterSimilarity + entry.teamBRosterSimilarity) / 2) * 100)}%</p>
            ))}
          </div>
        </section>
      )}

      {active === "Risk & Confidence" && (
        <section className="space-y-4">
          <DataQualityPanel input={input} prediction={prediction} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Почему confidence повышен" items={prediction.riskBreakdown.confidenceDrivers} />
            <Panel title="Что снизило confidence" items={prediction.riskBreakdown.confidenceReducers} />
            <Panel title="Где не хватает данных" items={prediction.riskBreakdown.missingData} />
            <Panel title="Конфликты факторов и risk" items={[...prediction.riskBreakdown.conflictingFactors, ...prediction.riskBreakdown.riskReasons]} />
          </div>
        </section>
      )}

      {active === "Explanation" && (
        <section className="rounded border border-lab-border bg-lab-panel p-5">
          <h2 className="text-xl font-semibold text-white">Человеческое объяснение</h2>
          <p className="mt-3 leading-7 text-lab-muted">{prediction.explanation}</p>
          <p className="mt-4 text-sm text-lab-amber">Перед матчем нужно перепроверить roster/news, veto и источник свежих map-level данных. Это не гарантия результата.</p>
        </section>
      )}
    </div>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel p-4">
      <h3 className="font-semibold text-white">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-lab-muted">
        {items.length > 0 ? items.map((item) => <li key={item}>{item}</li>) : <li>Критичных сигналов нет.</li>}
      </ul>
    </div>
  );
}
