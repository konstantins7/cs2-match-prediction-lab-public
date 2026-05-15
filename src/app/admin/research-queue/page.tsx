import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ManualEnrichmentPanel } from "@/components/ManualEnrichmentPanel";
import { FaceitManualIdImportPanel } from "@/components/FaceitManualIdImportPanel";
import { ManualNewsImportPanel } from "@/components/ManualNewsImportPanel";
import { ImportProfilesPanel } from "@/components/ImportProfilesPanel";
import { ReadinessBadge } from "@/components/ReadinessBadge";
import { SourceModeBadge } from "@/components/SourceModeBadge";
import { SourceHunterPanel } from "@/components/SourceHunterPanel";
import { ActionButton, DataDepthMeter, PageHeader, StatCard } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { getResearchQueueRows, knownTeamMatchingIssues, refreshResearchPack, summarizeResearchQueue } from "@/lib/researchQueue";
import { getPlaybookEntriesForMissing } from "@/lib/dataAcquisitionPlaybook";
import type { DataDepth } from "@/lib/ui/forecastUx";

export const dynamic = "force-dynamic";

async function createResearchPackAction(formData: FormData) {
  "use server";
  const matchId = String(formData.get("matchId") ?? "");
  if (matchId) await refreshResearchPack(matchId);
  revalidatePath("/admin/research-queue");
}

type Search = { matchId?: string; template?: string };

export default async function ResearchQueuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const rows = await getResearchQueueRows(120);
  const summary = summarizeResearchQueue(rows);
  const analystSampleEnabled = process.env.ENABLE_ANALYST_SAMPLE === "true";
  const selectedMatchId = params.matchId ?? rows[0]?.matchId ?? "pandascore_match_1474573";
  const initialTemplate = params.template === "parsed_demo" ? "parsed_demo" : "manual_real_pack";
  const options = rows.map((row) => ({
    matchId: row.matchId,
    label: `${row.matchLabel} · ${formatDateTime(row.startTime)}`,
    teamAName: row.teamAName,
    teamBName: row.teamBName,
    startTime: row.startTime,
    readinessLevel: row.readinessLevel,
    realForecastReady: false,
    sourceLevel: row.sourceMode === "analyst_sample" ? "Sample only" : row.sourceMode,
    previewDataDepth: routeDepth(row.readinessLevel, row.missingCriticalData),
    realDataDepth: row.sourceMode === "analyst_sample" ? insufficientRealDepth() : routeDepth(row.readinessLevel, row.missingCriticalData),
    missingBlocks: row.missingCriticalData,
    tasks: row.tasks
  }));
  if (selectedMatchId && !options.some((option) => option.matchId === selectedMatchId)) {
    options.unshift({
      matchId: selectedMatchId,
      label: selectedMatchId,
      teamAName: "Team A",
      teamBName: "Team B",
      startTime: new Date().toISOString(),
      readinessLevel: "L0_FIXTURE_ONLY",
      realForecastReady: false,
      sourceLevel: "unknown",
      previewDataDepth: routeDepth("L0_FIXTURE_ONLY", []),
      realDataDepth: insufficientRealDepth(),
      missingBlocks: [],
      tasks: []
    });
  }
  const groups = buildTaskGroups(rows);
  const priorityRows = buildPriorityRows(rows).slice(0, 10);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Forecast routes"
        title="Маршруты к прогнозу"
        description="По умолчанию показаны top-10 матчей, где одно действие даст максимальный прирост. Полный task flood спрятан в Advanced."
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Ниже L3" value={summary.matchesBelowAnalytical} tone="amber" />
        <StatCard label="Задачи" value={summary.tasksTotal} tone="cyan" />
        <StatCard label="Высокий приоритет" value={summary.highPriority} tone="red" />
        <StatCard label="Нужен ручной ввод" value={summary.requiresManualInput} tone="violet" />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

      <section className="rounded-2xl border border-lab-cyan/35 bg-lab-panel/85 p-4 shadow-[0_0_40px_rgba(56,189,248,0.08)]">
        <h2 className="font-semibold text-white">Топ-10 приоритетных матчей</h2>
        <p className="mt-1 text-sm text-lab-muted">Один матч — одно главное действие, где взять данные и ожидаемый прирост readiness.</p>
        <div className="mt-3 grid gap-3">
          {priorityRows.length === 0 ? (
            <p className="text-sm text-lab-muted">Очередь пуста или все выбранные матчи готовы.</p>
          ) : priorityRows.map((row) => (
            <article key={`priority-${row.matchId}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-white">{row.matchLabel}</h3>
                  <p className="mt-1 text-sm text-lab-muted">{row.eventName} · {formatDateTime(row.startTime)} · DQ {row.dataQualityScore}/100</p>
                  <p className="mt-2 text-sm text-lab-cyan">Главное действие: {taskLabel(row.nextBestAction)}</p>
                  <p className="mt-1 text-xs text-lab-muted">Ожидаемый прирост: {expectedGain(row.readinessLevel, row.nextBestAction)}</p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[280px_1fr]">
                    <DataDepthMeter depth={routeDepth(row.readinessLevel, row.missingCriticalData)} />
                    <div className="rounded-xl border border-white/10 bg-lab-panel/80 p-3">
                      <p className="text-xs uppercase text-lab-muted">Чего не хватает</p>
                      <p className="mt-1 text-sm text-lab-muted">{row.missingCriticalData.slice(0, 2).join(", ") || "Критичных пропусков нет."}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {getPlaybookEntriesForMissing(row.missingCriticalData).slice(0, 2).map((entry) => (
                      <div key={`${row.matchId}-${entry.dataType}`} className="rounded-xl border border-white/10 bg-lab-panel p-3 text-xs text-lab-muted">
                        <p className="text-white">{entry.label}</p>
                        <p>Где взять: {entry.sources.join(" · ")}</p>
                        <p>Сложность: {entry.difficulty}</p>
                        <p>Что даст: {entry.whyItMatters}</p>
                        <p>Можно автоматически: {entry.canAutomate}</p>
                        <p>Нужен API key: {entry.requiresApiKey ? "да / или parsed demo" : "нет"}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SourceModeBadge sourceMode={row.sourceMode} />
                  <ReadinessBadge level={row.readinessLevel} />
                  <ActionButton href={`/match/${row.matchId}`} tone="ghost">Матч</ActionButton>
                  <ActionButton href={`/admin/research-queue?matchId=${row.matchId}`}>Открыть wizard</ActionButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <ManualEnrichmentPanel
        defaultMatchId={selectedMatchId}
        initialTemplate={initialTemplate}
        analystSampleEnabled={analystSampleEnabled}
        matchOptions={options}
      />

      <SourceHunterPanel compact />

      <ImportProfilesPanel compact />

      <FaceitManualIdImportPanel compact />

      <ManualNewsImportPanel defaultMatchId={selectedMatchId} />

      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Advanced: Показать все технические задачи</summary>
        <div className="mt-4 grid gap-4">
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
      </details>

      <details className="rounded border border-lab-border bg-lab-panel p-4">
        <summary className="cursor-pointer font-semibold text-lab-cyan">Advanced: known team matching issues</summary>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {knownTeamMatchingIssues.map((name) => (
            <div key={name} className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm">
              <p className="font-medium text-white">{name}</p>
              <p className="mt-1 text-xs text-lab-muted">normalized: {name.toLowerCase().replace(/[^a-z0-9]+/g, "")}</p>
              <p className="mt-1 text-xs text-lab-amber">status: review if rank missing</p>
            </div>
          ))}
        </div>
      </details>
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
    "Confirm FACEIT IDs": "Подтвердить FACEIT IDs",
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
      title: "Не хватает одного главного действия",
      rows: rows.filter((row) => row.nextBestAction && row.readinessLevel !== "L3_ANALYTICAL" && row.readinessLevel !== "L4_DEEP")
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
      title: "Готовые к реальному прогнозу",
      rows: rows.filter((row) => row.readinessLevel === "L3_ANALYTICAL" || row.readinessLevel === "L4_DEEP")
    },
    {
      title: "Требуют API/источник",
      rows: rows.filter((row) => row.tasks.some((task) => task.task === "Connect GRID/Liquipedia" && task.status !== "done"))
    }
  ];
}

function buildPriorityRows(rows: Awaited<ReturnType<typeof getResearchQueueRows>>) {
  const now = Date.now();
  return [...rows].sort((a, b) => {
    const aSoon = new Date(a.startTime).getTime() - now < 24 * 60 * 60 * 1000 ? 0 : 1;
    const bSoon = new Date(b.startTime).getTime() - now < 24 * 60 * 60 * 1000 ? 0 : 1;
    if (aSoon !== bSoon) return aSoon - bSoon;
    const aHigh = a.tasks.some((task) => task.priority === "high" && task.status !== "done") ? 0 : 1;
    const bHigh = b.tasks.some((task) => task.priority === "high" && task.status !== "done") ? 0 : 1;
    if (aHigh !== bHigh) return aHigh - bHigh;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

function routeDepth(readinessLevel: string, missing: string[]): DataDepth {
  if (readinessLevel === "L4_DEEP") return { level: 5, label: "Demo/round/economy", description: "Есть глубокий demo или round/economy слой." };
  if (readinessLevel === "L3_ANALYTICAL") return { level: 4, label: "Карты/veto", description: "Есть аналитический слой карт, veto и игроков." };
  if (!missing.some((item) => item.toLowerCase().includes("player") || item.toLowerCase().includes("roster"))) return { level: 3, label: "Составы/player stats", description: "Базовый аналитический контекст уже есть." };
  if (readinessLevel === "L1_BASIC_CONTEXT" || readinessLevel === "L2_BASIC_PREDICTION") return { level: 2, label: "Рейтинг/basic history", description: "Есть ranking или basic history, но не хватает depth." };
  return { level: 1, label: "Базовые данные матча", description: "Есть только fixture и расписание." };
}

function insufficientRealDepth(): DataDepth {
  return { level: 1, label: "Недостаточно real data", description: "Sample/dev data не считается реальной глубиной прогноза." };
}

function expectedGain(readinessLevel: string, action: string) {
  if (readinessLevel === "L0_FIXTURE_ONLY") return "переход к слабому/basic signal";
  if (action.includes("veto") || action.includes("map")) return "приблизит матч к L3";
  if (action.includes("player") || action.includes("roster") || action.includes("Bind")) return "закроет player/team context";
  if (action.includes("FACEIT")) return "улучшит context, но не заменит deep data";
  return "снизит uncertainty и risk";
}
