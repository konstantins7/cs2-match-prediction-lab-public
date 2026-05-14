export type DataSourceAccessType = "free" | "free_with_key" | "limited_free" | "manual" | "trial" | "paid_future";
export type DataSourceLegalMode = "api" | "manual_reference" | "upload_only" | "disabled";

export type DataSourceRegistryEntry = {
  id: string;
  name: string;
  dataTypes: string[];
  accessType: DataSourceAccessType;
  legalMode: DataSourceLegalMode;
  priority: number;
  userActionRequired: string;
  setupInstructions: string;
  limitations: string;
  forbiddenActions: string[];
  advancedOnly?: boolean;
};

export const dataSourceRegistry: DataSourceRegistryEntry[] = [
  {
    id: "pandascore",
    name: "PandaScore Free",
    dataTypes: ["fixture", "basic results", "teams", "players", "tournaments"],
    accessType: "free_with_key",
    legalMode: "api",
    priority: 1,
    userActionRequired: "Добавить PANDASCORE_API_KEY в .env и включить free sync.",
    setupInstructions: "Используется только Free Fixtures/basic endpoints.",
    limitations: "Не даёт deep player/map/veto/round telemetry на текущем free flow.",
    forbiddenActions: ["paid endpoints", "betting odds"]
  },
  {
    id: "valve_rankings",
    name: "Valve Rankings",
    dataTypes: ["ranking", "roster hints"],
    accessType: "free",
    legalMode: "api",
    priority: 2,
    userActionRequired: "Нажать обновление рейтингов или one-click sync.",
    setupInstructions: "Публичные Valve standings используются как основной автоматический ranking source.",
    limitations: "Roster hints не считаются полноценным подтверждённым составом.",
    forbiddenActions: []
  },
  {
    id: "steam_updates",
    name: "Steam / CS Updates",
    dataTypes: ["patch/meta"],
    accessType: "free",
    legalMode: "api",
    priority: 3,
    userActionRequired: "Нажать обновление CS2 patches/meta или one-click sync.",
    setupInstructions: "Используется для patch/meta context.",
    limitations: "Не даёт roster/player/map/veto данные.",
    forbiddenActions: []
  },
  {
    id: "grid",
    name: "GRID Open Access",
    dataTypes: ["player stats", "map stats", "round/economy", "deep telemetry"],
    accessType: "limited_free",
    legalMode: "api",
    priority: 4,
    userActionRequired: "Подать заявку на доступ и добавить GRID_API_KEY в .env.",
    setupInstructions: "Лучший источник для deep telemetry, если доступ одобрен.",
    limitations: "Без одобренного доступа integration remains future/disabled.",
    forbiddenActions: ["scraping", "logging API keys"]
  },
  {
    id: "liquipedia",
    name: "LiquipediaDB",
    dataTypes: ["roster", "tournaments", "history", "roster changes"],
    accessType: "limited_free",
    legalMode: "api",
    priority: 5,
    userActionRequired: "Запросить approved API access и добавить LIQUIPEDIA_API_KEY в .env.",
    setupInstructions: "Соблюдать 60 requests/hour и attribution requirements.",
    limitations: "HTML scraping запрещён; MediaWiki API требует строгий User-Agent/rate limits.",
    forbiddenActions: ["HTML scraping", "ignoring rate limits"]
  },
  {
    id: "faceit",
    name: "FACEIT API",
    dataTypes: ["player context", "team context", "competitions", "player stats"],
    accessType: "free_with_key",
    legalMode: "api",
    priority: 6,
    userActionRequired: "Получить developer API key и добавить FACEIT_API_KEY в .env.",
    setupInstructions: "Используется как optional player/team context source.",
    limitations: "Не заменяет official pro match telemetry.",
    forbiddenActions: ["logging API keys"]
  },
  {
    id: "parsed_demo",
    name: "Parsed Demo",
    dataTypes: ["player stats", "map stats", "round/economy", "pistol", "overtime"],
    accessType: "manual",
    legalMode: "upload_only",
    priority: 7,
    userActionRequired: "Загрузить parsed demo JSON для выбранного матча.",
    setupInstructions: "Даст глубокую статистику без платных API; .dem parser worker позже.",
    limitations: "Нужен локальный parsed JSON; raw .dem parser пока не входит в текущий flow.",
    forbiddenActions: ["HLTV scraping for demos"]
  },
  {
    id: "hltv_manual_top50",
    name: "Manual HLTV Top 50",
    dataTypes: ["ranking", "Pro Focus"],
    accessType: "manual",
    legalMode: "manual_reference",
    priority: 8,
    userActionRequired: "Импортировать CSV/JSON вручную.",
    setupInstructions: "Использовать только как manual reference import. Third-party scraper actors, including Apify HLTV actors, are not connected to the app.",
    limitations: "Не автоматический источник; пользователь сам вносит rank/teamName/hltvReferenceUrl/rankingDate.",
    forbiddenActions: ["HLTV scraping", "automatic crawling", "Apify HLTV actor sync", "Apify token storage"]
  },
  {
    id: "telegram_manual",
    name: "Telegram Insider Manual",
    dataTypes: ["news", "insider signals"],
    accessType: "manual",
    legalMode: "manual_reference",
    priority: 9,
    userActionRequired: "Добавить короткую manual note с URL/source metadata.",
    setupInstructions: "Только manual/reference signals, без массового сбора.",
    limitations: "Не использовать для ML training/fine-tuning.",
    forbiddenActions: ["Telegram scraping", "private channel collection", "ML training"]
  },
  {
    id: "abios",
    name: "Abios",
    dataTypes: ["future provider"],
    accessType: "trial",
    legalMode: "disabled",
    priority: 20,
    userActionRequired: "Рассмотреть trial/paid access отдельно.",
    setupInstructions: "Future provider, не default free source.",
    limitations: "Не запускать автоматически.",
    forbiddenActions: ["auto-run as free source"],
    advancedOnly: true
  },
  {
    id: "gamescorekeeper",
    name: "GameScorekeeper",
    dataTypes: ["future provider"],
    accessType: "paid_future",
    legalMode: "disabled",
    priority: 21,
    userActionRequired: "Рассмотреть commercial access отдельно.",
    setupInstructions: "Future/paid provider, advanced only.",
    limitations: "Не основной free source.",
    forbiddenActions: ["auto-run as free source"],
    advancedOnly: true
  },
  {
    id: "datasportsgroup",
    name: "DataSportsGroup",
    dataTypes: ["future provider"],
    accessType: "paid_future",
    legalMode: "disabled",
    priority: 22,
    userActionRequired: "Рассмотреть commercial access отдельно.",
    setupInstructions: "Future/paid provider, advanced only.",
    limitations: "Не основной free source.",
    forbiddenActions: ["auto-run as free source"],
    advancedOnly: true
  }
];

export function getDataSourceRegistryEntry(id: string) {
  return dataSourceRegistry.find((entry) => entry.id === id) ?? null;
}
