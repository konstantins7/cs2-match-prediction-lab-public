import type { PredictionInput, PredictionOutput } from "@/lib/predictionEngine";
import { deriveDataDepth, deriveRealDataDepth, type DataDepth } from "@/lib/ui/forecastUx";

export const firstRealForecastTarget = {
  matchId: "pandascore_match_1488973",
  teamAName: "Evo Novo",
  teamBName: "WAZABI",
  startTime: "2026-05-21T18:00:00.000Z",
  format: "BO3",
  status: "upcoming",
  sourceMode: "pandascore_free"
} as const;

export const firstRealForecastRequiredSheets = ["roster", "player_stats", "map_stats", "veto_history"] as const;
export const firstRealForecastOptionalSheets = ["h2h", "news_events"] as const;

export type FirstRealForecastCandidate = {
  matchId: string;
  teams: string;
  startTime: string;
  format: string;
  eventName: string;
  sourceMode: string;
};

export type FirstRealForecastSessionView = {
  matchId: string;
  teams: string;
  startTime: string;
  format: string;
  eventName: string;
  status: string;
  sourceMode: string;
  isDefaultTarget: boolean;
  isFuture: boolean;
  isUpcoming: boolean;
  canonicalTeamsOk: boolean;
  targetValid: boolean;
  workflowReady: boolean;
  readinessBefore: string;
  realForecastReadyBefore: boolean;
  sourceLevel: string;
  previewDataDepth: DataDepth;
  realDataDepth: DataDepth;
  missingBlocks: string[];
  blockers: string[];
  warnings: string[];
  nearestFutureMatches: FirstRealForecastCandidate[];
};

type TargetMatchLike = {
  id: string;
  startTime: string | Date;
  status: string;
  format: string;
  eventName: string;
  sourceMode: string;
  teamA: { name: string };
  teamB: { name: string };
};

export function evaluateFirstRealForecastTarget(match: TargetMatchLike, now = new Date()) {
  const startTime = new Date(match.startTime);
  const isDefaultTarget = match.id === firstRealForecastTarget.matchId;
  const isFuture = startTime.getTime() > now.getTime();
  const isUpcoming = match.status === "upcoming";
  const canonicalTeamsOk = match.teamA.name === firstRealForecastTarget.teamAName && match.teamB.name === firstRealForecastTarget.teamBName;
  const blockers = [
    !isDefaultTarget ? `Открыт не default target ${firstRealForecastTarget.matchId}.` : "",
    !isFuture ? "Матч уже не future относительно текущего времени, live pre-match flow остановлен." : "",
    !isUpcoming ? "status должен быть upcoming." : "",
    !canonicalTeamsOk ? `Canonical teams должны быть ${firstRealForecastTarget.teamAName} vs ${firstRealForecastTarget.teamBName}.` : ""
  ].filter(Boolean);
  return {
    isDefaultTarget,
    isFuture,
    isUpcoming,
    canonicalTeamsOk,
    targetValid: blockers.length === 0,
    blockers
  };
}

export function buildFirstRealForecastSessionView({
  input,
  prediction,
  now = new Date(),
  nearestFutureMatches = []
}: {
  input: PredictionInput;
  prediction: PredictionOutput;
  now?: Date;
  nearestFutureMatches?: FirstRealForecastCandidate[];
}): FirstRealForecastSessionView {
  const match = {
    id: input.match.id,
    startTime: input.match.startTime,
    status: input.match.status,
    format: input.match.format,
    eventName: input.match.eventName,
    sourceMode: input.match.sourceMode ?? "unknown",
    teamA: { name: input.teamA.name },
    teamB: { name: input.teamB.name }
  };
  const preflight = evaluateFirstRealForecastTarget(match, now);
  const missingBlocks = [
    ...prediction.readiness.missingCriticalData,
    ...prediction.realForecast.reasons
  ].filter((item, index, all) => item && all.indexOf(item) === index);

  return {
    matchId: input.match.id,
    teams: `${input.teamA.name} vs ${input.teamB.name}`,
    startTime: new Date(input.match.startTime).toISOString(),
    format: input.match.format,
    eventName: input.match.eventName,
    status: input.match.status,
    sourceMode: input.match.sourceMode ?? "unknown",
    ...preflight,
    workflowReady: preflight.targetValid,
    readinessBefore: prediction.readiness.level,
    realForecastReadyBefore: prediction.realForecast.isReady,
    sourceLevel: prediction.sourceLevel,
    previewDataDepth: deriveDataDepth(input, prediction),
    realDataDepth: deriveRealDataDepth(input, prediction),
    missingBlocks,
    warnings: [
      "Без реальных CSV/TSV данных Apply не запускается.",
      "CSV-шаблоны не считаются real data и должны быть заменены реальными строками.",
      "Real Forecast Ready может стать yes только через существующие Real Forecast gates."
    ],
    nearestFutureMatches
  };
}

export function buildBlockedFirstRealForecastSessionView(blockers: string[], nearestFutureMatches: FirstRealForecastCandidate[] = []): FirstRealForecastSessionView {
  return {
    matchId: firstRealForecastTarget.matchId,
    teams: `${firstRealForecastTarget.teamAName} vs ${firstRealForecastTarget.teamBName}`,
    startTime: firstRealForecastTarget.startTime,
    format: firstRealForecastTarget.format,
    eventName: "unknown",
    status: "missing",
    sourceMode: firstRealForecastTarget.sourceMode,
    isDefaultTarget: false,
    isFuture: false,
    isUpcoming: false,
    canonicalTeamsOk: false,
    targetValid: false,
    workflowReady: false,
    readinessBefore: "L0_FIXTURE_ONLY",
    realForecastReadyBefore: false,
    sourceLevel: "Fixture only",
    previewDataDepth: { level: 1, label: "Базовые данные матча", description: "Target не прошёл preflight." },
    realDataDepth: { level: 1, label: "Недостаточно real data", description: "Target не прошёл preflight." },
    missingBlocks: ["player roster", "player stats", "map stats", "veto history"],
    blockers,
    warnings: ["Live forecast flow остановлен до выбора настоящего future/upcoming target."],
    nearestFutureMatches
  };
}
