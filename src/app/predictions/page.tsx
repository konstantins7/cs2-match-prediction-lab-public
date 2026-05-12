import { PredictionCard } from "@/components/PredictionCard";
import { getCalculatedMatches } from "@/lib/data/matches";

export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  const rows = await getCalculatedMatches({ status: "upcoming", limit: 20 });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Прогнозы</h1>
        <p className="mt-1 text-sm text-lab-muted">Каждая карточка пересчитана live через buildPredictionInput + calculatePrediction.</p>
      </div>
      <div className="grid gap-4">
        {rows.map((row) => <PredictionCard key={row.match.id} row={row} />)}
      </div>
    </div>
  );
}
