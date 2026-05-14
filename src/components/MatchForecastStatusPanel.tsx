import Link from "next/link";
import { FaceitEnrichMatchButton } from "./FaceitEnrichMatchButton";
import { PrepareForecastButton } from "./PrepareForecastButton";
import { ReadinessBadge } from "./ReadinessBadge";
import { RealForecastBadge } from "./RealForecastBadge";
import type { PredictionInput, PredictionOutput } from "@/lib/predictionEngine";
import type { ResearchTask } from "@/lib/researchQueueCore";
import { getBestNextAction } from "@/lib/bestNextAction";
import { formatDateTime } from "@/lib/format";
import { ActionButton, ForecastStatusHero, MatchHero, NextBestActionCard } from "@/components/ui";
import { deriveDataDepth } from "@/lib/ui/forecastUx";

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
  const depth = deriveDataDepth(input, prediction);

  return (
    <div className="space-y-4">
      <MatchHero
        eventName={input.match.eventName}
        teamAName={input.teamA.name}
        teamBName={input.teamB.name}
        meta={`${input.match.stage} · ${formatDateTime(input.match.startTime)} · ${input.match.format} · ${input.match.isLan ? "LAN" : "Online"}`}
        status={input.match.status}
      />
      <ForecastStatusHero
        readiness={prediction.readiness.level}
        realReady={prediction.realForecast.isReady}
        confidence={prediction.confidenceScore}
        risk={prediction.riskLevel}
        depth={depth}
        primaryAction={<NextBestActionCard label={bestAction.primaryAction.label} reason={bestAction.primaryAction.reason} href={actionHref(bestAction.primaryAction.href, input.match.id)} />}
        actions={
          <>
            <PrepareForecastButton matchId={input.match.id} />
            <FaceitEnrichMatchButton matchId={input.match.id} />
            <ActionButton href={`/admin/research-queue?matchId=${encodeURIComponent(input.match.id)}`} tone="ghost">Создать data pack</ActionButton>
            <ActionButton href={`/admin/research-queue?matchId=${encodeURIComponent(input.match.id)}&template=parsed_demo`} tone="violet">Загрузить parsed demo</ActionButton>
          </>
        }
      />
      <section className="rounded-2xl border border-white/10 bg-lab-panel/85 p-5">
        <div className="flex flex-wrap gap-2">
          <ReadinessBadge level={prediction.readiness.level} />
          <RealForecastBadge isReady={prediction.realForecast.isReady} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs uppercase text-lab-muted">Почему</p>
          <ul className="mt-2 space-y-1 text-sm text-lab-muted">
            {reasons.slice(0, 3).map((reason, index) => <li key={`forecast-reason-${index}-${reason.slice(0, 24)}`}>{reason}</li>)}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
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
      </section>
    </div>
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
