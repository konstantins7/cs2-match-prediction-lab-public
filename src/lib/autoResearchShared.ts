export const GLOBAL_RESEARCH_PROGRESS_STEPS = [
  "Получаю матчи",
  "Обновляю рейтинги",
  "Проверяю обновления CS2",
  "Сопоставляю команды",
  "Пересобираю аналитику",
  "Пересчитываю прогнозы",
  "Готово"
] as const;

export type AutoResearchMetrics = {
  matches: number;
  readyForecasts: number;
  basicPreview: number;
  needsManualData: number;
  teamsWithRank: number;
};

export type AutoResearchSummary = {
  before: AutoResearchMetrics;
  after: AutoResearchMetrics;
  diff: AutoResearchMetrics;
  updatedMatches: number;
  newMatches: number;
  predictionsRecalculated: number;
  sourceIssues: Array<{ source: string; status?: string; message: string }>;
};

export type OneClickResult = {
  ok: boolean;
  steps: string[];
  summary: AutoResearchSummary;
  errors: string[];
};
