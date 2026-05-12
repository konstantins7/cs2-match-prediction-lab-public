import { formatDateTime } from "@/lib/format";
import type { NewsEntity } from "@/lib/prediction/types";

export function NewsImpactPanel({ news }: { news: NewsEntity[] }) {
  return (
    <div className="grid gap-3">
      {news.map((item) => (
        <article key={`${item.title}-${item.publishedAt}`} className="rounded border border-lab-border bg-lab-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">{item.title}</h3>
              <p className="mt-1 text-sm text-lab-muted">{item.summary}</p>
            </div>
            <span className={item.isOfficial ? "rounded border border-lab-green px-2 py-1 text-xs text-lab-green" : "rounded border border-lab-amber px-2 py-1 text-xs text-lab-amber"}>
              {item.reliability}
            </span>
          </div>
          <dl className="mt-3 grid gap-2 text-sm text-lab-muted md:grid-cols-4">
            <div><dt className="text-xs uppercase">Type</dt><dd>{item.eventType}</dd></div>
            <div><dt className="text-xs uppercase">Impact</dt><dd>{item.impactScore.toFixed(2)} clamp ±{item.maxAllowedImpact}</dd></div>
            <div><dt className="text-xs uppercase">Sentiment</dt><dd>{item.sentiment}</dd></div>
            <div><dt className="text-xs uppercase">Published</dt><dd>{formatDateTime(item.publishedAt)}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}
