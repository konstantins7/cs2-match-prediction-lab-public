import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

type ReportRow = {
  file: string;
  totalMatches: number;
  rfrReady: number;
  manualFallback: number;
  averageElapsedMs: number;
  topBlockers: string;
};

export default async function BenchmarksPage() {
  const rows = await readReports();
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin"
        title="Benchmark history"
        description="Локальный обзор ignored JSON отчётов из data/reports. Страница ничего не пишет в БД и не запускает сбор данных."
      />
      <section className="overflow-x-auto rounded border border-lab-border bg-lab-panel">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-lab-panel2 text-xs uppercase text-lab-muted">
            <tr>
              <th className="px-3 py-3">Report</th>
              <th className="px-3 py-3">Matches</th>
              <th className="px-3 py-3">RFR ready</th>
              <th className="px-3 py-3">Manual fallback</th>
              <th className="px-3 py-3">Avg ms</th>
              <th className="px-3 py-3">Top blockers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lab-border">
            {rows.length ? rows.map((row) => (
              <tr key={row.file}>
                <td className="px-3 py-3 text-lab-cyan">{row.file}</td>
                <td className="px-3 py-3">{row.totalMatches}</td>
                <td className="px-3 py-3">{row.rfrReady}</td>
                <td className="px-3 py-3">{row.manualFallback}</td>
                <td className="px-3 py-3">{row.averageElapsedMs}</td>
                <td className="px-3 py-3 text-lab-muted">{row.topBlockers}</td>
              </tr>
            )) : <tr><td className="px-3 py-4 text-lab-muted" colSpan={6}>No benchmark reports found in data/reports.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

async function readReports(): Promise<ReportRow[]> {
  const dir = path.join(process.cwd(), "data", "reports");
  const files = await readdir(dir).catch(() => []);
  const reports = files.filter((file) => /^benchmark_.*\.json$/.test(file)).sort().slice(-20).reverse();
  const rows: ReportRow[] = [];
  for (const file of reports) {
    try {
      const json = JSON.parse(await readFile(path.join(dir, file), "utf8")) as { summary?: Record<string, unknown> };
      const summary = json.summary ?? {};
      rows.push({
        file,
        totalMatches: Number(summary.totalMatches ?? 0),
        rfrReady: Number(summary.realForecastReadyBefore ?? 0),
        manualFallback: Number(summary.manualFallbackRequired ?? 0),
        averageElapsedMs: Number(summary.averageElapsedMs ?? 0),
        topBlockers: Array.isArray(summary.topBlockers) ? summary.topBlockers.slice(0, 3).map(String).join("; ") : ""
      });
    } catch {
      rows.push({ file, totalMatches: 0, rfrReady: 0, manualFallback: 0, averageElapsedMs: 0, topBlockers: "Unreadable report." });
    }
  }
  return rows;
}
