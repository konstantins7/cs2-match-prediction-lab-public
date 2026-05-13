import { buildDataSourceRows } from "@/lib/data/sourceComparison";
import type { PredictionInput } from "@/lib/predictionEngine";
import { SourceModeBadge } from "./SourceModeBadge";

export function DataSourcesTable({ input }: { input: PredictionInput }) {
  const rows = buildDataSourceRows(input);
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div>
        <h2 className="font-semibold text-white">Источники данных</h2>
        <p className="mt-1 text-sm text-lab-muted">Какие источники используются в прогнозе и какие исключены из real mode.</p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-lab-muted">
            <tr>
              <th className="py-2 pr-3">Группа</th>
              <th className="py-2 pr-3">Source</th>
              <th className="py-2 pr-3">Источник данных</th>
              <th className="py-2 pr-3">Data type</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Freshness</th>
              <th className="py-2 pr-3">Уверенность</th>
              <th className="py-2 pr-3">Sample</th>
              <th className="py-2 pr-3">Почему не используется</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lab-border">
            {rows.map((row, index) => (
              <tr key={`${row.source}-${row.dataType}-${index}`}>
                <td className="py-2 pr-3 text-white">{groupLabel(row.group)}</td>
                <td className="py-2 pr-3 text-white">{row.source}</td>
                <td className="py-2 pr-3"><SourceModeBadge sourceMode={row.sourceMode} /></td>
                <td className="py-2 pr-3 text-lab-muted">{row.dataType}</td>
                <td className={row.status === "used" ? "py-2 pr-3 text-lab-green" : row.status === "ignored" ? "py-2 pr-3 text-lab-amber" : "py-2 pr-3 text-lab-muted"}>{statusLabel(row.status)}</td>
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

function groupLabel(value: string) {
  const labels: Record<string, string> = {
    "Fixture source": "Источник матча",
    "Ranking source": "Источник рейтинга",
    "Roster source": "Источник состава",
    "Player stats source": "Источник статистики игроков",
    "Map stats source": "Источник карт",
    "Veto source": "Источник veto",
    "H2H source": "Источник H2H",
    "News source": "Источник новостей",
    "Sample/dev source": "Тестовый/dev источник"
  };
  return labels[value] ?? value;
}

function statusLabel(value: string) {
  if (value === "used") return "используется";
  if (value === "ignored") return "игнорируется";
  return "нет данных";
}
