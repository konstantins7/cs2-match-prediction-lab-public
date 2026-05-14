import { formatDateTime } from "@/lib/format";
import type { PredictionInput } from "@/lib/predictionEngine";

function yesNo(value: boolean) {
  return value ? "да" : "нет";
}

function localDateTime(value: Date | string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function countdown(value: Date | string) {
  const diffMs = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return "неизвестно";
  if (diffMs <= 0) return "время матча прошло";
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}

export function DataCoveragePanel({ input }: { input: PredictionInput }) {
  const coverage = input.dataCoverage;
  if (!coverage) return null;
  const rows = [
    ["базовые данные матча", coverage.fixtureData],
    ["рейтинг команд", coverage.rankData],
    ["последние матчи команд", coverage.recentMatches],
    ["снимки формы команд", coverage.teamFormSnapshots],
    ["состав игроков", coverage.playerRoster],
    ["статистика игроков", coverage.playerStats],
    ["статистика карт", coverage.mapStats],
    ["история veto", coverage.vetoHistory],
    ["H2H", coverage.h2h],
    ["новости / roster events", coverage.newsOrRosterEvents],
    ["конфликты источников", coverage.sourceConflicts]
  ] as const;

  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Покрытие данных</h2>
          <p className="mt-1 text-sm text-lab-muted">Что уже известно по матчу и какие сигналы пока отсутствуют.</p>
        </div>
        <span className="rounded border border-lab-border px-2 py-1 text-xs uppercase text-lab-muted">{coverage.freshnessStatus}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Info label="Дата матча" value={formatDateTime(input.match.startTime)} />
        <Info label="Локальное время" value={localDateTime(input.match.startTime)} />
        <Info label="До матча" value={countdown(input.match.startTime)} />
        <Info label="Источник данных" value={input.match.sourceMode ?? "unknown"} />
        <Info label="Последний sync PandaScore" value={coverage.lastPandaScoreSyncAt ? formatDateTime(coverage.lastPandaScoreSyncAt) : "никогда"} />
        <Info label="Последний sync рейтингов" value={coverage.lastValveSyncAt ? formatDateTime(coverage.lastValveSyncAt) : "никогда"} />
        <Info label="Последний sync CS2 updates" value={coverage.lastCsUpdatesSyncAt ? formatDateTime(coverage.lastCsUpdatesSyncAt) : "никогда"} />
        <Info label="Прогноз пересчитан" value={coverage.lastPredictionCalculatedAt ? formatDateTime(coverage.lastPredictionCalculatedAt) : "не сохранён"} />
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded border border-lab-border bg-lab-panel2 px-3 py-2 text-sm">
            <span className="text-lab-muted">{label}</span>
            <span className={value ? "text-lab-green" : "text-lab-amber"}>{yesNo(value)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <List title="Что известно" items={coverage.known} tone="green" />
        <List title="Чего не хватает" items={coverage.missing} tone="amber" />
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel2 p-3">
      <p className="text-xs uppercase text-lab-muted">{label}</p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: "green" | "amber" }) {
  return (
    <div className="rounded border border-lab-border bg-lab-panel2 p-3">
      <h3 className={tone === "green" ? "font-medium text-lab-green" : "font-medium text-lab-amber"}>{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-lab-muted">
        {items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>Нет данных.</li>}
      </ul>
    </div>
  );
}
