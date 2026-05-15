export type DataSourceAccessType =
  | "free"
  | "free_with_key"
  | "limited_free"
  | "manual"
  | "trial"
  | "paid_future"
  | "public_api"
  | "free_tool"
  | "open_source_parser"
  | "free_api"
  | "public_static_data"
  | "offline_dataset"
  | "trial_or_paid_future";

export type DataSourceLegalMode =
  | "api"
  | "api_with_attribution"
  | "manual_reference"
  | "upload_only"
  | "user_export_upload"
  | "local_parser"
  | "github_raw_json"
  | "license_check_required"
  | "provider_api"
  | "disabled";

export type DataSourceStatus = "active" | "optional" | "future" | "disabled";

export type DataSourceRegistryEntry = {
  id: string;
  name: string;
  dataTypes: string[];
  accessType: DataSourceAccessType;
  legalMode: DataSourceLegalMode;
  priority: number;
  status: DataSourceStatus;
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
    status: "active",
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
    status: "active",
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
    status: "active",
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
    status: "optional",
    userActionRequired: "Подать заявку на доступ и добавить GRID_API_KEY в .env.",
    setupInstructions: "Лучший источник для deep telemetry, если доступ одобрен.",
    limitations: "Без подтверждённых capabilities deep telemetry остаётся pending/future.",
    forbiddenActions: ["scraping", "logging API keys", "calling unconfirmed paid/deep endpoints"]
  },
  {
    id: "liquipedia",
    name: "LiquipediaDB",
    dataTypes: ["roster", "tournaments", "history", "roster changes"],
    accessType: "limited_free",
    legalMode: "api",
    priority: 5,
    status: "optional",
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
    status: "optional",
    userActionRequired: "Получить developer API key и добавить FACEIT_API_KEY в .env.",
    setupInstructions: "Используется как optional selected-match player/team context source по known FACEIT IDs.",
    limitations: "Не заменяет official pro match telemetry, manual_real, parsed_demo, GRID, map/veto или deep data.",
    forbiddenActions: ["logging API keys", "broad FACEIT crawl", "player search by nickname", "team search by name"]
  },
  {
    id: "parsed_demo",
    name: "Parsed Demo JSON",
    dataTypes: ["parsed_demo", "player stats", "map stats", "round/economy", "pistol", "overtime"],
    accessType: "manual",
    legalMode: "upload_only",
    priority: 7,
    status: "active",
    userActionRequired: "Загрузить parsed demo JSON для выбранного матча.",
    setupInstructions: "Даст глубокую статистику без платных API; .dem parser worker позже.",
    limitations: "Нужен локальный parsed JSON; raw .dem parser пока не входит в текущий flow.",
    forbiddenActions: ["HLTV scraping for demos", "raw .dem parser auto-run"]
  },
  {
    id: "manual_real_pack",
    name: "Manual Real Pack JSON",
    dataTypes: ["roster", "player stats", "map stats", "veto", "h2h", "news"],
    accessType: "manual",
    legalMode: "upload_only",
    priority: 8,
    status: "active",
    userActionRequired: "Заполнить validated manual_real_pack JSON для выбранного матча.",
    setupInstructions: "JSON-first workflow использует существующий strict validate/preview/apply path.",
    limitations: "Пустые template/default rows не применяются и не повышают readiness.",
    forbiddenActions: ["fake real data", "sample-real mixing"]
  },
  {
    id: "hltv_manual_top50",
    name: "Manual HLTV Top 50",
    dataTypes: ["ranking", "Pro Focus"],
    accessType: "manual",
    legalMode: "manual_reference",
    priority: 9,
    status: "optional",
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
    priority: 10,
    status: "optional",
    userActionRequired: "Добавить короткую manual note с URL/source metadata.",
    setupInstructions: "Только manual/reference signals, без массового сбора.",
    limitations: "Не использовать для ML training/fine-tuning.",
    forbiddenActions: ["Telegram scraping", "private channel collection", "ML training"]
  },
  {
    id: "leetify",
    name: "Leetify Public API",
    dataTypes: ["player_stats", "match_analysis", "faceit_demo_workflow"],
    accessType: "public_api",
    legalMode: "api_with_attribution",
    priority: 11,
    status: "optional",
    userActionRequired: "Использовать только explicit player/profile context и указать attribution.",
    setupInstructions: "Placeholder only: пользователь подтверждает профиль/ID, приложение не делает broad crawl.",
    limitations: "Требует attribution, зависит от публичности профиля/privacy, не Tier-1 pro source.",
    forbiddenActions: ["broad crawl", "automatic sync", "privacy bypass", "using without attribution"]
  },
  {
    id: "cs_demo_manager",
    name: "CS Demo Manager export",
    dataTypes: ["player_stats", "map_stats", "heatmaps", "demo_analysis"],
    accessType: "free_tool",
    legalMode: "user_export_upload",
    priority: 12,
    status: "optional",
    userActionRequired: "Экспортировать JSON из внешнего инструмента и загрузить через JSON-first profile.",
    setupInstructions: "Текущий MVP принимает JSON-инструкции через manual_real/parsed_demo intake; XLSX/SQL parser позже.",
    limitations: "Нет внешнего API key; XLSX/SQL import future/inactive.",
    forbiddenActions: ["direct DB import", "SQL parser in current MVP", "XLSX parser in current MVP"]
  },
  {
    id: "awpy",
    name: "Awpy",
    dataTypes: ["parsed_demo", "player_stats", "round_events"],
    accessType: "open_source_parser",
    legalMode: "local_parser",
    priority: 13,
    status: "optional",
    userActionRequired: "Запустить parser локально вне приложения и загрузить normalized parsed_demo JSON.",
    setupInstructions: "Instruction profile only: приложение пока не запускает parser worker.",
    limitations: "Только JSON-first upload; raw .dem parser worker future.",
    forbiddenActions: ["bundled parser worker in current MVP", "automatic demo crawl"]
  },
  {
    id: "demoparser",
    name: "demoparser / demoparser2",
    dataTypes: ["parsed_demo", "round_events", "player_stats"],
    accessType: "open_source_parser",
    legalMode: "local_parser",
    priority: 14,
    status: "optional",
    userActionRequired: "Сформировать normalized JSON из локального parser output.",
    setupInstructions: "Instruction profile only; JSON-first mapping в существующий parsed_demo/manual_real flow.",
    limitations: "Raw .dem parser worker не входит в 0.7.0.",
    forbiddenActions: ["bundled raw .dem parsing", "automatic demo crawl"]
  },
  {
    id: "demoinfocs",
    name: "demoinfocs-golang",
    dataTypes: ["parsed_demo", "round_events"],
    accessType: "open_source_parser",
    legalMode: "local_parser",
    priority: 15,
    status: "optional",
    userActionRequired: "Использовать локальный worker/export вне приложения и загрузить JSON output.",
    setupInstructions: "Instruction profile only; worker output mapping будет отдельным будущим этапом.",
    limitations: "Worker execution future/inactive.",
    forbiddenActions: ["worker auto-run in current MVP", "automatic demo crawl"]
  },
  {
    id: "thesportsdb",
    name: "TheSportsDB",
    dataTypes: ["fallback events", "fallback teams"],
    accessType: "free_api",
    legalMode: "api",
    priority: 30,
    status: "future",
    userActionRequired: "Проверить CS2 coverage через capability probe до любого использования.",
    setupInstructions: "Low-priority fallback, не live/deep match source.",
    limitations: "Требуется capability probe; CS2 coverage может отсутствовать.",
    forbiddenActions: ["auto-run without capability confirmation", "treating as pro/deep source"],
    advancedOnly: true
  },
  {
    id: "bymykel_csgo_api",
    name: "ByMykel CSGO-API",
    dataTypes: ["static maps", "weapons", "game metadata"],
    accessType: "public_static_data",
    legalMode: "github_raw_json",
    priority: 31,
    status: "future",
    userActionRequired: "Использовать только как static metadata source после license check.",
    setupInstructions: "Не match source; может помочь нормализовать maps/weapons/game metadata.",
    limitations: "Не даёт live/pro match evidence.",
    forbiddenActions: ["live forecast source", "scraping GitHub pages"],
    advancedOnly: true
  },
  {
    id: "cs2leaderboard",
    name: "CS2Leaderboard",
    dataTypes: ["leaderboard", "player context"],
    accessType: "public_api",
    legalMode: "api",
    priority: 32,
    status: "future",
    userActionRequired: "Проверить API/terms перед включением как optional player context.",
    setupInstructions: "Не pro match source; только leaderboard/player context если terms позволяют.",
    limitations: "Не заменяет FACEIT/manual_real/parsed_demo/GRID.",
    forbiddenActions: ["broad crawl", "treating as pro match source"],
    advancedOnly: true
  },
  {
    id: "kaggle_csgo_datasets",
    name: "Kaggle CS:GO datasets",
    dataTypes: ["training", "calibration", "offline research"],
    accessType: "offline_dataset",
    legalMode: "license_check_required",
    priority: 40,
    status: "future",
    userActionRequired: "Проверить license и использовать только offline training/calibration.",
    setupInstructions: "Offline research dataset, not live forecast source.",
    limitations: "License check required; нельзя использовать как live evidence.",
    forbiddenActions: ["live forecast source", "training export without license check", "post-match leakage"],
    advancedOnly: true
  },
  {
    id: "abios",
    name: "Abios",
    dataTypes: ["licensed match stats", "licensed player stats", "licensed live stats"],
    accessType: "trial",
    legalMode: "disabled",
    priority: 50,
    status: "disabled",
    userActionRequired: "Рассмотреть trial/paid access отдельно.",
    setupInstructions: "Future provider, не default free source.",
    limitations: "Не запускать автоматически.",
    forbiddenActions: ["auto-run as free source", "calling without approved account"],
    advancedOnly: true
  },
  {
    id: "thesports",
    name: "TheSports",
    dataTypes: ["licensed match stats", "licensed player stats"],
    accessType: "trial_or_paid_future",
    legalMode: "provider_api",
    priority: 51,
    status: "disabled",
    userActionRequired: "Рассмотреть provider account/trial отдельно.",
    setupInstructions: "Trial/paid provider disabled by default.",
    limitations: "Не запускать без account/trial approval.",
    forbiddenActions: ["auto-run as free source", "calling without account approval"],
    advancedOnly: true
  },
  {
    id: "gamescorekeeper",
    name: "GameScorekeeper",
    dataTypes: ["licensed match stats", "licensed player stats"],
    accessType: "paid_future",
    legalMode: "disabled",
    priority: 52,
    status: "disabled",
    userActionRequired: "Рассмотреть commercial access отдельно.",
    setupInstructions: "Future/paid provider, advanced only.",
    limitations: "Не основной free source.",
    forbiddenActions: ["auto-run as free source", "calling without commercial access"],
    advancedOnly: true
  },
  {
    id: "datasportsgroup",
    name: "DataSportsGroup",
    dataTypes: ["licensed match stats", "licensed player stats", "licensed live stats"],
    accessType: "paid_future",
    legalMode: "disabled",
    priority: 53,
    status: "disabled",
    userActionRequired: "Рассмотреть commercial access отдельно.",
    setupInstructions: "Future/paid provider, advanced only.",
    limitations: "Не основной free source.",
    forbiddenActions: ["auto-run as free source", "calling without commercial access"],
    advancedOnly: true
  },
  {
    id: "sportradar",
    name: "Sportradar",
    dataTypes: ["licensed match stats", "licensed player stats", "licensed live stats"],
    accessType: "paid_future",
    legalMode: "provider_api",
    priority: 54,
    status: "disabled",
    userActionRequired: "Рассмотреть commercial access отдельно.",
    setupInstructions: "Future/paid provider, disabled by default.",
    limitations: "Не вызывать без лицензии/account approval.",
    forbiddenActions: ["auto-run as free source", "calling without license"],
    advancedOnly: true
  },
  {
    id: "lsports",
    name: "LSports",
    dataTypes: ["licensed match stats", "licensed live stats"],
    accessType: "paid_future",
    legalMode: "provider_api",
    priority: 55,
    status: "disabled",
    userActionRequired: "Рассмотреть commercial access отдельно.",
    setupInstructions: "Future/paid provider, disabled by default.",
    limitations: "Не вызывать без лицензии/account approval.",
    forbiddenActions: ["auto-run as free source", "calling without license"],
    advancedOnly: true
  }
];

export function getDataSourceRegistryEntry(id: string) {
  return dataSourceRegistry.find((entry) => entry.id === id) ?? null;
}
