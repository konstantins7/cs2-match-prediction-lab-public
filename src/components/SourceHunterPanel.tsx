import { getSourceHunterRecommendations, type SourceHunterRecommendation } from "@/lib/sourceHunter";

export function SourceHunterPanel({ compact = false }: { compact?: boolean }) {
  const recommendations = getSourceHunterRecommendations();
  return (
    <section id="source-hunter" className={compact ? "rounded border border-lab-cyan/30 bg-lab-panel p-4" : "rounded-2xl border border-lab-cyan/35 bg-lab-panel/85 p-4 shadow-[0_0_36px_rgba(56,189,248,0.08)]"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Где взять недостающие данные</h2>
          <p className="mt-1 text-sm text-lab-muted">
            Source Hunter показывает легальные пути: автоматический источник, бесплатный upload/tool path и ручной вариант. Новых парсеров и scraping здесь нет.
          </p>
        </div>
        <span className="rounded-full border border-lab-cyan/35 bg-lab-cyan/10 px-3 py-1 text-xs font-medium text-lab-cyan">JSON-first</span>
      </div>
      <div className={compact ? "mt-4 grid gap-3 md:grid-cols-2" : "mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
        {recommendations.map((item) => (
          <SourceHunterCard key={item.dataType} item={item} compact={compact} />
        ))}
      </div>
    </section>
  );
}

function SourceHunterCard({ item, compact }: { item: SourceHunterRecommendation; compact: boolean }) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-white">{item.label}</h3>
        <span className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">сложность: {item.difficulty}</span>
      </div>
      <dl className="mt-3 space-y-2 text-sm text-lab-muted">
        <div>
          <dt className="text-xs uppercase text-lab-muted">Лучший автоматический источник</dt>
          <dd className="text-white">{item.bestAutomaticSource}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-lab-muted">Лучший бесплатный upload/tool path</dt>
          <dd className="text-white">{item.bestFreeUploadPath}</dd>
        </div>
        {!compact ? (
          <>
            <div>
              <dt className="text-xs uppercase text-lab-muted">Лучший ручной источник</dt>
              <dd className="text-white">{item.bestManualSource}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-lab-muted">Нужен API key</dt>
              <dd className="text-white">{item.requiresApiKey}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt className="text-xs uppercase text-lab-muted">Ожидаемый эффект</dt>
          <dd className="text-white">{item.expectedImpact}</dd>
        </div>
      </dl>
      <a href={item.actionHref} className="mt-3 inline-flex rounded-lg border border-lab-cyan/45 bg-lab-cyan/10 px-3 py-2 text-sm font-medium text-lab-cyan hover:bg-lab-cyan/15">
        {item.actionLabel}
      </a>
    </article>
  );
}
