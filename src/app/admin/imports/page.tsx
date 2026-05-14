import { SourceSyncPanel } from "@/components/SourceSyncPanel";
import { prisma } from "@/lib/prisma";
import { getSourceStatuses } from "@/lib/sources/sourceHealth";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const [jobs, statuses] = await Promise.all([
    prisma.dataSyncJob.findMany({ orderBy: { startedAt: "desc" }, take: 12 }),
    getSourceStatuses()
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Импорт данных</h1>
        <p className="mt-1 text-sm text-lab-muted">MVP 0.3 запускает sync только через admin/CLI. Page-load sync отключён, чтобы не ловить rate limit и не тормозить сайт.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {statuses.map((status) => (
          <article key={status.source} className="rounded border border-lab-border bg-lab-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-lab-cyan">Priority {status.priority}</p>
                <h2 className="mt-1 font-semibold text-white">{status.label}</h2>
              </div>
              <span className={status.enabled ? "rounded bg-lab-green/15 px-2 py-1 text-xs text-lab-green" : "rounded bg-lab-red/15 px-2 py-1 text-xs text-lab-red"}>
                {status.enabled ? "enabled" : "not configured"}
              </span>
            </div>
            <p className="mt-2 text-sm text-lab-muted">{status.message}</p>
            <p className="mt-2 text-xs text-lab-muted">Env: {status.requiredEnv.length ? status.requiredEnv.join(", ") : "none"}</p>
            {status.lastEndpoint && <p className="mt-2 break-all text-xs text-lab-muted">Last endpoint: {status.lastEndpoint}</p>}
          </article>
        ))}
      </div>

      <SourceSyncPanel statuses={statuses} />

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Последние DataSyncJob</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-lab-muted">
              <tr>
                <th className="py-2">Source</th>
                <th>Job</th>
                <th>Status</th>
                <th>Fetched</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Skipped</th>
                <th>Endpoint</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lab-border">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="py-2 text-white">{job.source}</td>
                  <td>{job.jobType}</td>
                  <td>{job.status}</td>
                  <td>{job.recordsFetched}</td>
                  <td>{job.recordsCreated}</td>
                  <td>{job.recordsUpdated}</td>
                  <td>{job.recordsSkipped}</td>
                  <td className="max-w-xs break-all text-lab-muted">{job.lastEndpoint ?? "-"}</td>
                  <td className="max-w-md text-lab-muted">{job.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
