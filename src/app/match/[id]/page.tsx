import { MatchDetailTabs } from "@/components/MatchDetailTabs";
import { buildForecastAutopilotCandidate } from "@/lib/autoResearch/candidateSelector";
import { getCalculatedMatch } from "@/lib/data/matches";
import { getLatestFeatureSnapshot } from "@/lib/features/matchFeatureSnapshot";
import { buildFirstRealForecastSessionView, firstRealForecastTarget } from "@/lib/firstRealForecastSheetSession";
import { getGridOpenAccessMatchStatus } from "@/lib/gridOpenAccess";
import { buildManualRealAppliedDataUsageAudit } from "@/lib/manualRealAppliedDataUsageAudit";
import { buildResearchQueueForMatch } from "@/lib/researchQueue";
import { buildSourceCoverageMatrix } from "@/lib/sourceCoverageMatrix";
import { getSourceStatuses } from "@/lib/sources/sourceHealth";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, featureSnapshot, sourceStatuses, manualRealAudit, autopilotCandidate] = await Promise.all([
    getCalculatedMatch(id),
    getLatestFeatureSnapshot(id),
    getSourceStatuses(),
    id === firstRealForecastTarget.matchId ? buildManualRealAppliedDataUsageAudit(id).catch(() => undefined) : Promise.resolve(undefined),
    buildForecastAutopilotCandidate(id).catch(() => undefined)
  ]);
  const gridOpenAccessStatus = await getGridOpenAccessMatchStatus(id);
  const researchTasks = buildResearchQueueForMatch(data.input, data.prediction.readiness);
  const sourceCoverageRows = buildSourceCoverageMatrix(data.input, sourceStatuses);
  const firstRealForecastSession = buildFirstRealForecastSessionView({ input: data.input, prediction: data.prediction, manualRealAudit });
  const safeData = JSON.parse(JSON.stringify({ ...data, researchTasks, featureSnapshot, sourceCoverageRows, firstRealForecastSession, gridOpenAccessStatus, autopilotCandidate })) as typeof data & {
    researchTasks: typeof researchTasks;
    featureSnapshot: typeof featureSnapshot;
    sourceCoverageRows: typeof sourceCoverageRows;
    firstRealForecastSession: typeof firstRealForecastSession;
    gridOpenAccessStatus: typeof gridOpenAccessStatus;
    autopilotCandidate: typeof autopilotCandidate;
  };

  return <MatchDetailTabs input={safeData.input} prediction={safeData.prediction} priority={safeData.priority} researchTasks={safeData.researchTasks} featureSnapshot={safeData.featureSnapshot} sourceCoverageRows={safeData.sourceCoverageRows} firstRealForecastSession={safeData.firstRealForecastSession} gridOpenAccessStatus={safeData.gridOpenAccessStatus} autopilotCandidate={safeData.autopilotCandidate} />;
}
