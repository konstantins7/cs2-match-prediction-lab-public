import type { PredictionOutput } from "./predictionEngine";
import type { ResearchTask } from "./researchQueueCore";

export type NextAction = {
  label: string;
  href: string;
  reason: string;
};

export type BestNextAction = {
  primaryAction: NextAction;
  secondaryActions: NextAction[];
};

const taskActions: Record<string, NextAction> = {
  "Confirm rank/team match": {
    label: "Подтвердить рейтинг команды",
    href: "/admin/sources#rank-matching",
    reason: "Без рейтинга прогноз остаётся basic preview."
  },
  "Bind roster": {
    label: "Добавить составы",
    href: "/admin/research-queue",
    reason: "Без состава нельзя оценить player form."
  },
  "Import player stats": {
    label: "Добавить player stats",
    href: "/admin/research-queue",
    reason: "Статистика игроков нужна для L3."
  },
  "Import map stats": {
    label: "Добавить map/veto",
    href: "/admin/research-queue",
    reason: "Без карт и veto BO3 прогноз неполный."
  },
  "Import veto history": {
    label: "Добавить map/veto",
    href: "/admin/research-queue",
    reason: "Veto history нужен для аналитического прогноза."
  },
  "Import parsed demo JSON": {
    label: "Загрузить parsed demo",
    href: "/admin/research-queue",
    reason: "Parsed demo даёт глубокие stats без платных API."
  },
  "Connect GRID/Liquipedia": {
    label: "Подключить GRID",
    href: "/admin/sources",
    reason: "GRID/Liquipedia дают deep stats и составы."
  }
};

function fallbackForPrediction(prediction: PredictionOutput): NextAction[] {
  if (prediction.sourceLevel === "Sample only") {
    return [{ label: "Добавить реальные данные", href: "/admin/research-queue", reason: "Sample не считается real forecast." }];
  }
  if (prediction.readiness.level === "L0_FIXTURE_ONLY") {
    return [
      { label: "Подтвердить рейтинг команды", href: "/admin/sources#rank-matching", reason: "Нужен хотя бы ranking signal." },
      { label: "Добавить составы", href: "/admin/research-queue", reason: "Состав открывает путь к L3." },
      { label: "Загрузить parsed demo", href: "/admin/research-queue", reason: "Parsed demo может дать deep stats." }
    ];
  }
  if (prediction.readiness.level === "L1_BASIC_CONTEXT") {
    return [
      { label: "Добавить составы", href: "/admin/research-queue", reason: "Без состава прогноз остаётся слабым сигналом." },
      { label: "Добавить player stats", href: "/admin/research-queue", reason: "Player stats усиливают модель до аналитики." },
      { label: "Добавить map/veto", href: "/admin/research-queue", reason: "Карты и veto нужны для BO3." }
    ];
  }
  if (prediction.readiness.level === "L2_BASIC_PREDICTION") {
    return [
      { label: "Добавить map/veto", href: "/admin/research-queue", reason: "Map/veto переводят preview ближе к L3." },
      { label: "Добавить player stats", href: "/admin/research-queue", reason: "Player stats нужны для аналитического сигнала." },
      { label: "Загрузить parsed demo", href: "/admin/research-queue", reason: "Parsed demo даёт глубокую проверку." }
    ];
  }
  return [
    { label: "Проверить свежесть данных", href: "/admin/research-queue", reason: "Для готового прогноза важно не устареть." },
    { label: "Загрузить parsed demo", href: "/admin/research-queue", reason: "Parsed demo может поднять прогноз к L4." }
  ];
}

export function getBestNextAction(prediction: PredictionOutput, tasks: ResearchTask[] = []): BestNextAction {
  const taskBased = tasks
    .filter((task) => task.status !== "done" && task.status !== "skipped")
    .map((task) => taskActions[task.task])
    .filter(Boolean);
  const unique = [...taskBased, ...fallbackForPrediction(prediction)]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.label === item.label) === index);
  return {
    primaryAction: unique[0],
    secondaryActions: unique.slice(1, 3)
  };
}

export function humanForecastStatus(prediction: PredictionOutput) {
  if (prediction.sourceLevel === "Sample only") return "Sample only";
  if (prediction.realForecast.isReady) return "Готов к реальному прогнозу";
  if (prediction.readiness.level === "L0_FIXTURE_ONLY") return "Только базовые данные";
  if (prediction.readiness.level === "L1_BASIC_CONTEXT") {
    if (prediction.readiness.missingCriticalData.some((item) => item.includes("rank"))) return "Нужен рейтинг";
    if (prediction.readiness.missingCriticalData.some((item) => item.includes("roster"))) return "Нужен состав";
    return "Слабый сигнал";
  }
  if (prediction.readiness.missingCriticalData.some((item) => item.includes("veto") || item.includes("map"))) return "Нужны карты/veto";
  if (prediction.readiness.missingCriticalData.some((item) => item.includes("player"))) return "Нужна статистика игроков";
  return "Базовый прогноз";
}
