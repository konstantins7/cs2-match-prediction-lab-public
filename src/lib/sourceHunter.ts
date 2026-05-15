export type MissingDataType = "roster" | "player_stats" | "map_veto" | "h2h" | "news" | "round_economy" | "ranking";

export type SourceHunterRecommendation = {
  dataType: MissingDataType;
  label: string;
  bestAutomaticSource: string;
  bestFreeUploadPath: string;
  bestManualSource: string;
  requiresApiKey: string;
  difficulty: "низкая" | "средняя" | "высокая";
  expectedImpact: string;
  actionLabel: string;
  actionHref: string;
};

export const sourceHunterRecommendations: SourceHunterRecommendation[] = [
  {
    dataType: "roster",
    label: "Составы",
    bestAutomaticSource: "LiquipediaDB, если API key одобрен",
    bestFreeUploadPath: "Нет автоматического free upload; используйте manual_real JSON",
    bestManualSource: "Official team page или manual source",
    requiresApiKey: "LiquipediaDB: да; manual source: нет",
    difficulty: "средняя",
    expectedImpact: "Закрывает главный blocker для player/team context и приближает матч к L3.",
    actionLabel: "Получить LiquipediaDB",
    actionHref: "/admin/sources#source-hunter"
  },
  {
    dataType: "player_stats",
    label: "Player stats",
    bestAutomaticSource: "FACEIT только по explicit IDs; GRID только если capability confirmed",
    bestFreeUploadPath: "Parsed Demo JSON, CS Demo Manager JSON, Awpy JSON, demoparser JSON",
    bestManualSource: "manual_real analyst sheet",
    requiresApiKey: "FACEIT/GRID: да; demo-tool JSON/manual_real: нет",
    difficulty: "средняя",
    expectedImpact: "Даёт player form и снижает uncertainty, но real forecast всё равно требует map/veto coverage.",
    actionLabel: "Загрузить demo/stat export",
    actionHref: "/admin/research-queue?template=parsed_demo"
  },
  {
    dataType: "map_veto",
    label: "Map/veto",
    bestAutomaticSource: "GRID, только если endpoint confirmed",
    bestFreeUploadPath: "Parsed Demo JSON или normalized demo-tool JSON",
    bestManualSource: "Manual map history / veto history",
    requiresApiKey: "GRID: да; parsed/manual: нет",
    difficulty: "средняя",
    expectedImpact: "Один из ключевых блоков для аналитического прогноза и снижения risk.",
    actionLabel: "Добавить map/veto",
    actionHref: "/admin/research-queue"
  },
  {
    dataType: "h2h",
    label: "H2H",
    bestAutomaticSource: "PandaScore past/basic history, если доступно",
    bestFreeUploadPath: "Manual history JSON",
    bestManualSource: "Liquipedia history, если API key доступен, или manual history",
    requiresApiKey: "Liquipedia: возможно; manual: нет",
    difficulty: "низкая",
    expectedImpact: "Улучшает explanation и matchup context, но не является hard blocker для первого real forecast.",
    actionLabel: "Добавить H2H",
    actionHref: "/admin/research-queue"
  },
  {
    dataType: "news",
    label: "News / roster events",
    bestAutomaticSource: "Configured official sources only",
    bestFreeUploadPath: "Manual official/reference note",
    bestManualSource: "Official announcements, HLTV manual reference, Telegram insider manual note",
    requiresApiKey: "нет, если manual note; scraping запрещён",
    difficulty: "низкая",
    expectedImpact: "Повышает risk awareness и объяснимость без резкого движения probability.",
    actionLabel: "Добавить manual news",
    actionHref: "/admin/research-queue"
  },
  {
    dataType: "round_economy",
    label: "Round/economy",
    bestAutomaticSource: "GRID, только если deep telemetry confirmed",
    bestFreeUploadPath: "Parsed Demo JSON, demoparser JSON, demoinfocs JSON",
    bestManualSource: "manual_real round/economy proxy",
    requiresApiKey: "GRID: да; local parser JSON/manual: нет",
    difficulty: "высокая",
    expectedImpact: "Самый сильный deep слой для confidence/risk, но не должен появляться из fake/sample данных.",
    actionLabel: "Загрузить parsed demo",
    actionHref: "/admin/research-queue?template=parsed_demo"
  },
  {
    dataType: "ranking",
    label: "Ranking / reference",
    bestAutomaticSource: "Valve Rankings",
    bestFreeUploadPath: "Manual HLTV Top 50 CSV/JSON",
    bestManualSource: "Manual HLTV Top 50 reference",
    requiresApiKey: "нет",
    difficulty: "низкая",
    expectedImpact: "Улучшает Pro Focus, rank matching и basic signal. HLTV остаётся manual_reference only.",
    actionLabel: "Импортировать HLTV Top 50",
    actionHref: "/admin/sources#source-hunter"
  }
];

export function getSourceHunterRecommendations(dataTypes?: MissingDataType[]) {
  if (!dataTypes?.length) return sourceHunterRecommendations;
  const wanted = new Set(dataTypes);
  return sourceHunterRecommendations.filter((item) => wanted.has(item.dataType));
}
