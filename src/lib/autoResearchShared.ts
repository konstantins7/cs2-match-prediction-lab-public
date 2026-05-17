export const GLOBAL_RESEARCH_PROGRESS_STEPS = [
  "Получаю матчи",
  "Обновляю рейтинги",
  "Проверяю патчи CS2",
  "Проверяю составы",
  "Проверяю игроков",
  "Проверяю новости",
  "Пересобираю признаки",
  "Пересчитываю прогнозы",
  "Обновляю задачи",
  "Готово"
] as const;

export type AutoResearchMetrics = {
  matches: number;
  readyForecasts: number;
  basicPreview: number;
  needsManualData: number;
  teamsWithRank: number;
  L0_FIXTURE_ONLY: number;
  L1_BASIC_CONTEXT: number;
  L2_BASIC_PREDICTION: number;
  L3_ANALYTICAL: number;
  L4_DEEP: number;
  teamsWithRoster: number;
  matchesWithMapVeto: number;
  researchTasks: number;
  sourceSetupNeeded: number;
};

export type AutoResearchSourceReport = {
  source: string;
  dataType: string;
  status: "success" | "partial" | "failed" | "blocked" | "disabled" | "skipped";
  message: string;
};

export type AutoResearchSummary = {
  before: AutoResearchMetrics;
  after: AutoResearchMetrics;
  diff: AutoResearchMetrics;
  updatedMatches: number;
  newMatches: number;
  predictionsRecalculated: number;
  sourceIssues: Array<{ source: string; status?: string; message: string }>;
  succeeded: string[];
  unavailable: string[];
  unavailableReason: string;
  sourceReports: AutoResearchSourceReport[];
};

export type OneClickResult = {
  ok: boolean;
  steps: string[];
  summary: AutoResearchSummary;
  errors: string[];
};

export type ForecastAutopilotMode = "fast" | "deeper" | "max";

export type ForecastAutopilotState = "ready" | "basic" | "missing";

export type ForecastabilityTier = "READY" | "NEARLY_READY" | "BASIC_ONLY" | "BLOCKED" | "NOT_ENOUGH_DATA";

export type CoverageBreakdownStatus = "yes" | "partial" | "no";

export type CoverageFreshnessDetails = {
  collectedAt?: string | null;
  sourceDate?: string | null;
  freshnessDays?: number | null;
  dataPeriod?: string | null;
  targetStartTime: string;
};

export type CoverageBreakdownItem = {
  id: string;
  label: string;
  points: number;
  maxPoints: number;
  status: CoverageBreakdownStatus;
  explanation: string;
  blocker?: string;
  freshness?: CoverageFreshnessDetails;
};

export type ForecastAutopilotProviderContribution = {
  source: string;
  status: CoverageBreakdownStatus | "unavailable";
  contribution: string;
  points?: number;
};

export type ForecastAutopilotNextAction = {
  label: string;
  reason: string;
  target: string;
  priority: "high" | "medium" | "low";
};

export type ForecastAutopilotCandidate = {
  matchId: string;
  href: string;
  eventName: string;
  startTime: string;
  status: string;
  format: string;
  teamAName: string;
  teamBName: string;
  coverageScore: number;
  maxCoverageScore: number;
  coverageBreakdown: CoverageBreakdownItem[];
  forecastabilityTier: ForecastabilityTier;
  forecastabilityLabel: string;
  readinessLevel: string;
  readinessRank: number;
  realForecastReady: boolean;
  previewDataDepth: number;
  realDataDepth: number;
  dataQualityScore: number;
  confidenceScore: number;
  priorityScore: number;
  priorityLabel: string;
  selectionReason: string;
  whySelected?: string;
  whyNotSelected?: string;
  blockers: string[];
  missingBlocks: string[];
  providerContributions: ForecastAutopilotProviderContribution[];
  nextDataActions: ForecastAutopilotNextAction[];
};

export type RealDataFoundationCoverage = {
  checkedCandidates: number;
  tierCounts: Record<ForecastabilityTier, number>;
  coverageCounts: {
    roster: number;
    playerStats: number;
    mapStats: number;
    veto: number;
    gridMapped: number;
  };
  blockerFrequency: Array<{ blocker: string; count: number }>;
  topBlockers: string[];
  topCandidates: ForecastAutopilotCandidate[];
  liquipediaSetup: {
    configured: boolean;
    message: string;
  };
};

export type ForecastAutopilotResult = {
  ok: boolean;
  mode: ForecastAutopilotMode;
  state: ForecastAutopilotState;
  message: string;
  matchId?: string;
  readinessLevel?: string;
  realForecastReady: boolean;
  primaryAction: {
    label: string;
    href: string;
    reason: string;
  };
  secondaryActions: Array<{
    label: string;
    href: string;
    reason: string;
  }>;
  succeeded: string[];
  unavailable: string[];
  sourceSuggestions: Array<{
    label: string;
    sources: string[];
    actionLabel: string;
    href: string;
  }>;
  oneClick: OneClickResult;
  bestCandidate?: ForecastAutopilotCandidate | null;
  currentCandidate?: ForecastAutopilotCandidate | null;
  topCandidates?: ForecastAutopilotCandidate[];
  coverageScore?: number;
  coverageBreakdown?: CoverageBreakdownItem[];
  forecastabilityTier?: ForecastabilityTier;
  selectionReason?: string;
  whyNotSelected?: string;
  blockers?: string[];
  providerContributions?: ForecastAutopilotProviderContribution[];
  syncSummary?: AutoResearchSummary;
};
