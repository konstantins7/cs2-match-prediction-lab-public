"use client";

import Link from "next/link";
import { AnalystSheetImportPanel } from "./AnalystSheetImportPanel";
import {
  firstRealForecastOptionalSheets,
  firstRealForecastRequiredSheets,
  firstRealForecastTarget,
  type FirstRealForecastSessionView
} from "@/lib/firstRealForecastSheetSession";
import { analystSheetLabel } from "@/lib/analystSheetTemplates";
import { formatDateTime } from "@/lib/format";

type Props = {
  session: FirstRealForecastSessionView;
  compact?: boolean;
};

export function FirstRealForecastSheetSessionPanel({ session, compact = false }: Props) {
  return (
    <section id="first-real-forecast-sheet-session" className={compact ? "rounded border border-lab-green/35 bg-lab-panel p-4" : "rounded-2xl border border-lab-green/35 bg-lab-panel/90 p-5 shadow-[0_0_32px_rgba(34,197,94,0.08)]"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-green">MVP 0.7.2</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Собрать первый реальный прогноз из analyst sheets</h2>
          <p className="mt-1 max-w-3xl text-sm text-lab-muted">
            Target: {firstRealForecastTarget.matchId} · {firstRealForecastTarget.teamAName} vs {firstRealForecastTarget.teamBName}. Apply разрешён только после valid real CSV/TSV.
          </p>
        </div>
        <span className={session.targetValid ? "rounded-full border border-lab-green/45 bg-lab-green/10 px-3 py-1 text-xs font-medium text-lab-green" : "rounded-full border border-lab-red/45 bg-lab-red/10 px-3 py-1 text-xs font-medium text-lab-red"}>
          {session.targetValid ? "future/upcoming target ok" : "target preflight blocked"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Status title="Матч" value={session.teams} hint={session.matchId} />
        <Status title="Start time" value={formatDateTime(session.startTime)} hint={`${session.status} · ${session.format}`} />
        <Status title="Readiness before" value={session.readinessBefore} hint={session.sourceLevel} />
        <Status title="Real Forecast Ready before" value={session.realForecastReadyBefore ? "yes" : "no"} hint={`Real Data Depth ${session.realDataDepth.level}/5`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <h3 className="font-semibold text-white">Preflight</h3>
          <div className="mt-3 grid gap-2 text-sm text-lab-muted md:grid-cols-2">
            <Check label="matchId default" ok={session.isDefaultTarget} />
            <Check label="startTime future" ok={session.isFuture} />
            <Check label="status upcoming" ok={session.isUpcoming} />
            <Check label="canonical teams WAZABI" ok={session.canonicalTeamsOk} />
          </div>
          {session.blockers.length ? <List title="Blockers" items={session.blockers} tone="text-lab-red" /> : null}
          {!session.targetValid && session.nearestFutureMatches.length ? (
            <div className="mt-3 rounded-lg border border-lab-amber/30 bg-lab-amber/10 p-3">
              <p className="text-sm font-medium text-lab-amber">Ближайшие реальные future matches</p>
              <div className="mt-2 space-y-2 text-sm">
                {session.nearestFutureMatches.map((match) => (
                  <Link key={match.matchId} href={`/match/${match.matchId}`} className="block text-lab-cyan hover:text-cyan-200">
                    {match.teams} · {formatDateTime(match.startTime)} · {match.format}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </article>

        <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <h3 className="font-semibold text-white">Sheets required for first real forecast attempt</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {firstRealForecastRequiredSheets.map((sheet) => (
              <span key={sheet} className="rounded border border-lab-green/35 bg-lab-green/10 px-2 py-1 text-xs text-lab-green">
                {analystSheetLabel(sheet)}
              </span>
            ))}
            {firstRealForecastOptionalSheets.map((sheet) => (
              <span key={sheet} className="rounded border border-lab-border px-2 py-1 text-xs text-lab-muted">
                optional: {analystSheetLabel(sheet)}
              </span>
            ))}
          </div>
          <List title="Exact blockers right now" items={session.missingBlocks.length ? session.missingBlocks : ["Критичных blocker сейчас нет."]} tone="text-lab-muted" />
          <List title="Safety notes" items={session.warnings} tone="text-lab-amber" />
        </article>
      </div>

      {session.targetValid ? (
        <div className="mt-4">
          <AnalystSheetImportPanel defaultMatchId={session.matchId} compact={compact} initialContent="empty" />
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-lab-red/35 bg-lab-red/10 p-3 text-sm text-lab-red">
          Live forecast flow остановлен для этого target. Нужен future/upcoming match, затем real CSV/TSV sheets.
        </div>
      )}
    </section>
  );
}

function Status({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <p className="mt-1 font-medium text-white">{value}</p>
      <p className="mt-1 text-xs text-lab-muted">{hint}</p>
    </div>
  );
}

function Check({ label, ok }: { label: string; ok: boolean }) {
  return <p className={ok ? "text-lab-green" : "text-lab-red"}>{ok ? "✓" : "!"} {label}</p>;
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <ul className={`mt-1 space-y-1 text-sm ${tone}`}>
        {items.slice(0, 8).map((item, index) => <li key={`${title}-${index}-${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}
