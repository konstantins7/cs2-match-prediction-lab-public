import Link from "next/link";
import { getBestNextAction } from "@/lib/bestNextAction";
import { getPlaybookEntriesForMissing } from "@/lib/dataAcquisitionPlaybook";
import type { AutoResearchMetrics } from "@/lib/autoResearchShared";
import type { PredictionInput, PredictionOutput } from "@/lib/predictionEngine";
import type { ResearchTask } from "@/lib/researchQueueCore";

type Props = {
  mode: "home" | "match";
  metrics?: AutoResearchMetrics;
  input?: PredictionInput;
  prediction?: PredictionOutput;
  researchTasks?: ResearchTask[];
};

const defaultSucceeded = [
  "получить матчи",
  "обновить рейтинги",
  "проверить патчи CS2",
  "обновить basic history",
  "пересчитать прогнозы"
];

const defaultMissing = ["составы", "player stats", "map/veto", "round/economy"];

export function ForecastConciergePanel({ mode, metrics, input, prediction, researchTasks = [] }: Props) {
  const succeeded = prediction && input ? matchSucceeded(input) : defaultSucceeded;
  const missing = prediction ? (prediction.readiness.missingCriticalData.length ? prediction.readiness.missingCriticalData : defaultMissing) : defaultMissing;
  const suggestions = getPlaybookEntriesForMissing(missing);
  const action = prediction
    ? getBestNextAction(prediction, researchTasks).primaryAction
    : homeAction(metrics);
  const href = input ? actionHref(action.href, input.match.id) : action.href;

  return (
    <section className="rounded border border-lab-cyan/40 bg-lab-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-lab-cyan">Forecast Concierge</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Маршрут к готовому прогнозу</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-lab-muted">
            {mode === "match"
              ? "Ниже — простой список того, что уже есть по матчу, чего не хватает и какое действие сильнее всего приблизит прогноз к аналитическому уровню."
              : "Нажмите обновление, выберите матч, а если данных мало — добавьте data pack или parsed demo. Сайт не обещает deep analytics без источников."}
          </p>
        </div>
        <Link href={href} className="rounded bg-lab-cyan px-4 py-2 text-sm font-semibold text-black">
          {action.label}
        </Link>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Panel title="Что сайт смог получить автоматически" items={succeeded} tone="green" />
        <Panel title="Что не смог" items={missing.slice(0, 6)} tone="amber" />
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-sm font-medium text-white">Почему</p>
          <p className="mt-2 text-sm leading-6 text-lab-muted">
            Эти данные недоступны в текущих бесплатных источниках. Подключите GRID/Liquipedia/FACEIT, загрузите parsed demo или создайте manual data pack.
          </p>
          <p className="mt-3 text-xs uppercase text-lab-muted">Лучшее следующее действие</p>
          <p className="mt-1 text-sm text-lab-cyan">{action.label}</p>
          <p className="mt-1 text-xs text-lab-muted">{action.reason}</p>
        </div>
      </div>

      <div className="mt-4 rounded border border-lab-border bg-lab-panel2 p-3">
        <p className="text-sm font-medium text-white">Где взять недостающие данные</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {suggestions.map((entry) => (
            <article key={entry.dataType} className="rounded border border-lab-border bg-lab-panel p-3">
              <h3 className="text-sm font-medium text-white">{entry.label}</h3>
              <p className="mt-1 text-xs text-lab-muted">{entry.whyItMatters}</p>
              <p className="mt-2 text-xs text-lab-cyan">{entry.sources.join(" · ")}</p>
              <dl className="mt-2 space-y-1 text-xs text-lab-muted">
                <div><dt className="inline">Насколько сложно: </dt><dd className="inline text-white">{entry.difficulty}</dd></div>
                <div><dt className="inline">Можно автоматически: </dt><dd className="inline text-white">{entry.canAutomate}</dd></div>
                <div><dt className="inline">Нужен API key: </dt><dd className="inline text-white">{entry.requiresApiKey ? "да / или parsed demo" : "нет"}</dd></div>
              </dl>
              <Link href={input ? actionHref(entry.href, input.match.id) : entry.href} className="mt-3 inline-flex rounded border border-lab-border px-2 py-1 text-xs text-lab-cyan hover:border-lab-cyan">
                {entry.actionLabel}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Panel({ title, items, tone }: { title: string; items: string[]; tone: "green" | "amber" }) {
  return (
    <div className={tone === "green" ? "rounded border border-lab-green/50 bg-lab-panel2 p-3" : "rounded border border-lab-amber/50 bg-lab-panel2 p-3"}>
      <p className={tone === "green" ? "text-sm font-medium text-lab-green" : "text-sm font-medium text-lab-amber"}>{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-lab-muted">
        {items.map((item, index) => <li key={`${title}-${index}-${item.slice(0, 24)}`}>{item}</li>)}
      </ul>
    </div>
  );
}

function matchSucceeded(input: PredictionInput) {
  const coverage = input.dataCoverage;
  const items = ["fixture/basic data"];
  if (coverage?.rankData) items.push("ranking signal");
  if (coverage?.recentMatches) items.push("basic match history");
  if (coverage?.teamFormSnapshots) items.push("team form snapshots");
  if (coverage?.newsOrRosterEvents) items.push("news/roster events");
  if (coverage?.playerRoster) items.push("составы");
  if (coverage?.playerStats) items.push("player stats");
  if (coverage?.mapStats) items.push("map stats");
  if (coverage?.vetoHistory) items.push("veto history");
  return items;
}

function homeAction(metrics?: AutoResearchMetrics) {
  if ((metrics?.readyForecasts ?? 0) > 0) {
    return { label: "Показать готовые прогнозы", href: "/predictions?forecast=ready", reason: "Есть матчи, которые уже можно анализировать." };
  }
  if ((metrics?.needsManualData ?? 0) > 0) {
    return { label: "Создать data pack", href: "/admin/research-queue", reason: "Большинству матчей не хватает roster/player/map/veto данных." };
  }
  if ((metrics?.sourceSetupNeeded ?? 0) > 0) {
    return { label: "Подключить источники", href: "/admin/sources#source-playbook", reason: "Дополнительные источники могут дать составы и deep stats." };
  }
  return { label: "Показать матчи", href: "/matches", reason: "Начните с выбора матча." };
}

function actionHref(href: string, matchId: string) {
  if (!href.startsWith("/admin/research-queue")) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}matchId=${encodeURIComponent(matchId)}`;
}
