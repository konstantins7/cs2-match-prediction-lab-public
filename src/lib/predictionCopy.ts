import type { PredictionOutput } from "./predictionEngine";

export function predictionHeadline(prediction: PredictionOutput, winnerName: string) {
  if (prediction.dataQualityScore < 20) return "Недостаточно данных";
  if (prediction.readiness.level === "L0_FIXTURE_ONLY") return "Прогноз не готов";
  if (prediction.readiness.level === "L1_BASIC_CONTEXT") return "Слабый предварительный сигнал, не полноценный прогноз";
  if (prediction.readiness.level === "L2_BASIC_PREDICTION") return "Предварительный прогноз, данных всё ещё мало";
  if (prediction.dataQualityScore < 40 || Math.abs(prediction.teamAProbability - prediction.teamBProbability) <= 4) {
    return "Недостаточно данных для сильного перевеса";
  }
  return `Модель склоняется к ${winnerName}`;
}

export function predictionReadinessCopy(prediction: PredictionOutput) {
  if (prediction.dataQualityScore < 20) {
    return "Сейчас это только предварительный просмотр при недостатке данных: вероятность не является готовым прогнозом.";
  }
  if (prediction.readiness.level === "L0_FIXTURE_ONLY") {
    return "Есть только базовые данные матча. Для прогноза не хватает рейтинга, формы, игроков, карт, veto и H2H.";
  }
  if (prediction.readiness.level === "L1_BASIC_CONTEXT") {
    return "Есть слабый сигнал по рейтингу/watchlist/basic context, но нет состава, статистики игроков, карт, veto и H2H.";
  }
  if (prediction.readiness.level === "L2_BASIC_PREDICTION") {
    return "Есть рейтинг и базовые результаты последних матчей, поэтому разрешён ограниченный preview, но это ещё не полноценный аналитический прогноз.";
  }
  return prediction.explanation;
}
