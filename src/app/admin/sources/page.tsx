import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const logs = await prisma.sourceSyncLog.findMany({ orderBy: { source: "asc" } });
  const sources = [
    ["Mock JSON/seed", "enabled", "Используется для MVP 0.2."],
    ["PandaScore API", process.env.PANDASCORE_API_KEY ? "configured" : "not configured", "Adapter stub готов, real imports disabled by default."],
    ["GRID Open Access", process.env.GRID_API_KEY ? "configured" : "not configured", "Adapter stub готов, real imports disabled by default."],
    ["Liquipedia API/DB", process.env.LIQUIPEDIA_API_KEY ? "configured" : "not configured", "Adapter stub готов, real imports disabled by default."],
    ["HLTV reference URLs", "reference only", "Прямой scraping не реализован из-за Terms of Service constraints."]
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Источники данных</h1>
        <p className="mt-1 text-sm text-lab-muted">Все реальные импорты отключаемы через env/config. HLTV используется только как reference_url/source_url.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {sources.map(([name, status, note]) => (
          <article key={name} className="rounded border border-lab-border bg-lab-panel p-4">
            <p className="text-sm uppercase tracking-wide text-lab-cyan">{status}</p>
            <h2 className="mt-1 font-semibold text-white">{name}</h2>
            <p className="mt-2 text-sm text-lab-muted">{note}</p>
          </article>
        ))}
      </div>
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Последние sync logs</h2>
        <div className="mt-3 space-y-2 text-sm text-lab-muted">
          {logs.map((log) => <p key={log.id}>{log.source}: {log.status} · {log.notes}</p>)}
        </div>
      </section>
    </div>
  );
}
