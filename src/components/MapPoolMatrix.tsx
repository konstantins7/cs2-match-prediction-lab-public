import type { PredictionInput } from "@/lib/predictionEngine";
import { activeMaps, mapByName } from "@/lib/prediction/utils";

export function MapPoolMatrix({ input }: { input: PredictionInput }) {
  const maps = activeMaps(input);
  const aMap = mapByName(input.mapStatsA);
  const bMap = mapByName(input.mapStatsB);
  if (maps.length === 0) {
    return (
      <div className="rounded border border-lab-border bg-lab-panel p-4">
        <p className="text-sm text-lab-amber">Map/veto данные недоступны на текущем бесплатном источнике. Нужен parsed demo, GRID или manual import.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-lab-border bg-lab-panel">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-lab-panel2 text-xs uppercase text-lab-muted">
          <tr>
            <th className="px-3 py-3">Карта</th>
            <th className="px-3 py-3">A win</th>
            <th className="px-3 py-3">B win</th>
            <th className="px-3 py-3">A pick</th>
            <th className="px-3 py-3">B pick</th>
            <th className="px-3 py-3">A ban</th>
            <th className="px-3 py-3">B ban</th>
            <th className="px-3 py-3">Sample</th>
            <th className="px-3 py-3">Advantage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-lab-border">
          {maps.map((map) => {
            const a = aMap.get(map);
            const b = bMap.get(map);
            const sampleA = a?.mapsPlayed ?? 0;
            const sampleB = b?.mapsPlayed ?? 0;
            const hasSample = sampleA > 0 || sampleB > 0;
            const advantage = hasSample ? (a?.winRate ?? 0.5) - (b?.winRate ?? 0.5) : 0;
            return (
              <tr key={map} className="hover:bg-lab-panel2/60">
                <td className="px-3 py-3 font-medium text-white">{map}</td>
                <td className="px-3 py-3">{Math.round((a?.winRate ?? 0) * 100)}%</td>
                <td className="px-3 py-3">{Math.round((b?.winRate ?? 0) * 100)}%</td>
                <td className="px-3 py-3">{Math.round((a?.pickRate ?? 0) * 100)}%</td>
                <td className="px-3 py-3">{Math.round((b?.pickRate ?? 0) * 100)}%</td>
                <td className="px-3 py-3">{Math.round((a?.banRate ?? 0) * 100)}%</td>
                <td className="px-3 py-3">{Math.round((b?.banRate ?? 0) * 100)}%</td>
                <td className="px-3 py-3">{sampleA} / {sampleB}</td>
                <td className={hasSample ? (advantage >= 0 ? "px-3 py-3 text-lab-green" : "px-3 py-3 text-lab-red") : "px-3 py-3 text-lab-amber"}>
                  {hasSample ? (advantage >= 0 ? input.teamA.name : input.teamB.name) : "Недостаточно данных"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
