"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PredictionFactorOutput } from "@/lib/predictionEngine";

export function FactorContributionChart({ factors }: { factors: PredictionFactorOutput[] }) {
  const data = factors
    .map((factor) => ({
      name: factor.factorName,
      contribution: Number((factor.impact * factor.weight * factor.confidence).toFixed(2))
    }))
    .filter((factor) => Math.abs(factor.contribution) > 0.01)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 14);

  if (data.length === 0) {
    return (
      <div className="rounded border border-lab-border bg-lab-panel p-4">
        <p className="text-sm text-lab-amber">Факторный график недоступен: все ключевые сигналы нейтральные или отсутствуют.</p>
      </div>
    );
  }

  return (
    <div className="h-80 rounded border border-lab-border bg-lab-panel p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 88, right: 20 }}>
          <CartesianGrid stroke="#2b313a" strokeDasharray="3 3" />
          <XAxis type="number" stroke="#9aa6b2" />
          <YAxis dataKey="name" type="category" width={120} stroke="#9aa6b2" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#15181d", border: "1px solid #2b313a", color: "#edf1f5" }} />
          <Bar dataKey="contribution" fill="#38bdf8" radius={[2, 2, 2, 2]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
