import type { PredictionReadinessLevel } from "./predictionEngine";

export const readinessRu: Record<PredictionReadinessLevel, string> = {
  L0_FIXTURE_ONLY: "Не готов",
  L1_BASIC_CONTEXT: "Слабый сигнал",
  L2_BASIC_PREDICTION: "Базовый прогноз",
  L3_ANALYTICAL: "Аналитический прогноз",
  L4_DEEP: "Глубокий прогноз"
};

export const readinessBadgeRu: Record<PredictionReadinessLevel, string> = {
  L0_FIXTURE_ONLY: "НЕ ГОТОВ",
  L1_BASIC_CONTEXT: "СЛАБЫЙ СИГНАЛ",
  L2_BASIC_PREDICTION: "БАЗОВЫЙ ПРОГНОЗ",
  L3_ANALYTICAL: "АНАЛИТИЧЕСКИЙ",
  L4_DEEP: "ГЛУБОКИЙ"
};

export const sourceModeRu: Record<string, string> = {
  demo: "ДЕМО ДАННЫЕ",
  valve_rankings: "VALVE RANKING",
  steam_updates: "STEAM UPDATES",
  pandascore_free: "PANDASCORE FREE",
  manual_real: "РУЧНЫЕ РЕАЛЬНЫЕ ДАННЫЕ",
  manual_reference: "РУЧНОЙ REFERENCE",
  parsed_demo: "PARSED DEMO",
  analyst_sample: "ТЕСТОВЫЕ ДАННЫЕ",
  liquipedia_limited: "LIQUIPEDIA LIMITED",
  faceit_optional: "FACEIT OPTIONAL",
  grid_open_access: "GRID OPEN ACCESS",
  mixed: "СМЕШАННЫЕ ИСТОЧНИКИ",
  partial: "ЧАСТИЧНЫЕ ДАННЫЕ",
  needs_review: "НУЖНА ПРОВЕРКА"
};

export const sourceLevelRu: Record<string, string> = {
  "Fixture only": "Только базовые данные матча",
  "Basic free data": "Базовые бесплатные данные",
  "Manual real partial": "Ручные данные, частично",
  "Manual real analytical": "Ручные данные, аналитика",
  "Sample only": "Только тестовые данные",
  "Deep data": "Глубокие данные"
};

export function sourceLevelLabel(value: string) {
  return sourceLevelRu[value] ?? value;
}

export function staleLabel(isStale: boolean) {
  return isStale ? "да" : "нет";
}
