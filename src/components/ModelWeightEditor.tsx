"use client";

import { useMemo, useState } from "react";
import { calculatePrediction, type ModelWeights, type PredictionInput, type WeightKey } from "@/lib/predictionEngine";
import { ProbabilityBar } from "./ProbabilityBar";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { RiskBadge } from "./RiskBadge";

const labels: Record<WeightKey, string> = {
  teamStrength: "Team strength",
  recentForm: "Recent form",
  playerForm: "Player form",
  kdTrend: "K/D trend",
  mapPool: "Map pool",
  veto: "Veto",
  overtime: "Overtime",
  closing: "Closing",
  comeback: "Comeback",
  economy: "Pistol/force/economy",
  headToHead: "Head-to-head",
  newsImpact: "News impact",
  fatigue: "Schedule fatigue",
  lanOnline: "LAN/Online",
  format: "Format",
  dataQuality: "Data quality",
  metaShift: "Meta shift",
  dataRelevance: "Data relevance",
  transferAdaptation: "Transfer adaptation",
  communication: "Communication",
  chemistry: "Chemistry",
  roleChange: "Role change",
  positionChange: "Position change",
  playerSystemFit: "Player-system fit",
  leadership: "Leadership",
  honeymoon: "Honeymoon",
  coreStability: "Core stability",
  roleConflict: "Role conflict",
  opponentMatchup: "Opponent matchup",
  basicRanking: "Basic ranking advantage",
  basicRecentResults: "Basic recent results",
  tournamentImportance: "Tournament importance",
  teamKnownness: "Team knownness / watchlist",
  fixtureConfidence: "Fixture confidence",
  unknownDataPenalty: "Unknown data penalty"
};

export function ModelWeightEditor({ input, initialWeights }: { input: PredictionInput; initialWeights: ModelWeights }) {
  const [weights, setWeights] = useState(initialWeights);
  const prediction = useMemo(() => calculatePrediction({ ...input, modelWeights: weights }), [input, weights]);
  const keys = Object.keys(weights) as WeightKey[];

  return (
    <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Веса модели</h2>
        <p className="mt-1 text-sm text-lab-muted">Изменения пересчитывают выбранный матч локально на странице.</p>
        <div className="mt-4 grid gap-3">
          {keys.map((key) => (
            <label key={key} className="grid gap-1 text-sm">
              <span className="flex items-center justify-between text-lab-muted">
                {labels[key]}
                <strong className="text-white">{weights[key].toFixed(2)}</strong>
              </span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={weights[key]}
                onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))}
                className="accent-cyan-400"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Live preview</h2>
        <p className="mt-1 text-sm text-lab-muted">{input.teamA.name} vs {input.teamB.name}</p>
        <div className="mt-4">
          <ProbabilityBar teamAName={input.teamA.name} teamBName={input.teamB.name} teamAProbability={prediction.teamAProbability} teamBProbability={prediction.teamBProbability} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ConfidenceBadge value={prediction.confidenceScore} />
          <RiskBadge value={prediction.riskLevel} />
          <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">Raw {prediction.rawScore.toFixed(2)}</span>
        </div>
        <div className="mt-4 space-y-2 text-sm text-lab-muted">
          {prediction.factors.slice(0, 8).map((factor) => (
            <p key={factor.factorName}>{factor.factorName}: impact {factor.impact.toFixed(2)}, weight {factor.weight.toFixed(2)}, confidence {Math.round(factor.confidence * 100)}%</p>
          ))}
        </div>
      </section>
    </div>
  );
}
