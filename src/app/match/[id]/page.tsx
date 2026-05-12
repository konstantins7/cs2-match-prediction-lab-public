import { MatchDetailTabs } from "@/components/MatchDetailTabs";
import { getCalculatedMatch } from "@/lib/data/matches";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCalculatedMatch(id);
  const safeData = JSON.parse(JSON.stringify(data)) as typeof data;

  return <MatchDetailTabs input={safeData.input} prediction={safeData.prediction} />;
}
