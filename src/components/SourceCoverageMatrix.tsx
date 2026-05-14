import type { SourceCoverageRow } from "@/lib/sourceCoverageMatrix";

const statusClass: Record<string, string> = {
  available: "text-lab-green",
  partial: "text-lab-amber",
  missing: "text-lab-muted",
  requires_key: "text-lab-amber",
  future: "text-lab-cyan"
};

const statusLabel: Record<string, string> = {
  available: "доступно",
  partial: "частично",
  missing: "нет данных",
  requires_key: "нужен ключ",
  future: "будущее"
};

export function SourceCoverageMatrix({ rows, compact = false }: { rows: SourceCoverageRow[]; compact?: boolean }) {
  const visibleRows = compact ? rows.filter((row) => ["fixture", "ranking", "roster", "player_stats", "map_stats", "veto", "patch_meta"].includes(row.dataType)) : rows;
  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div>
        <h2 className="font-semibold text-white">Покрытие источников</h2>
        <p className="mt-1 text-sm text-lab-muted">Показывает, какие источники доступны по типам данных, и что реально используется в прогнозе.</p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="uppercase text-lab-muted">
            <tr>
              <th className="py-2 pr-3">Тип данных</th>
              {visibleRows[0]?.cells.map((cell) => <th key={cell.source} className="px-3 py-2">{cell.source}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-lab-border text-lab-muted">
            {visibleRows.map((row) => (
              <tr key={row.dataType}>
                <td className="py-3 pr-3 font-medium text-white">{row.label}</td>
                {row.cells.map((cell) => (
                  <td key={`${row.dataType}-${cell.source}`} className="px-3 py-3 align-top">
                    <p className={statusClass[cell.status] ?? "text-lab-muted"}>{statusLabel[cell.status] ?? cell.status}</p>
                    <p className="mt-1">Используется: {cell.usedInPrediction ? "да" : "нет"}</p>
                    <p className="mt-1">Q {Math.round(cell.quality * 100)}%</p>
                    {!compact && <p className="mt-1 max-w-44">{cell.note}</p>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
