import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const logs = await prisma.sourceSyncLog.findMany({ orderBy: { startedAt: "desc" } });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Импорт данных</h1>
        <p className="mt-1 text-sm text-lab-muted">В MVP реальные импорты отключены env/config. Ручной JSON/CSV слой подготовлен архитектурно.</p>
      </div>
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Доступные действия</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Mock seed refresh", "Manual JSON import", "Manual CSV import", "Validate data quality"].map((action) => (
            <button key={action} type="button" className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted" disabled>{action}</button>
          ))}
        </div>
        <p className="mt-3 text-sm text-lab-amber">Кнопки отключены в MVP UI: импорт выполняется через npx prisma db seed или будущие adapter jobs.</p>
      </section>
      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Sync logs</h2>
        <div className="mt-3 space-y-2 text-sm text-lab-muted">
          {logs.map((log) => <p key={log.id}>{log.source}: {log.status}, records {log.recordsImported}. {log.notes}</p>)}
        </div>
      </section>
    </div>
  );
}
