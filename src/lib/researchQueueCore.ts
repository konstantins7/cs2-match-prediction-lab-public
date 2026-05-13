import { getEffectiveRank, isWatchlistTeam } from "./proFocus";
import type { PredictionInput, PredictionReadiness } from "./prediction/types";

export type ResearchTaskStatus = "open" | "in_progress" | "done" | "skipped" | "blocked";
export type ResearchTaskPriority = "high" | "medium" | "low";
export type ResearchTaskActionState = "Available" | "Coming soon" | "Requires API key" | "Requires manual input" | "Blocked by needs_review";

export type ResearchTask = {
  id: string;
  task: string;
  status: ResearchTaskStatus;
  priority: ResearchTaskPriority;
  reason: string;
  expectedImpact: string;
  sourceSuggestion: string;
  actionType: string;
  actionState: ResearchTaskActionState;
  createdAt: string;
  completedAt: string | null;
};

export type ResearchQueueRow = {
  matchId: string;
  matchLabel: string;
  eventName: string;
  startTime: Date | string;
  readinessLevel: PredictionReadiness["level"];
  readinessLabel: string;
  dataQualityScore: number;
  confidenceScore: number;
  sourceMode: string;
  missingCriticalData: string[];
  nextBestAction: string;
  tasks: ResearchTask[];
  packId?: string;
};

export const knownTeamMatchingIssues = [
  "G2",
  "Vitality",
  "Liquid",
  "The MongolZ",
  "BetBoom",
  "Aurora",
  "ENCE",
  "fnatic",
  "SAW",
  "Monte",
  "PARIVISION",
  "M80"
];

function taskId(matchId: string, task: string) {
  return `${matchId}-${task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

function makeTask(matchId: string, task: Omit<ResearchTask, "id" | "status" | "createdAt" | "completedAt"> & { status?: ResearchTaskStatus; completedAt?: string | null }): ResearchTask {
  const { status: requestedStatus, completedAt, ...rest } = task;
  const status = requestedStatus ?? (rest.actionState === "Blocked by needs_review" ? "blocked" : "open");
  return {
    id: taskId(matchId, rest.task),
    status,
    createdAt: new Date().toISOString(),
    completedAt: status === "done" ? (completedAt ?? new Date().toISOString()) : null,
    ...rest
  };
}

function hasRank(input: PredictionInput) {
  return Boolean(getEffectiveRank(input.teamA).rank || getEffectiveRank(input.teamB).rank);
}

function teamNeedsRank(input: PredictionInput, side: "A" | "B") {
  const team = side === "A" ? input.teamA : input.teamB;
  const rank = getEffectiveRank(team).rank;
  return !rank && isWatchlistTeam(team.name);
}

export function buildResearchQueueForMatch(input: PredictionInput, _readiness: PredictionReadiness): ResearchTask[] {
  const tasks: ResearchTask[] = [];
  const matchId = input.match.id;
  const blocked = input.match.needsReview || input.sourceConflicts.length > 0;
  const rankReady = hasRank(input);
  const rosterReady = input.playersA.length >= 5 && input.playersB.length >= 5;
  const playerStatsReady = input.playerStatsA.length >= 5 && input.playerStatsB.length >= 5;
  const mapStatsReady = input.mapStatsA.reduce((sum, stat) => sum + stat.mapsPlayed, 0) >= 7 && input.mapStatsB.reduce((sum, stat) => sum + stat.mapsPlayed, 0) >= 7;
  const vetoReady = input.vetoPatternsA.length > 0 && input.vetoPatternsB.length > 0;
  const h2hReady = input.h2h.length > 0;
  const newsReady = input.news.length > 0 || input.rosterEventsA.length > 0 || input.rosterEventsB.length > 0;

  tasks.push(makeTask(matchId, {
    task: "Confirm rank/team match",
    status: rankReady && !teamNeedsRank(input, "A") && !teamNeedsRank(input, "B") ? "done" : blocked ? "blocked" : "open",
    priority: "high",
    reason: "Без подтверждённого rank mapping ranking signal остаётся слабым или отсутствует.",
    expectedImpact: "Может поднять readiness до L1/L2, если есть basic result history.",
    sourceSuggestion: "Valve Rankings или HLTV manual reference import без scraping.",
    actionType: "confirm_rank_match",
    actionState: rankReady ? "Available" : blocked ? "Blocked by needs_review" : "Requires manual input"
  }));

  if (!rankReady || teamNeedsRank(input, "A") || teamNeedsRank(input, "B")) {
    tasks.push(makeTask(matchId, {
      task: "Import HLTV manual rank",
      priority: "medium",
      reason: "Manual reference rank помогает сопоставить известные команды, если Valve matching не сработал.",
      expectedImpact: "Добавит rank context, но не заменит player/map/veto данные.",
      sourceSuggestion: "Manual CSV/JSON: rank, teamName, hltvReferenceUrl, rankingDate.",
      actionType: "import_hltv_manual_rank",
      actionState: "Available"
    }));
  }

  tasks.push(makeTask(matchId, {
    task: "Bind roster",
    status: rosterReady ? "done" : "open",
    priority: "high",
    reason: "Без состава нельзя оценить player form, roles, chemistry и roster stability.",
    expectedImpact: "Открывает путь к L2/L3 после добавления player stats.",
    sourceSuggestion: "Manual enrichment JSON, Liquipedia limited или PandaScore roster relation если доступна.",
    actionType: "import_roster_json",
    actionState: rosterReady ? "Available" : "Requires manual input"
  }));

  tasks.push(makeTask(matchId, {
    task: "Import player stats",
    status: playerStatsReady ? "done" : "open",
    priority: "high",
    reason: "Player stats нужны для rating/KD/ADR/trend/pressure факторов.",
    expectedImpact: "Повышает data quality и может перевести матч к analytical readiness.",
    sourceSuggestion: "Manual enrichment, parsed demo JSON, GRID при доступе.",
    actionType: "import_player_stats_json",
    actionState: playerStatsReady ? "Available" : "Requires manual input"
  }));

  tasks.push(makeTask(matchId, {
    task: "Import map stats",
    status: mapStatsReady ? "done" : "open",
    priority: "high",
    reason: "Без map stats нельзя оценить map pool, CT/T split, pistol/economy и overtime.",
    expectedImpact: "Ключевой шаг для L3 analytical forecast.",
    sourceSuggestion: "Manual map stats JSON, parsed demo JSON или GRID.",
    actionType: "import_map_stats_json",
    actionState: mapStatsReady ? "Available" : "Requires manual input"
  }));

  tasks.push(makeTask(matchId, {
    task: "Import veto history",
    status: vetoReady ? "done" : "open",
    priority: "high",
    reason: "BO3 прогноз без veto history остаётся preliminary.",
    expectedImpact: "Улучшает map/veto factor и снижает risk.",
    sourceSuggestion: "Manual veto JSON или parsed demo/event history.",
    actionType: "import_veto_history_json",
    actionState: vetoReady ? "Available" : "Requires manual input"
  }));

  tasks.push(makeTask(matchId, {
    task: "Add H2H",
    status: h2hReady ? "done" : "open",
    priority: "medium",
    reason: "H2H полезен только с roster similarity, но помогает matchup context.",
    expectedImpact: "Добавляет context, особенно если составы похожи.",
    sourceSuggestion: "Manual H2H JSON.",
    actionType: "import_h2h_json",
    actionState: h2hReady ? "Available" : "Requires manual input"
  }));

  tasks.push(makeTask(matchId, {
    task: "Add news/roster events",
    status: newsReady ? "done" : "open",
    priority: "medium",
    reason: "Roster/news events повышают risk awareness и source transparency.",
    expectedImpact: "Улучшает risk/confidence explanation без резкого изменения вероятности.",
    sourceSuggestion: "Manual news/roster events JSON с reliability.",
    actionType: "import_news_json",
    actionState: newsReady ? "Available" : "Requires manual input"
  }));

  tasks.push(makeTask(matchId, {
    task: "Import parsed demo JSON",
    priority: "medium",
    reason: "Parsed demo даёт round/player/map depth без платных провайдеров.",
    expectedImpact: "Может поднять readiness до L4 при достаточной выборке.",
    sourceSuggestion: "Parsed demo JSON import.",
    actionType: "import_parsed_demo_json",
    actionState: "Requires manual input"
  }));

  tasks.push(makeTask(matchId, {
    task: "Connect GRID/Liquipedia",
    priority: "low",
    reason: "Автоматические roster/history/deep stats ускорят analyst workflow, если доступ появится.",
    expectedImpact: "Снизит ручную работу и source gaps.",
    sourceSuggestion: "GRID Open Access / Liquipedia limited with API key.",
    actionType: "connect_external_source",
    actionState: "Requires API key"
  }));

  return tasks;
}

export function summarizeResearchQueue(rows: ResearchQueueRow[]) {
  return {
    matchesBelowAnalytical: rows.length,
    tasksTotal: rows.reduce((sum, row) => sum + row.tasks.length, 0),
    highPriority: rows.reduce((sum, row) => sum + row.tasks.filter((task) => task.priority === "high").length, 0),
    requiresManualInput: rows.reduce((sum, row) => sum + row.tasks.filter((task) => task.actionState === "Requires manual input").length, 0),
    blocked: rows.reduce((sum, row) => sum + row.tasks.filter((task) => task.actionState === "Blocked by needs_review").length, 0)
  };
}
