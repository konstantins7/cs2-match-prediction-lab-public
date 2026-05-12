import Link from "next/link";
import { getCalculatedMatches } from "@/lib/data/matches";

export const dynamic = "force-dynamic";

export default async function DataQualityPage() {
  const rows = await getCalculatedMatches({ limit: 30 });
  const sorted = rows.sort((a, b) => a.prediction.dataQualityScore - b.prediction.dataQualityScore);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Качество данных</h1>
        <p className="mt-1 text-sm text-lab-muted">Показывает матчи с малым sample, unknown veto, news uncertainty и низким confidence.</p>
      </div>
      <div className="grid gap-3">
        {sorted.map(({ match, prediction }) => (
          <article key={match.id} className="rounded border border-lab-border bg-lab-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">{match.teamA.name} vs {match.teamB.name}</h2>
                <p className="mt-1 text-sm text-lab-muted">{match.eventName} · DQ {prediction.dataQualityScore}/100 · confidence {prediction.confidenceScore}/100</p>
              </div>
              <Link href={`/match/${match.id}`} className="text-sm text-lab-cyan">Разбор</Link>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-lab-amber">
              {(prediction.riskBreakdown.missingData.length ? prediction.riskBreakdown.missingData : ["Mock data достаточно полные для MVP."]).slice(0, 4).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
