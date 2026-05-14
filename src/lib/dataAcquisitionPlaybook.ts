export type AcquisitionDataType =
  | "ranking"
  | "roster"
  | "player_stats"
  | "map_veto"
  | "h2h"
  | "news"
  | "round_economy";

export type AcquisitionPlaybookEntry = {
  dataType: AcquisitionDataType;
  label: string;
  sources: string[];
  whyItMatters: string;
  difficulty: "низкая" | "средняя" | "высокая";
  canAutomate: string;
  requiresApiKey: boolean;
  actionLabel: string;
  href: string;
};

export const dataAcquisitionPlaybook: AcquisitionPlaybookEntry[] = [
  {
    dataType: "ranking",
    label: "Рейтинг",
    sources: ["Valve Rankings", "Manual HLTV Top 50 reference CSV/JSON"],
    whyItMatters: "Рейтинг даёт базовый strength signal и помогает отделить Pro Focus от no-name матчей.",
    difficulty: "низкая",
    canAutomate: "Valve Rankings автоматически; HLTV только manual CSV/JSON.",
    requiresApiKey: false,
    actionLabel: "Подтвердить рейтинг команды",
    href: "/admin/sources#rank-matching"
  },
  {
    dataType: "roster",
    label: "Составы",
    sources: ["LiquipediaDB", "official team page", "manual source"],
    whyItMatters: "Без состава нельзя оценить форму игроков и свежесть ростера.",
    difficulty: "средняя",
    canAutomate: "LiquipediaDB можно автоматизировать только при approved API access; иначе manual.",
    requiresApiKey: false,
    actionLabel: "Добавить составы",
    href: "/admin/research-queue"
  },
  {
    dataType: "player_stats",
    label: "Статистика игроков",
    sources: ["parsed demo", "FACEIT", "GRID", "manual analyst sheet"],
    whyItMatters: "Player stats нужны, чтобы перейти от basic preview к аналитическому прогнозу.",
    difficulty: "высокая",
    canAutomate: "FACEIT/GRID при ключе; parsed_demo JSON через загрузку; manual sheet вручную.",
    requiresApiKey: true,
    actionLabel: "Добавить player stats",
    href: "/admin/research-queue"
  },
  {
    dataType: "map_veto",
    label: "Карты / veto",
    sources: ["parsed demo", "GRID", "manual history"],
    whyItMatters: "Map/veto особенно важны для BO3: без них прогноз остаётся неполным.",
    difficulty: "высокая",
    canAutomate: "GRID при доступе; parsed_demo JSON через загрузку; history вручную.",
    requiresApiKey: true,
    actionLabel: "Добавить карты/veto",
    href: "/admin/research-queue"
  },
  {
    dataType: "h2h",
    label: "H2H",
    sources: ["PandaScore past", "manual history", "Liquipedia if available"],
    whyItMatters: "H2H даёт matchup context, но не заменяет roster/player/map данные.",
    difficulty: "средняя",
    canAutomate: "PandaScore past частично; Liquipedia при доступе; чаще manual history.",
    requiresApiKey: false,
    actionLabel: "Добавить H2H",
    href: "/admin/research-queue"
  },
  {
    dataType: "news",
    label: "Новости",
    sources: ["official announcements", "HLTV manual reference", "Telegram insider manual note"],
    whyItMatters: "Новости влияют на risk/confidence и помогают объяснять stand-in/roster события.",
    difficulty: "средняя",
    canAutomate: "Только configured official sources; HLTV/Telegram вручную, без scraping.",
    requiresApiKey: false,
    actionLabel: "Добавить новости",
    href: "/admin/research-queue"
  },
  {
    dataType: "round_economy",
    label: "Round/economy",
    sources: ["parsed demo", "GRID"],
    whyItMatters: "Round/economy данные нужны для глубокого L4 уровня.",
    difficulty: "высокая",
    canAutomate: "GRID при доступе; parsed_demo JSON через загрузку. .dem parser позже.",
    requiresApiKey: true,
    actionLabel: "Загрузить parsed demo",
    href: "/admin/research-queue?template=parsed_demo"
  }
];

const byType = new Map(dataAcquisitionPlaybook.map((entry) => [entry.dataType, entry]));

export function getPlaybookEntry(dataType: AcquisitionDataType) {
  return byType.get(dataType) ?? byType.get("roster")!;
}

export function inferDataTypesFromText(items: string[] = []): AcquisitionDataType[] {
  const text = items.join(" ").toLowerCase();
  const result: AcquisitionDataType[] = [];
  if (/rank|ranking|рейтинг/.test(text)) result.push("ranking");
  if (/roster|состав|player roster/.test(text)) result.push("roster");
  if (/player|игрок|stats|статистик/.test(text)) result.push("player_stats");
  if (/map|veto|карты|карт/.test(text)) result.push("map_veto");
  if (/h2h|head-to-head/.test(text)) result.push("h2h");
  if (/news|roster event|новост|insider|telegram|hltv/.test(text)) result.push("news");
  if (/round|economy|demo|pistol|overtime/.test(text)) result.push("round_economy");
  return [...new Set(result)];
}

export function getPlaybookEntriesForMissing(items: string[] = []) {
  const inferred = inferDataTypesFromText(items);
  const defaults: AcquisitionDataType[] = ["roster", "player_stats", "map_veto"];
  return (inferred.length ? inferred : defaults).slice(0, 4).map(getPlaybookEntry);
}
