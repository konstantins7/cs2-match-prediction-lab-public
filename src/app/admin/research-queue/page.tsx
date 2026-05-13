import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ManualEnrichmentPanel } from "@/components/ManualEnrichmentPanel";
import { ReadinessBadge } from "@/components/ReadinessBadge";
import { SourceModeBadge } from "@/components/SourceModeBadge";
import { formatDateTime } from "@/lib/format";
import { getResearchQueueRows, knownTeamMatchingIssues, refreshResearchPack, summarizeResearchQueue } from "@/lib/researchQueue";

export const dynamic = "force-dynamic";

async function createResearchPackAction(formData: FormData) {
  "use server";
  const matchId = String(formData.get("matchId") ?? "");
  if (matchId) await refreshResearchPack(matchId);
  revalidatePath("/admin/research-queue");
}

export default async function ResearchQueuePage() {
  const rows = await getResearchQueueRows(120);
  const summary = summarizeResearchQueue(rows);
  const analystSampleEnabled = process.env.ENABLE_ANALYST_SAMPLE === "true";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Research Queue</h1>
        <p className="mt-1 text-sm text-lab-muted">Матчи ниже L3 Analytical и конкретные действия, которые поднимут readiness.</p>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Below analytical" value={summary.matchesBelowAnalytical} />
        <Stat label="Research tasks" value={summary.tasksTotal} />
        <Stat label="High priority" value={summary.highPriority} />
        <Stat label="Manual input" value={summary.requiresManualInput} />
      </section>

      <section className="rounded border border-lab-border bg-lab-panel p-4">
        <h2 className="font-semibold text-white">Known team matching issues</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {knownTeamMatchingIssues.map((name) => (
            <div key={name} className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm">
              <p className="font-medium text-white">{name}</p>
              <p className="mt-1 text-xs text-lab-muted">normalized: {name.toLowerCase().replace(/[^a-z0-9]+/g, "")}</p>
              <p className="mt-1 text-xs text-lab-amber">status: review if rank missing</p>
            </div>
          ))}
        </div>
      </section>

      <ManualEnrichmentPanel defaultMatchId={rows[0]?.matchId ?? "pandascore_match_1474573"} analystSampleEnabled={analystSampleEnabled} />

      <div className="grid gap-4">
        {rows.length === 0 ? (
          <div className="rounded border border-lab-border bg-lab-panel p-4 text-sm text-lab-muted">Все выбранные матчи уже L3+ или очередь пуста.</div>
        ) : rows.map((row) => (
          <article key={row.matchId} className="rounded border border-lab-border bg-lab-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">{row.matchLabel}</h2>
                <p className="mt-1 text-sm text-lab-muted">{row.eventName} · {formatDateTime(row.startTime)} · DQ {row.dataQualityScore}/100 · confidence {row.confidenceScore}/100</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SourceModeBadge sourceMode={row.sourceMode} />
                <ReadinessBadge level={row.readinessLevel} />
                <Link href={`/match/${row.matchId}`} className="text-sm text-lab-cyan">Разбор</Link>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
              <div>
                <p className="text-xs uppercase text-lab-muted">Missing critical data</p>
                <p className="mt-1 text-sm text-lab-muted">{row.missingCriticalData.join(", ") || "none"}</p>
                <p className="mt-2 text-sm text-lab-cyan">Next best action: {row.nextBestAction}</p>
              </div>
              <form action={createResearchPackAction} className="flex flex-col gap-2">
                <input type="hidden" name="matchId" value={row.matchId} />
                <button type="submit" className="rounded bg-lab-cyan px-3 py-2 text-sm font-medium text-black hover:bg-cyan-300">
                  {row.packId ? "Refresh Research Pack" : "Create Research Pack"}
                </button>
                <span className="text-xs text-lab-muted">{row.packId ? "Pack exists, refresh updates checklist without duplicates." : "Creates one checklistJson pack for this match."}</span>
              </form>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-lab-muted">
                  <tr>
                    <th className="py-2 pr-3">Task</th>
                    <th className="py-2 pr-3">Priority</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Action state</th>
                    <th className="py-2 pr-3">Expected impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-lab-border">
                  {row.tasks.map((task) => (
                    <tr key={task.id}>
                      <td className="py-2 pr-3 text-white">{task.task}<div className="text-xs text-lab-muted">{task.reason}</div></td>
                      <td className="py-2 pr-3">{task.priority}</td>
                      <td className="py-2 pr-3">{task.status}</td>
                      <td className="py-2 pr-3">{task.actionState}</td>
                      <td className="py-2 pr-3 text-lab-muted">{task.expectedImpact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel p-3">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
