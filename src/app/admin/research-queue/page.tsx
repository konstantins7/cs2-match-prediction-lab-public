import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ManualEnrichmentPanel } from "@/components/ManualEnrichmentPanel";
import { ManualNewsImportPanel } from "@/components/ManualNewsImportPanel";
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

type Search = { matchId?: string };

export default async function ResearchQueuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const rows = await getResearchQueueRows(120);
  const summary = summarizeResearchQueue(rows);
  const analystSampleEnabled = process.env.ENABLE_ANALYST_SAMPLE === "true";
  const selectedMatchId = params.matchId ?? rows[0]?.matchId ?? "pandascore_match_1474573";
  const options = rows.map((row) => ({ matchId: row.matchId, label: `${row.matchLabel} · ${formatDateTime(row.startTime)}`, tasks: row.tasks }));
  if (selectedMatchId && !options.some((option) => option.matchId === selectedMatchId)) {
    options.unshift({ matchId: selectedMatchId, label: selectedMatchId, tasks: [] });
  }
  const groups = buildTaskGroups(rows);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Мои задачи по прогнозам</h1>
        <p className="mt-1 text-sm text-lab-muted">Что нужно добрать, чтобы матчи перешли от базового preview к аналитическому прогнозу.</p>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Ниже L3" value={summary.matchesBelowAnalytical} />
        <Stat label="Задачи" value={summary.tasksTotal} />
        <Stat label="Высокий приоритет" value={summary.highPriority} />
        <Stat label="Нужен ручной ввод" value={summary.requiresManualInput} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title} className="rounded border border-lab-border bg-lab-panel p-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">{group.title}</h2>
              <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">{group.rows.length}</span>
            </div>
            <div className="mt-2 space-y-1 text-sm text-lab-muted">
              {group.rows.slice(0, 4).map((row) => (
                <Link key={`${group.title}-${row.matchId}`} href={`/admin/research-queue?matchId=${row.matchId}`} className="block text-lab-cyan hover:text-cyan-200">
                  {row.matchLabel}
                </Link>
              ))}
              {group.rows.length === 0 && <p>Пока нет матчей в этой группе.</p>}
            </div>
          </div>
        ))}
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

      <ManualEnrichmentPanel
        defaultMatchId={selectedMatchId}
        analystSampleEnabled={analystSampleEnabled}
        matchOptions={options}
      />

      <ManualNewsImportPanel defaultMatchId={selectedMatchId} />

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
                <p className="mt-2 text-sm text-lab-cyan">Следующее действие: {taskLabel(row.nextBestAction)}</p>
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
                      <td className="py-2 pr-3 text-white">{taskLabel(task.task)}<div className="text-xs text-lab-muted">{task.reason}</div></td>
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

function taskLabel(value: string) {
  const labels: Record<string, string> = {
    "Confirm rank/team match": "Подтвердить команды/rank",
    "Import HLTV manual rank": "Импортировать manual rank",
    "Bind roster": "Добавить составы",
    "Import player stats": "Добавить статистику игроков",
    "Import map stats": "Добавить статистику карт",
    "Import veto history": "Добавить карты/veto",
    "Add H2H": "Добавить H2H",
    "Add news/roster events": "Добавить новости/roster events",
    "Check official team news": "Проверить официальные новости команд",
    "Check roster/stand-in news": "Проверить roster/stand-in новости",
    "Add insider signal if relevant": "Добавить insider signal вручную",
    "Add HLTV manual reference": "Добавить HLTV manual reference",
    "Add Telegram insider manual note": "Добавить Telegram insider note",
    "Import parsed demo JSON": "Импортировать parsed demo JSON",
    "Connect GRID/Liquipedia": "Подключить GRID/Liquipedia"
  };
  return labels[value] ?? value;
}

function buildTaskGroups(rows: Awaited<ReturnType<typeof getResearchQueueRows>>) {
  const now = Date.now();
  return [
    {
      title: "Срочно: матчи скоро начнутся",
      rows: rows.filter((row) => new Date(row.startTime).getTime() - now < 24 * 60 * 60 * 1000)
    },
    {
      title: "Нужны данные для L3",
      rows: rows.filter((row) => row.readinessLevel !== "L3_ANALYTICAL" && row.readinessLevel !== "L4_DEEP")
    },
    {
      title: "Нужно подтвердить команды/rank",
      rows: rows.filter((row) => row.tasks.some((task) => task.task.includes("rank") && task.status !== "done"))
    },
    {
      title: "Нужно добавить составы",
      rows: rows.filter((row) => row.tasks.some((task) => task.task === "Bind roster" && task.status !== "done"))
    },
    {
      title: "Нужно добавить карты/veto",
      rows: rows.filter((row) => row.tasks.some((task) => (task.task.includes("map") || task.task.includes("veto")) && task.status !== "done"))
    },
    {
      title: "Есть sample, но нет real",
      rows: rows.filter((row) => row.sourceMode === "analyst_sample")
    },
    {
      title: "Готово к прогнозу",
      rows: rows.filter((row) => row.readinessLevel === "L3_ANALYTICAL" || row.readinessLevel === "L4_DEEP")
    }
  ];
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel p-3">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
