import { sourceAdapters } from "./sources";
import { dataSourceRegistry } from "./config/dataSourceRegistry";

export type SourceSetupItem = {
  id: string;
  label: string;
  status: "configured" | "missing" | "available" | "future";
  value: string;
  priority: string;
  action: string;
  actionLabel: string;
  accessType: string;
  legalMode: string;
  limitations: string;
  forbiddenActions: string[];
  actionHref: string;
  advancedOnly?: boolean;
};

function adapterStatus(source: string) {
  return sourceAdapters.find((adapter) => adapter.name === source)?.status();
}

function registry(id: string) {
  const entry = dataSourceRegistry.find((item) => item.id === id);
  if (!entry) throw new Error(`Data source registry entry not found: ${id}`);
  return entry;
}

export function buildSourceSetupChecklist(hasManualHltv = false, hasParsedDemo = false): SourceSetupItem[] {
  const pandascore = adapterStatus("pandascore");
  const grid = adapterStatus("grid");
  const liquipedia = adapterStatus("liquipedia");
  const faceit = adapterStatus("faceit");
  const rows = [
    ["pandascore", pandascore?.configured ? "configured" : "missing", "/admin/sources", "Как получить"],
    ["grid", grid?.configured ? "configured" : "missing", "/admin/sources", "Как получить"],
    ["liquipedia", liquipedia?.configured ? "configured" : "missing", "/admin/sources", "Как получить"],
    ["faceit", faceit?.configured ? "configured" : "missing", "/admin/sources", "Как получить"],
    ["parsed_demo", hasParsedDemo ? "available" : "missing", "/admin/research-queue?template=parsed_demo", "Загрузить JSON"],
    ["hltv_manual_top50", hasManualHltv ? "configured" : "missing", "/admin/sources", "Импортировать CSV"]
  ] as const;
  const futureRows = ["abios", "gamescorekeeper", "datasportsgroup"].map((id) => [id, "future", "/admin/sources", "Подробнее"] as const);
  return [...rows, ...futureRows].map(([id, status, actionHref, actionLabel]) => {
    const entry = registry(id);
    return {
      id,
      label: entry.name,
      status,
      value: sourceValue(entry.id),
      priority: priorityLabel(entry.priority),
      action: entry.userActionRequired,
      actionLabel,
      accessType: entry.accessType,
      legalMode: entry.legalMode,
      limitations: entry.limitations,
      forbiddenActions: entry.forbiddenActions,
      actionHref,
      advancedOnly: entry.advancedOnly
    };
  });
}

export function isNoExtraApiMode(items: SourceSetupItem[]) {
  return items.filter((item) => ["grid", "liquipedia", "faceit"].includes(item.id)).every((item) => item.status === "missing");
}

function sourceValue(id: string) {
  const values: Record<string, string> = {
    pandascore: "Даст расписание, команды, турниры и basic results.",
    grid: "Даст CS2 official data и round/player/economy данные, если доступ одобрен. Лучший источник для deep telemetry.",
    liquipedia: "Даст составы, турниры, историю, roster changes. Лимит 60 requests/hour.",
    faceit: "Даст player/team context, competitions и FACEIT statistics.",
    parsed_demo: "Даст player stats, map stats, round/economy, pistol/overtime без платных API.",
    hltv_manual_top50: "Улучшит ranking и Pro Focus. Только manual CSV/JSON, без scraping и без Apify sync.",
    abios: "Trial/future provider. Не используется как основной free source.",
    gamescorekeeper: "Paid/future provider. Не используется как основной free source.",
    datasportsgroup: "Paid/future provider. Не используется как основной free source."
  };
  return values[id] ?? registry(id).setupInstructions;
}

function priorityLabel(priority: number) {
  if (priority <= 4) return "максимальный";
  if (priority <= 8) return "высокий";
  return "future/advanced";
}
