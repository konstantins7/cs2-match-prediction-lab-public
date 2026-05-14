import Link from "next/link";
import { FaceitEnrichMatchButton } from "./FaceitEnrichMatchButton";
import { PrepareForecastButton } from "./PrepareForecastButton";
import { ReadinessBadge } from "./ReadinessBadge";
import { RealForecastBadge } from "./RealForecastBadge";
import type { PredictionInput, PredictionOutput } from "@/lib/predictionEngine";
import type { ResearchTask } from "@/lib/researchQueueCore";
import { getBestNextAction } from "@/lib/bestNextAction";
import { readinessRu } from "@/lib/russianLabels";

function fallbackActions(prediction: PredictionOutput) {
  if (prediction.readiness.level === "L0_FIXTURE_ONLY" || prediction.readiness.level === "L1_BASIC_CONTEXT") {
    return ["Добавить составы", "Добавить статистику игроков", "Добавить статистику карт", "Добавить veto history"];
  }
  if (prediction.readiness.level === "L2_BASIC_PREDICTION") {
    return ["Добавить карты/veto для перехода к L3", "Добавить новости/roster events", "Добавить H2H"];
  }
  return ["Проверить свежесть данных", "Добавить parsed demo для L4"];
}

export function MatchForecastStatusPanel({ input, prediction, researchTasks }: { input: PredictionInput; prediction: PredictionOutput; researchTasks: ResearchTask[] }) {
  const openTasks = researchTasks.filter((task) => task.status !== "done" && task.status !== "skipped");
  const nextActions = openTasks.length ? openTasks.map((task) => taskLabel(task.task)) : fallbackActions(prediction);
  const bestAction = getBestNextAction(prediction, researchTasks);
  const reasons = prediction.realForecast.isReady
    ? ["Есть достаточно данных для аналитического режима.", "Прогноз использует не sample-only источник."]
    : prediction.realForecast.reasons.length
      ? prediction.realForecast.reasons
      : prediction.readiness.reasons;

  return (
    <section className="rounded border border-lab-cyan/40 bg-lab-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-lab-cyan">Готовность прогноза</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            Статус прогноза: {readinessRu[prediction.readiness.level]}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-lab-muted">
            {prediction.realForecast.isReady
              ? "Прогноз готов к анализу."
              : "Автоматически доступны только базовые данные. Для аналитического прогноза добавьте ручной data pack или parsed demo."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ReadinessBadge level={prediction.readiness.level} />
          <RealForecastBadge isReady={prediction.realForecast.isReady} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-xs uppercase text-lab-muted">Почему</p>
          <ul className="mt-2 space-y-1 text-sm text-lab-muted">
            {reasons.slice(0, 3).map((reason, index) => <li key={`forecast-reason-${index}-${reason.slice(0, 24)}`}>{reason}</li>)}
          </ul>
        </div>
        <div className="rounded border border-lab-border bg-lab-panel2 p-3">
          <p className="text-xs uppercase text-lab-muted">Лучшее следующее действие</p>
          <Link href={actionHref(bestAction.primaryAction.href, input.match.id)} className="mt-2 inline-flex rounded bg-lab-cyan px-3 py-2 text-sm font-semibold text-black">
            {bestAction.primaryAction.label}
          </Link>
          <p className="mt-2 text-xs text-lab-muted">{bestAction.primaryAction.reason}</p>
          <p className="mt-4 text-xs uppercase text-lab-muted">Дополнительно</p>
          <ul className="mt-2 space-y-1 text-sm text-lab-muted">
            {bestAction.secondaryActions.length ? bestAction.secondaryActions.map((action) => <li key={action.label}>{action.label}</li>) : nextActions.slice(0, 2).map((action, index) => <li key={`forecast-action-${index}-${action.slice(0, 24)}`}>{action}</li>)}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-3">
        <PrepareForecastButton matchId={input.match.id} />
        <FaceitEnrichMatchButton matchId={input.match.id} />
        <Link href={`/admin/research-queue?matchId=${encodeURIComponent(input.match.id)}`} className="rounded border border-lab-border px-4 py-2 text-sm font-semibold text-lab-cyan hover:border-lab-cyan">
          Создать data pack
        </Link>
        <Link href={`/admin/research-queue?matchId=${encodeURIComponent(input.match.id)}&template=parsed_demo`} className="rounded border border-lab-border px-4 py-2 text-sm font-semibold text-lab-cyan hover:border-lab-cyan">
          Загрузить parsed demo JSON
        </Link>
      </div>
    </section>
  );
}

function taskLabel(value: string) {
  const labels: Record<string, string> = {
    "Confirm rank/team match": "Подтвердить команды и рейтинг",
    "Import HLTV manual rank": "Импортировать ручной reference-рейтинг",
    "Bind roster": "Добавить составы",
    "Import player stats": "Добавить статистику игроков",
    "Import map stats": "Добавить статистику карт",
    "Import veto history": "Добавить veto history",
    "Add H2H": "Добавить H2H",
    "Add news/roster events": "Добавить новости / roster events",
    "Confirm FACEIT IDs": "Подтвердить FACEIT IDs",
    "Import parsed demo JSON": "Импортировать parsed demo JSON",
    "Connect GRID/Liquipedia": "Подключить GRID/Liquipedia при доступе"
  };
  return labels[value] ?? value;
}

function actionHref(href: string, matchId: string) {
  if (!href.startsWith("/admin/research-queue")) {
    return href;
  }
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}matchId=${encodeURIComponent(matchId)}`;
}
