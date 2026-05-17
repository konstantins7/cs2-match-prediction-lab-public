import { SourceSyncPanel } from "@/components/SourceSyncPanel";
import { acceptedPrivateInboxFileNames, scanPrivateNormalizedInbox } from "@/lib/privateNormalizedInbox";
import { prisma } from "@/lib/prisma";
import { getSourceStatuses } from "@/lib/sources/sourceHealth";

export const dynamic = "force-dynamic";

type Search = { matchId?: string };

export default async function ImportsPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const params = await searchParams;
  const matchId = params?.matchId?.trim();
  const [jobs, statuses, privateInbox] = await Promise.all([
    prisma.dataSyncJob.findMany({ orderBy: { startedAt: "desc" }, take: 12 }),
    getSourceStatuses(),
    scanPrivateNormalizedInbox(matchId)
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
        <p className="text-xs uppercase tracking-wide text-lab-cyan">Private data extractor interface</p>
        <h2 className="mt-1 font-semibold text-white">Нормализованные private drops</h2>
        <p className="mt-2 max-w-4xl text-sm text-lab-muted">
          Core app не содержит HLTV scraper, browser crawler, Apify, Telegram scraping, bypass code или crawler config.
          Если внешний локальный инструмент уже подготовил данные, импортируйте только нормализованные CSV/JSON через существующий Validate / Preview / Apply flow.
        </p>
        <div className="mt-3 rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
          <p><span className="text-white">Inbox:</span> {privateInbox.inboxPath}</p>
          <p><span className="text-white">Trusted local imports:</span> {privateInbox.trustedLocalImportsEnabled ? "enabled" : "disabled / preview-only"}</p>
          <p><span className="text-white">Validation target:</span> {matchId ?? "add ?matchId=... to validate CSV rows against a match"}</p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded border border-lab-border bg-lab-panel2 p-3">
            <h3 className="font-medium text-white">Accepted normalized files</h3>
            <ul className="mt-2 space-y-1 text-sm text-lab-muted">
              {acceptedPrivateInboxFileNames().map((name) => <li key={name}>{name}</li>)}
            </ul>
          </div>
          <div className="rounded border border-lab-border bg-lab-panel2 p-3">
            <h3 className="font-medium text-white">Rules</h3>
            <ul className="mt-2 space-y-1 text-sm text-lab-muted">
              <li>sourceName обязателен, sourceUrl/reference желателен.</li>
              <li>Никакой Apply без existing validation/preview.</li>
              <li>Core app не знает, как файл был собран.</li>
              <li>Trusted auto-apply только при ENABLE_TRUSTED_LOCAL_IMPORTS=true.</li>
              <li>Real Forecast gates и source policy не меняются.</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-lab-muted">
              <tr>
                <th className="py-2">File</th>
                <th>Type</th>
                <th>Validation</th>
                <th>Rows</th>
                <th>Blocks</th>
                <th>Apply</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lab-border">
              {privateInbox.reports.length ? privateInbox.reports.map((report) => (
                <tr key={report.fullPath}>
                  <td className="py-2 text-white">{report.fileName}</td>
                  <td>{report.detectedType}</td>
                  <td>{report.validationStatus}</td>
                  <td>{report.rowsParsed}</td>
                  <td>{report.blocksCovered.join(", ") || "-"}</td>
                  <td>{report.autoApplied ? "auto-applied" : report.applyEligible ? "eligible" : "not eligible"}</td>
                  <td className="max-w-xl text-lab-muted">
                    {report.summary}
                    {report.errors.length ? ` Errors: ${report.errors.slice(0, 2).join(" | ")}` : ""}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="py-2 text-lab-muted" colSpan={7}>No private normalized files found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
