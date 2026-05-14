import { prisma } from "../prisma";
import { friendlySourceError } from "../friendlyErrors";
import { sourceAdapters } from "../sources";
import { runSourceSync } from "../sources/sourceScheduler";
import type { SourceJobType, SourceName, SourceStatus, SourceSyncResult } from "../sources/types";
import type { AutoResearchSourceReport } from "../autoResearchShared";
import type { ForecastAutopilotMode } from "../autoResearchShared";

export type OrchestratorJob = {
  dataType: string;
  source: SourceName;
  jobType: SourceJobType;
  requiresEnabled?: boolean;
  futureOnly?: boolean;
};

export const AUTO_RESEARCH_ORCHESTRATOR_PLAN: OrchestratorJob[] = [
  { dataType: "fixture", source: "pandascore", jobType: "match_history" },
  { dataType: "fixture", source: "pandascore", jobType: "upcoming_matches" },
  { dataType: "fixture", source: "pandascore", jobType: "finished_matches" },
  { dataType: "fixture", source: "pandascore", jobType: "series" },
  { dataType: "fixture", source: "pandascore", jobType: "tournaments" },
  { dataType: "fixture", source: "pandascore", jobType: "teams" },
  { dataType: "fixture", source: "pandascore", jobType: "players" },
  { dataType: "ranking", source: "valve-rankings", jobType: "valve_rankings" },
  { dataType: "patch/meta", source: "cs-updates", jobType: "game_meta_updates" },
  { dataType: "roster", source: "liquipedia", jobType: "rosters", requiresEnabled: true },
  { dataType: "roster", source: "liquipedia", jobType: "roster_events", requiresEnabled: true },
  { dataType: "player stats", source: "faceit", jobType: "player_stats", requiresEnabled: true },
  { dataType: "player stats", source: "grid", jobType: "player_stats", requiresEnabled: true, futureOnly: true },
  { dataType: "map/veto", source: "grid", jobType: "map_stats", requiresEnabled: true, futureOnly: true },
  { dataType: "round/economy", source: "grid", jobType: "match_history", requiresEnabled: true, futureOnly: true },
  { dataType: "news", source: "telegram-news", jobType: "manual_news_import", requiresEnabled: true }
];

export type SourceBudgetState = {
  source: SourceName;
  requestsUsed: number;
  requestsRemaining: number | null;
  resetAt: Date;
  nextAllowedSyncAt: Date | null;
  status: string;
};

export async function getSourceBudgetState(source: SourceName, now = new Date()): Promise<SourceBudgetState> {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  const [health, requestsUsed] = await Promise.all([
    prisma.sourceHealth.findUnique({ where: { source } }),
    prisma.dataSyncJob.count({ where: { source, startedAt: { gte: since } } })
  ]);
  return {
    source,
    requestsUsed,
    requestsRemaining: health?.rateLimitRemaining ?? null,
    resetAt: new Date(since.getTime() + 2 * 60 * 60 * 1000),
    nextAllowedSyncAt: health?.nextAllowedSyncAt ?? null,
    status: health?.status ?? "idle"
  };
}

function sourceStatus(source: SourceName): SourceStatus | null {
  return sourceAdapters.find((adapter) => adapter.name === source)?.status() ?? null;
}

export function getSourceSkipReason(job: OrchestratorJob, status: SourceStatus | null, budget: SourceBudgetState, now = new Date()) {
  if (!status) return "Источник не найден.";
  if (job.futureOnly && !status.enabled) return "Интеграция подготовлена, но доступ ещё не настроен.";
  if (job.requiresEnabled && !status.enabled) {
    return status.configured ? "Источник выключен. Включите sync-флаг в .env." : "Источник не подключён. Добавьте API key в .env.";
  }
  if (status.nextAllowedSyncAt && new Date(status.nextAllowedSyncAt).getTime() > now.getTime()) return "Лимит источника достигнут, попробуйте позже.";
  if (budget.nextAllowedSyncAt && budget.nextAllowedSyncAt.getTime() > now.getTime()) return "Лимит источника достигнут, попробуйте позже.";
  if (budget.requestsRemaining === 0) return "Лимит источника достигнут, попробуйте позже.";
  return null;
}

function shouldRunJobForMode(job: OrchestratorJob, mode: ForecastAutopilotMode | "one_click") {
  if (mode === "fast") return !job.requiresEnabled;
  return true;
}

export async function runAutoResearchOrchestrator(now = new Date(), mode: ForecastAutopilotMode | "one_click" = "one_click"): Promise<{ results: SourceSyncResult[]; reports: AutoResearchSourceReport[] }> {
  const results: SourceSyncResult[] = [];
  const reports: AutoResearchSourceReport[] = [];

  for (const job of AUTO_RESEARCH_ORCHESTRATOR_PLAN) {
    if (!shouldRunJobForMode(job, mode)) {
      reports.push({ source: job.source, dataType: job.dataType, status: "skipped", message: "Режим Быстро пропускает optional API providers." });
      continue;
    }
    const status = sourceStatus(job.source);
    const budget = await getSourceBudgetState(job.source, now);
    const skipReason = getSourceSkipReason(job, status, budget, now);
    if (skipReason) {
      reports.push({ source: job.source, dataType: job.dataType, status: "skipped", message: skipReason });
      continue;
    }
    try {
      const result = await runSourceSync(job.source, job.jobType);
      results.push(result);
      reports.push({
        source: job.source,
        dataType: job.dataType,
        status: result.status,
        message: result.notes ?? `${job.source} ${job.jobType}: ${result.status}`
      });
    } catch (error) {
      reports.push({
        source: job.source,
        dataType: job.dataType,
        status: "failed",
        message: friendlySourceError(job.source, error instanceof Error ? error.message : String(error))
      });
    }
  }

  reports.push(
    { source: "manual", dataType: "ranking", status: "skipped", message: "Manual HLTV reference используется, если уже импортирован. Scraping не выполняется." },
    { source: "manual", dataType: "news", status: "skipped", message: "Manual official/HLTV/Telegram notes используются, если уже внесены вручную." },
    { source: "parsed-demo", dataType: "player stats", status: "skipped", message: "Parsed demo используется после ручной загрузки JSON." },
    { source: "parsed-demo", dataType: "map/veto", status: "skipped", message: "Parsed demo используется после ручной загрузки JSON." }
  );

  return { results, reports };
}
