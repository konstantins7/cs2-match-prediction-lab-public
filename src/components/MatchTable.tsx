import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { CalculatedMatch } from "@/lib/data/matches";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { RiskBadge } from "./RiskBadge";

export function MatchTable({ rows }: { rows: CalculatedMatch[] }) {
  return (
    <div className="overflow-x-auto rounded border border-lab-border bg-lab-panel">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-lab-panel2 text-xs uppercase text-lab-muted">
          <tr>
            <th className="px-3 py-3">Дата</th>
            <th className="px-3 py-3">Турнир</th>
            <th className="px-3 py-3">Формат</th>
            <th className="px-3 py-3">Матч</th>
            <th className="px-3 py-3">Статус</th>
            <th className="px-3 py-3">Прогноз</th>
            <th className="px-3 py-3">Качество</th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-lab-border">
          {rows.map(({ match, prediction }) => (
            <tr key={match.id} className="hover:bg-lab-panel2/60">
              <td className="px-3 py-3 text-lab-muted">{formatDateTime(match.startTime)}</td>
              <td className="px-3 py-3">{match.eventName}</td>
              <td className="px-3 py-3">{match.format}</td>
              <td className="px-3 py-3">
                {match.teamA.name} <span className="text-lab-muted">vs</span> {match.teamB.name}
                <div className="text-xs text-lab-muted">
                  Rank {match.teamA.valveRank ?? "-"} / {match.teamB.valveRank ?? "-"}
                </div>
              </td>
              <td className="px-3 py-3">{match.status}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  <ConfidenceBadge value={prediction.confidenceScore} />
                  <RiskBadge value={prediction.riskLevel} />
                </div>
                <div className="mt-1 text-xs text-lab-muted">
                  {prediction.teamAProbability}% / {prediction.teamBProbability}%
                </div>
              </td>
              <td className="px-3 py-3">{prediction.dataQualityScore}/100</td>
              <td className="px-3 py-3">
                <Link href={`/match/${match.id}`} className="text-lab-cyan hover:text-cyan-200">
                  Разбор
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
