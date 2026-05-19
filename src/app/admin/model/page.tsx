import { ModelWeightEditor } from "@/components/ModelWeightEditor";
import { CalibratedWeightsPanel } from "@/components/CalibratedWeightsPanel";
import { prisma } from "@/lib/prisma";
import { buildPredictionInput, getDefaultModelWeights } from "@/lib/predictionEngine";

export const dynamic = "force-dynamic";

export default async function AdminModelPage() {
  const match = await prisma.match.findFirst({ where: { status: "upcoming" }, orderBy: { startTime: "asc" } });
  if (!match) {
    return <p className="text-lab-muted">Нет upcoming матчей для preview.</p>;
  }
  const [input, weights, presets] = await Promise.all([
    buildPredictionInput(match.id),
    getDefaultModelWeights(),
    prisma.modelWeightPreset.findMany({ orderBy: { name: "asc" } })
  ]);

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold text-white">Настройка весов модели</h1>
        <p className="mt-1 text-sm text-lab-muted">Preview использует первый upcoming матч и live calculatePrediction на клиенте.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((preset) => (
            <span key={preset.id} className="rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted">{preset.name}</span>
          ))}
        </div>
      </section>
      <CalibratedWeightsPanel />
      <ModelWeightEditor input={JSON.parse(JSON.stringify(input))} initialWeights={weights} />
    </div>
  );
}
