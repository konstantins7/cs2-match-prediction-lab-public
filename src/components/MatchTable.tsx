import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { CalculatedMatch } from "@/lib/data/matches";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ReadinessBadge } from "./ReadinessBadge";
import { RiskBadge } from "./RiskBadge";
import { SourceModeBadge } from "./SourceModeBadge";
import { RealForecastBadge, SourceLevelBadge } from "./RealForecastBadge";
import { getBestNextAction, humanForecastStatus } from "@/lib/bestNextAction";
import { deriveDataDepth } from "@/lib/ui/forecastUx";
import { StatusPill } from "@/components/ui";

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
            <th className="px-3 py-3">Источник данных</th>
            <th className="px-3 py-3">Priority</th>
            <th className="px-3 py-3">Готовность прогноза</th>
            <th className="px-3 py-3">Прогноз</th>
            <th className="px-3 py-3">Качество</th>
            <th className="px-3 py-3">Обновления</th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-lab-border">
          {rows.map((row) => {
            const { match, prediction, priority } = row;
            const nextAction = getBestNextAction(prediction).primaryAction;
            const depth = deriveDataDepth(row.input, prediction);
            const missing = prediction.readiness.missingCriticalData.slice(0, 2);
            return (
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
              <td className="px-3 py-3"><SourceModeBadge sourceMode={match.sourceMode} needsReview={match.needsReview} /></td>
              <td className="px-3 py-3">
                <div className="text-white">{priority.priorityLabel}</div>
                <div className="text-xs text-lab-muted">{priority.visibilityTier} · {priority.priorityScore}</div>
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  <ReadinessBadge level={prediction.readiness.level} />
                  <RealForecastBadge isReady={prediction.realForecast.isReady} />
                  <StatusPill label={humanForecastStatus(prediction)} tone={prediction.realForecast.isReady ? "green" : "cyan"} />
                  <SourceLevelBadge sourceLevel={prediction.sourceLevel} />
                  {prediction.sourceLevel === "Sample only" && <span className="rounded border border-violet-400/70 px-2 py-1 text-xs text-violet-300">SAMPLE ONLY</span>}
                  <span className="rounded border border-lab-cyan/50 px-2 py-1 text-xs text-lab-cyan">Data Depth {depth.level}/5</span>
                </div>
                <div className="mt-2 text-xs text-lab-muted">{missing.length ? missing.join(" · ") : "Критичных пропусков нет"}</div>
              </td>
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
              <td className="px-3 py-3 text-xs text-lab-muted">
                <div>Матч обновлён: {formatDateTime(match.updatedAt)}</div>
                <div>Прогноз пересчитан: {match.audits?.[0]?.createdAt ? formatDateTime(match.audits[0].createdAt) : "нет"}</div>
              </td>
              <td className="px-3 py-3">
                <Link href={`/match/${match.id}`} className="text-lab-cyan hover:text-cyan-200">
                  Разбор
                </Link>
                <div>
                  <Link href={actionHref(nextAction.href, match.id)} className="text-xs text-lab-amber hover:text-amber-200">
                    {nextAction.label}
                  </Link>
                </div>
              </td>
            </tr>
          );})}
        </tbody>
      </table>
    </div>
  );
}

function actionHref(href: string, matchId: string) {
  if (!href.startsWith("/admin/research-queue")) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}matchId=${encodeURIComponent(matchId)}`;
}
