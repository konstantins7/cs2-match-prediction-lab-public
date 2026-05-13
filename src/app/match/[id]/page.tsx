import { MatchDetailTabs } from "@/components/MatchDetailTabs";
import { getCalculatedMatch } from "@/lib/data/matches";
import { buildResearchQueueForMatch } from "@/lib/researchQueue";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCalculatedMatch(id);
  const researchTasks = buildResearchQueueForMatch(data.input, data.prediction.readiness);
  const safeData = JSON.parse(JSON.stringify({ ...data, researchTasks })) as typeof data & { researchTasks: typeof researchTasks };

  return <MatchDetailTabs input={safeData.input} prediction={safeData.prediction} priority={safeData.priority} researchTasks={safeData.researchTasks} />;
}
