import { buildDataSourceRows } from "@/lib/data/sourceComparison";
import type { PredictionInput } from "@/lib/predictionEngine";
import { SourceModeBadge } from "./SourceModeBadge";

export function DataSourcesTable({ input }: { input: PredictionInput }) {
  const rows = buildDataSourceRows(input);
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div>
        <h2 className="font-semibold text-white">Data Sources</h2>
        <p className="mt-1 text-sm text-lab-muted">Какие источники используются в прогнозе и какие исключены из real mode.</p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-lab-muted">
            <tr>
              <th className="py-2 pr-3">Group</th>
              <th className="py-2 pr-3">Source</th>
              <th className="py-2 pr-3">Mode</th>
              <th className="py-2 pr-3">Data type</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Freshness</th>
              <th className="py-2 pr-3">Confidence</th>
              <th className="py-2 pr-3">Sample</th>
              <th className="py-2 pr-3">Reason if not used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lab-border">
            {rows.map((row, index) => (
              <tr key={`${row.source}-${row.dataType}-${index}`}>
                <td className="py-2 pr-3 text-white">{row.group}</td>
                <td className="py-2 pr-3 text-white">{row.source}</td>
                <td className="py-2 pr-3"><SourceModeBadge sourceMode={row.sourceMode} /></td>
                <td className="py-2 pr-3 text-lab-muted">{row.dataType}</td>
                <td className={row.status === "used" ? "py-2 pr-3 text-lab-green" : row.status === "ignored" ? "py-2 pr-3 text-lab-amber" : "py-2 pr-3 text-lab-muted"}>{row.status}</td>
                <td className="py-2 pr-3 text-lab-muted">{row.freshness}</td>
                <td className="py-2 pr-3 text-lab-muted">{Math.round(row.confidence * 100)}%</td>
                <td className="py-2 pr-3 text-lab-muted">{row.sampleSize ?? "n/a"}</td>
                <td className="py-2 pr-3 text-lab-muted">{row.reasonIfNotUsed || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
