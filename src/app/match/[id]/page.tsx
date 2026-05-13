import { MatchDetailTabs } from "@/components/MatchDetailTabs";
import { getCalculatedMatch } from "@/lib/data/matches";
import { getLatestFeatureSnapshot } from "@/lib/features/matchFeatureSnapshot";
import { buildResearchQueueForMatch } from "@/lib/researchQueue";
import { buildSourceCoverageMatrix } from "@/lib/sourceCoverageMatrix";
import { getSourceStatuses } from "@/lib/sources/sourceHealth";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, featureSnapshot, sourceStatuses] = await Promise.all([
    getCalculatedMatch(id),
    getLatestFeatureSnapshot(id),
    getSourceStatuses()
  ]);
  const researchTasks = buildResearchQueueForMatch(data.input, data.prediction.readiness);
  const sourceCoverageRows = buildSourceCoverageMatrix(data.input, sourceStatuses);
  const safeData = JSON.parse(JSON.stringify({ ...data, researchTasks, featureSnapshot, sourceCoverageRows })) as typeof data & {
    researchTasks: typeof researchTasks;
    featureSnapshot: typeof featureSnapshot;
    sourceCoverageRows: typeof sourceCoverageRows;
  };

  return <MatchDetailTabs input={safeData.input} prediction={safeData.prediction} priority={safeData.priority} researchTasks={safeData.researchTasks} featureSnapshot={safeData.featureSnapshot} sourceCoverageRows={safeData.sourceCoverageRows} />;
}
