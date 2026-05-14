import { formatDateTime } from "@/lib/format";
import { calculateNewsImpactForTeamIds, groupNewsForUi, type NewsUsage } from "@/lib/news/newsImpact";
import type { NewsEntity } from "@/lib/prediction/types";

const groupLabels = [
  ["official", "Official news"],
  ["media", "Media/reference"],
  ["insider", "Insider signals"],
  ["rumor", "Rumors"],
  ["expired", "Expired/ignored"]
] as const;

export function NewsRiskSummary({ news, teamAId, teamBId }: { news: NewsEntity[]; teamAId: string; teamBId: string }) {
  const summary = calculateNewsImpactForTeamIds(teamAId, teamBId, news);
  return (
    <div className="rounded border border-lab-border bg-lab-panel2 p-3">
      <p className="text-xs uppercase text-lab-muted">News risk summary</p>
      <div className="mt-2 space-y-1 text-sm text-lab-muted">
        {summary.riskSummary.length ? summary.riskSummary.map((item, index) => (
          <p key={`news-summary-${index}-${item.slice(0, 24)}`}>{item}</p>
        )) : <p>Новостей не найдено.</p>}
      </div>
    </div>
  );
}

export function NewsImpactPanel({ news }: { news: NewsEntity[] }) {
  if (news.length === 0) {
    return (
      <div className="rounded border border-lab-border bg-lab-panel p-4">
        <p className="text-sm text-lab-amber">Новостей/roster events для этого матча пока нет.</p>
      </div>
    );
  }
  const groups = groupNewsForUi(news);

  return (
    <div className="space-y-5">
      {groupLabels.map(([key, label]) => {
        const items = groups[key];
        return (
          <section key={key} className="rounded border border-lab-border bg-lab-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-white">{label}</h3>
              <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">{items.length}</span>
            </div>
            <div className="mt-3 grid gap-3">
              {items.length ? items.map((usage, index) => <NewsCard key={`${key}-${usage.item.id ?? usage.item.title}-${index}`} usage={usage} />) : (
                <p className="text-sm text-lab-muted">Нет записей в этой группе.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NewsCard({ usage }: { usage: NewsUsage }) {
  const item = usage.item;
  return (
    <article className="rounded border border-lab-border bg-lab-panel2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-white">{item.title}</h4>
          <p className="mt-1 text-sm text-lab-muted">{item.summary}</p>
        </div>
        <span className={usage.usedInPrediction ? "rounded border border-lab-green px-2 py-1 text-xs text-lab-green" : "rounded border border-lab-amber px-2 py-1 text-xs text-lab-amber"}>
          {usage.usedInPrediction ? "used in prediction" : `ignored: ${usage.reasonIfNotUsed || "not used"}`}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm text-lab-muted md:grid-cols-4">
        <div><dt className="text-xs uppercase">Source</dt><dd>{item.source}</dd></div>
        <div><dt className="text-xs uppercase">Reliability</dt><dd>{Math.round(usage.confidence * 100)}% · {usage.tier}</dd></div>
        <div><dt className="text-xs uppercase">Event type</dt><dd>{item.eventType}</dd></div>
        <div><dt className="text-xs uppercase">Affected</dt><dd>{item.teamId ?? item.playerId ?? "match/context"}</dd></div>
        <div><dt className="text-xs uppercase">Impact</dt><dd>{usage.clampedImpact.toFixed(2)} clamp ±{usage.maxImpact}</dd></div>
        <div><dt className="text-xs uppercase">Risk</dt><dd>{usage.risk.toFixed(2)}</dd></div>
        <div><dt className="text-xs uppercase">Confirmation</dt><dd>{item.isOfficial ? "official" : item.isConfirmed ? "confirmed" : item.isRumor ? "rumor" : "unconfirmed"}</dd></div>
        <div><dt className="text-xs uppercase">Published</dt><dd>{formatDateTime(item.publishedAt)}</dd></div>
      </dl>
      {item.url ? <a href={item.url} className="mt-3 inline-block text-sm text-lab-cyan" target="_blank" rel="noreferrer">Source URL</a> : null}
    </article>
  );
}
