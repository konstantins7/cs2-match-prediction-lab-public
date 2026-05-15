"use client";

import { useMemo, useState } from "react";
import { manualEnrichmentTemplates } from "@/lib/manualEnrichmentTemplates";
import { coachManualPayload } from "@/lib/dataQualityCoach";
import { getPlaybookEntry, type AcquisitionDataType } from "@/lib/dataAcquisitionPlaybook";
import type { ResearchTask } from "@/lib/researchQueueCore";
import type { DataDepth } from "@/lib/ui/forecastUx";

const manualTemplateLabels: Array<[keyof typeof manualEnrichmentTemplates, string]> = [
  ["manual_real_pack", "Ручной data pack"],
  ["roster", "Состав JSON"],
  ["player_stats", "Статистика игроков JSON"],
  ["map_stats", "Карты JSON"],
  ["veto_history", "Veto JSON"],
  ["h2h", "H2H JSON"],
  ["news", "Новости / roster JSON"],
  ["parsed_demo", "Parsed Demo JSON"]
];

type MatchOption = {
  matchId: string;
  label: string;
  teamAName?: string;
  teamBName?: string;
  startTime?: string | Date;
  readinessLevel?: string;
  realForecastReady?: boolean;
  sourceLevel?: string;
  previewDataDepth?: DataDepth;
  realDataDepth?: DataDepth;
  missingBlocks?: string[];
  tasks: ResearchTask[];
};

const activeMapPool = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];

const builderSteps = [
  ["roster", "Шаг 1 — Добавьте составы", "состав -> открывает путь к L2/L3", "Bind roster"],
  ["player_stats", "Шаг 2 — Добавьте статистику игроков", "состав + player stats -> L2 strong / L3 weak", "Import player stats"],
  ["map_stats", "Шаг 3 — Добавьте map stats", "карты -> L3 partial, veto нужен для полного real forecast gate", "Import map stats"],
  ["veto_history", "Шаг 4 — Добавьте veto history", "veto history закрывает обязательный map/veto слой", "Import veto history"],
  ["h2h", "Шаг 5 — Добавьте H2H", "H2H добавляет matchup context, но не является hard blocker", "Add H2H"],
  ["news", "Шаг 6 — Добавьте новости / roster events", "новости улучшают объяснение риска и уверенности", "Add news/roster events"],
  ["final", "Шаг 7 — Проверить и применить", "Проверить -> применить -> snapshots -> predictions -> readiness before/after", "Recalculate predictions"]
] as const;

const sourceHints: Record<string, string> = {
  roster: "Где взять: LiquipediaDB, official team page, manual source.",
  player_stats: "Где взять: parsed demo, FACEIT, GRID, manual analyst sheet.",
  map_stats: "Где взять: parsed demo, GRID, manual history. Заполните map stats и veto history в pack.",
  veto_history: "Где взять: parsed demo, GRID, manual history.",
  h2h: "Где взять: PandaScore past, manual history, Liquipedia if available.",
  news: "Где взять: official announcements, HLTV manual reference, Telegram insider manual note.",
  final: "Проверка не создаёт records. Readiness меняется только после валидного apply."
};

const stepPlaybookType: Record<string, AcquisitionDataType> = {
  roster: "roster",
  player_stats: "player_stats",
  map_stats: "map_veto",
  h2h: "h2h",
  news: "news",
  final: "round_economy"
};

export function ManualEnrichmentPanel({ defaultMatchId, initialTemplate = "manual_real_pack", analystSampleEnabled = false, matchOptions = [] }: { defaultMatchId?: string; initialTemplate?: keyof typeof manualEnrichmentTemplates; analystSampleEnabled?: boolean; matchOptions?: MatchOption[] }) {
  const [selectedMatchId, setSelectedMatchId] = useState(defaultMatchId ?? "pandascore_match_1474573");
  const [template, setTemplate] = useState<keyof typeof manualEnrichmentTemplates>(initialTemplate);
  const selectedOption = matchOptions.find((option) => option.matchId === selectedMatchId);
  const initial = useMemo(() => buildPayload(initialTemplate, selectedMatchId, selectedOption), [initialTemplate, selectedMatchId, selectedOption]);
  const [payload, setPayload] = useState(initial);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const isSampleTemplate = template === "analyst_pack";
  const resultRecord = result && typeof result === "object" ? result as Record<string, unknown> : null;
  const blockStatuses = Array.isArray(resultRecord?.blockStatuses) ? resultRecord.blockStatuses as Array<Record<string, unknown>> : [];
  const payloadRecord = useMemo(() => {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [payload]);
  const metadata = (payloadRecord.metadata && typeof payloadRecord.metadata === "object" ? payloadRecord.metadata : payloadRecord) as Record<string, unknown>;
  const before = resultRecord?.before && typeof resultRecord.before === "object" ? resultRecord.before as Record<string, unknown> : null;
  const afterPreview = resultRecord?.afterPreview && typeof resultRecord.afterPreview === "object" ? resultRecord.afterPreview as Record<string, unknown> : null;
  const after = resultRecord?.after && typeof resultRecord.after === "object" ? resultRecord.after as Record<string, unknown> : null;
  const selectedStart = selectedOption?.startTime ? new Date(selectedOption.startTime) : null;
  const retrospective = selectedStart ? selectedStart.getTime() < Date.now() : null;
  const coachWarnings = useMemo(() => coachManualPayload(payloadRecord), [payloadRecord]);
  const validationCoachWarnings = blockStatuses.flatMap((status) => [
    ...(Array.isArray(status.warnings) ? status.warnings.map(String) : []),
    ...(Array.isArray(status.errors) ? status.errors.map(String) : [])
  ]);

  function chooseTemplate(next: keyof typeof manualEnrichmentTemplates) {
    setTemplate(next);
    setPayload(buildPayload(next, selectedMatchId, selectedOption));
    setResult(null);
  }

  function chooseMatch(next: string) {
    setSelectedMatchId(next);
    const nextOption = matchOptions.find((option) => option.matchId === next);
    setPayload(buildPayload(template, next, nextOption));
    setResult(null);
  }

  async function send(endpoint: "validate" | "apply") {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(`/api/admin/manual-enrichment/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload })
      });
      const json = await response.json();
      setResult(json);
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Request failed."] });
    } finally {
      setLoading(false);
    }
  }

  async function resetSample() {
    if (!selectedMatchId) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/manual-enrichment/reset-sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: selectedMatchId })
      });
      setResult(await response.json());
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Reset failed."] });
    } finally {
      setLoading(false);
    }
  }

  async function resetManual() {
    if (!selectedMatchId) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/manual-enrichment/reset-manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: selectedMatchId })
      });
      setResult(await response.json());
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Reset manual_real failed."] });
    } finally {
      setLoading(false);
    }
  }

  async function exportManual() {
    if (!selectedMatchId) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/manual-enrichment/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: selectedMatchId })
      });
      const json = await response.json();
      setResult(json);
      if (json?.pack) setPayload(JSON.stringify(json.pack, null, 2));
    } catch (error) {
      setResult({ ok: false, errors: [error instanceof Error ? error.message : "Export failed."] });
    } finally {
      setLoading(false);
    }
  }

  function stepStatus(step: (typeof builderSteps)[number]) {
    if (step[0] === "final") {
      if (resultRecord?.applied) return "applied";
      if (resultRecord?.ok === false) return "invalid";
      return "missing";
    }
    const preview = blockStatuses.find((status) => status.block === step[0]);
    if (preview?.status) return String(preview.status);
    const task = selectedOption?.tasks.find((item) => item.task === step[3]);
    if (task?.status === "done") return "applied";
    if (task?.status === "blocked") return "needs_review";
    return "missing";
  }

  function stepPreview(step: (typeof builderSteps)[number]) {
    return blockStatuses.find((status) => status.block === step[0]);
  }

  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <div>
        <h2 className="font-semibold text-white">Собрать первый реальный прогноз</h2>
        <p className="mt-1 text-sm text-lab-muted">
          Workflow для validated manual_real pack: проходите шаги, проверяйте качество блока, затем нажимайте “Применить”. “Проверить” показывает before/after preview без изменения БД. Пустой template, sample и данные после cutoff не становятся real forecast.
        </p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_2fr]">
        <label className="text-sm text-lab-muted">
          Выбранный матч
          <select
            value={selectedMatchId}
            onChange={(event) => chooseMatch(event.target.value)}
            className="mt-1 w-full rounded border border-lab-border bg-lab-panel2 px-3 py-2 text-white outline-none focus:border-lab-cyan"
          >
            {matchOptions.length ? matchOptions.map((option) => (
              <option key={option.matchId} value={option.matchId}>{option.label}</option>
            )) : <option value={selectedMatchId}>{selectedMatchId}</option>}
          </select>
        </label>
        <div className="rounded border border-lab-cyan/30 bg-lab-panel2 p-3 text-sm text-lab-muted">
          <h3 className="font-semibold text-white">Статус выбранного матча</h3>
          <dl className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <div><dt className="text-xs uppercase text-lab-muted">matchId</dt><dd className="text-white">{selectedMatchId}</dd></div>
            <div><dt className="text-xs uppercase text-lab-muted">startTime</dt><dd className="text-white">{selectedStart ? selectedStart.toISOString() : "unknown"}</dd></div>
            <div><dt className="text-xs uppercase text-lab-muted">режим</dt><dd className={retrospective ? "text-lab-amber" : "text-lab-green"}>{retrospective === null ? "unknown" : retrospective ? "retrospective/backtest reconstruction" : "future pre-match forecast"}</dd></div>
            <div><dt className="text-xs uppercase text-lab-muted">readiness</dt><dd className="text-white">{selectedOption?.readinessLevel ?? String(before?.readiness ?? "нажмите Проверить")}</dd></div>
            <div><dt className="text-xs uppercase text-lab-muted">Real Forecast Ready</dt><dd className={selectedOption?.realForecastReady || before?.realForecastReady ? "text-lab-green" : "text-lab-amber"}>{String(selectedOption?.realForecastReady ?? before?.realForecastReady ?? false)}</dd></div>
            <div><dt className="text-xs uppercase text-lab-muted">sourceLevel</dt><dd className="text-white">{selectedOption?.sourceLevel ?? "unknown"}</dd></div>
            <div><dt className="text-xs uppercase text-lab-muted">Preview Data Depth</dt><dd className="text-white">{selectedOption?.previewDataDepth ? `${selectedOption.previewDataDepth.level}/5 · ${selectedOption.previewDataDepth.label}` : before?.previewDataDepth && typeof before.previewDataDepth === "object" ? `${String((before.previewDataDepth as Record<string, unknown>).level)}/5 · ${String((before.previewDataDepth as Record<string, unknown>).label)}` : "нажмите Проверить"}</dd></div>
            <div><dt className="text-xs uppercase text-lab-muted">Real Data Depth</dt><dd className="text-white">{selectedOption?.realDataDepth ? `${selectedOption.realDataDepth.level}/5 · ${selectedOption.realDataDepth.label}` : before?.realDataDepth && typeof before.realDataDepth === "object" ? `${String((before.realDataDepth as Record<string, unknown>).level)}/5 · ${String((before.realDataDepth as Record<string, unknown>).label)}` : "нажмите Проверить"}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-lab-muted">Для retrospective match данные могут быть pre-match evidence только если sourceDate/collectedAt не позже startTime.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {builderSteps.map((step) => {
            const preview = stepPreview(step);
            const status = stepStatus(step);
            const playbook = getPlaybookEntry(stepPlaybookType[step[0]]);
            return (
            <div key={step[0]} className="rounded border border-lab-border bg-lab-panel2 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-white">{step[1]}</p>
                <span className={statusClass(status)}>{status}</span>
              </div>
              <p className="mt-2 text-xs text-lab-muted">{step[2]}</p>
              <p className="mt-2 text-xs text-lab-cyan">{sourceHints[step[0]]}</p>
              <div className="mt-2 rounded border border-lab-border bg-lab-panel p-2 text-xs text-lab-muted">
                <p>Где взять: {playbook.sources.join(" · ")}</p>
                <p>Насколько сложно: {playbook.difficulty}</p>
                <p>Что даст: {playbook.whyItMatters}</p>
                <p>Можно автоматически: {playbook.canAutomate}</p>
                <p>Нужен API key: {playbook.requiresApiKey ? "да / или parsed demo" : "нет"}</p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-lab-muted">
                <dt>Источник данных</dt><dd className="text-white">{String(resultRecord?.sourceMode ?? (template === "analyst_pack" ? "analyst_sample" : "manual_real"))}</dd>
                <dt>sourceName</dt><dd className="text-white">{String(metadata.sourceName ?? "missing") || "missing"}</dd>
                <dt>collectedAt</dt><dd className="text-white">{String(metadata.collectedAt ?? "missing")}</dd>
                <dt>sampleSize</dt><dd className="text-white">{String(metadata.sampleSize ?? "missing")}</dd>
                <dt>confidence</dt><dd className="text-white">{String(metadata.confidence ?? "missing")}</dd>
                <dt>Используется в прогнозе</dt><dd className="text-white">{status === "applied" || status === "valid" ? "да после применения" : "нет"}</dd>
                <dt>Почему не используется</dt><dd className="text-white">{status === "missing" ? "нет данных" : status === "invalid" ? "проверка не прошла" : "-"}</dd>
                <dt>Качество блока</dt><dd className="text-white">{preview?.quality !== undefined ? `${Math.round(Number(preview.quality) * 100)}/100` : step[0] === "final" && resultRecord?.manualRealPackQuality && typeof resultRecord.manualRealPackQuality === "object" ? `${String((resultRecord.manualRealPackQuality as Record<string, unknown>).score)}/100` : "n/a"}</dd>
              </dl>
              {step[0] !== "final" ? (
                <button type="button" onClick={() => chooseTemplate(step[0] as keyof typeof manualEnrichmentTemplates)} className="mt-3 rounded border border-lab-border px-3 py-1.5 text-xs text-lab-cyan hover:border-lab-cyan">
                  Открыть шаблон шага
                </button>
              ) : null}
            </div>
          );})}
        </div>
      </div>

      {!analystSampleEnabled ? (
        <p className="mt-3 rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
          Генератор тестовых данных выключен. Установите ENABLE_ANALYST_SAMPLE=true локально, если нужно проверить pipeline на dev-only тестовых данных.
        </p>
      ) : null}

      {isSampleTemplate ? (
        <div className="mt-3 rounded border border-violet-400/50 bg-violet-950/20 p-3 text-sm text-violet-100">
          <strong>SAMPLE DATA:</strong> этот pack match-scoped и исключён из real actionable/backtesting metrics. Он доказывает analyst workflow, но не является реальным прогнозом.
        </div>
      ) : (
        <div className="mt-3 rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
          Ручные реальные данные: вставляйте только проверенные данные. Тестовые и ручные реальные данные не смешиваются без отдельного badge.
        </div>
      )}

      <div className="mt-3 rounded border border-lab-cyan/30 bg-lab-panel2 p-3 text-sm text-lab-muted">
        Черновик data pack: команды и active map pool показаны в wizard, JSON содержит только безопасный skeleton. Заполните реальные числа и source metadata; пустой skeleton не меняет готовность прогноза. Active map pool: {activeMapPool.join(", ")}.
      </div>

      <div className="mt-3 rounded border border-lab-green/50 bg-lab-panel2 p-3 text-sm text-lab-muted">
        <p className="font-medium text-lab-green">Самый сильный бесплатный способ улучшить прогноз — загрузить parsed demo.</p>
        <p className="mt-1">Сейчас доступен parsed_demo JSON. .dem parser будет добавлен позже.</p>
        <button type="button" onClick={() => chooseTemplate("parsed_demo")} className="mt-2 rounded border border-lab-green/60 px-3 py-1.5 text-xs text-lab-green">
          Загрузить parsed demo JSON
        </button>
      </div>

      <div className="mt-3 rounded border border-lab-amber/50 bg-lab-panel2 p-3">
        <h3 className="text-sm font-semibold text-lab-amber">Data Quality Coach</h3>
        <p className="mt-1 text-xs text-lab-muted">Coach предупреждает до Apply: маленькая выборка, нет sourceName, данные устарели, confidence низкий, нет veto/map stats или L3 blocker.</p>
        <ul className="mt-2 space-y-1 text-sm text-lab-muted">
          {[...new Set([...coachWarnings, ...validationCoachWarnings])].slice(0, 8).map((warning, index) => (
            <li key={`coach-${index}-${warning.slice(0, 32)}`}>{warning}</li>
          ))}
          {coachWarnings.length === 0 && validationCoachWarnings.length === 0 ? <li>Критичных предупреждений по текущему payload пока нет.</li> : null}
        </ul>
      </div>

      <details className="mt-3 rounded border border-lab-border bg-lab-panel2 p-3">
        <summary className="cursor-pointer text-sm font-medium text-lab-cyan">Advanced JSON</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {manualTemplateLabels.map(([key, label]) => (
            <button key={key} type="button" onClick={() => chooseTemplate(key)} className={template === key ? "rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black" : "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan"}>
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={!analystSampleEnabled}
            onClick={() => chooseTemplate("analyst_pack")}
            className={template === "analyst_pack" ? "rounded bg-violet-300 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40" : "rounded border border-violet-400/50 px-3 py-1.5 text-sm text-violet-200 hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-40"}
          >
            Создать тестовый analyst pack
          </button>
        </div>
        <textarea
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          spellCheck={false}
          className="mt-3 min-h-[300px] w-full rounded border border-lab-border bg-lab-panel p-3 font-mono text-xs text-white outline-none focus:border-lab-cyan"
        />
        <p className="mt-2 text-xs text-lab-muted">Advanced JSON fallback. Forecast Wizard выше — основной workflow; JSON остаётся для batch import/export и точных analyst packs.</p>
      </details>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={loading} onClick={() => send("validate")} className="rounded border border-lab-cyan px-3 py-2 text-sm text-lab-cyan disabled:opacity-50">
          Проверить
        </button>
        <button type="button" disabled={loading || (isSampleTemplate && !analystSampleEnabled)} onClick={() => send("apply")} className="rounded bg-lab-cyan px-3 py-2 text-sm font-medium text-black disabled:opacity-50">
          {isSampleTemplate ? "Применить тестовый analyst pack" : "Применить ручные реальные данные"}
        </button>
        <button type="button" disabled={loading || !selectedMatchId} onClick={resetManual} className="rounded border border-lab-red/60 px-3 py-2 text-sm text-lab-red disabled:opacity-50">
          Сбросить manual_real для выбранного матча
        </button>
        <button type="button" disabled={loading || !selectedMatchId} onClick={exportManual} className="rounded border border-lab-green/60 px-3 py-2 text-sm text-lab-green disabled:opacity-50">
          Экспорт data pack JSON
        </button>
        <button type="button" disabled={loading || !selectedMatchId} onClick={resetSample} className="rounded border border-violet-400/60 px-3 py-2 text-sm text-violet-200 disabled:opacity-50">
          Сбросить тестовые данные для выбранного матча
        </button>
      </div>
      {(before || afterPreview || after) ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <PreviewCard title="Before" snapshot={before} />
          <PreviewCard title={after ? "After" : "After preview"} snapshot={after ?? afterPreview} />
        </div>
      ) : null}
      {Array.isArray(resultRecord?.whatStillMissing) && resultRecord.whatStillMissing.length ? (
        <div className="mt-3 rounded border border-lab-amber/60 bg-lab-panel2 p-3 text-sm text-lab-amber">
          Что ещё не хватает: {(resultRecord.whatStillMissing as string[]).join(", ")}
        </div>
      ) : null}
      {result ? (
        <pre className="mt-3 max-h-96 overflow-auto rounded border border-lab-border bg-lab-panel2 p-3 text-xs text-lab-muted">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

function buildPayload(template: keyof typeof manualEnrichmentTemplates, matchId?: string, option?: MatchOption) {
  const base = JSON.parse(JSON.stringify(manualEnrichmentTemplates[template])) as Record<string, unknown>;
  const resolvedMatchId = matchId ?? String(base.matchId ?? "pandascore_match_1474573");
  const teamA = option?.teamAName ?? "Team A";
  const teamB = option?.teamBName ?? "Team B";
  base.matchId = resolvedMatchId;
  if (template === "manual_real_pack") {
    base.rosters = { [teamA]: [], [teamB]: [] };
    base.playerStats = [];
    base.mapStats = [];
    base.vetoHistory = [];
  }
  if (template === "roster") base.teams = { [teamA]: [], [teamB]: [] };
  if (template === "map_stats") base.teams = activeMapPool.flatMap((mapName) => [
    { team: teamA, mapName, mapsPlayed: 0, winRate: 0, pickRate: 0, banRate: 0 },
    { team: teamB, mapName, mapsPlayed: 0, winRate: 0, pickRate: 0, banRate: 0 }
  ]);
  if (template === "veto_history") base.teams = activeMapPool.flatMap((mapName) => [
    { team: teamA, mapName, pickRate: 0, banRate: 0, deciderRate: 0, sampleSize: 0 },
    { team: teamB, mapName, pickRate: 0, banRate: 0, deciderRate: 0, sampleSize: 0 }
  ]);
  return JSON.stringify(base, null, 2);
}

function PreviewCard({ title, snapshot }: { title: string; snapshot: Record<string, unknown> | null }) {
  if (!snapshot) {
    return (
      <div className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
        {title}: нажмите “Проверить”, чтобы увидеть preview.
      </div>
    );
  }
  const previewDepth = snapshot.previewDataDepth && typeof snapshot.previewDataDepth === "object" ? snapshot.previewDataDepth as Record<string, unknown> : null;
  const realDepth = snapshot.realDataDepth && typeof snapshot.realDataDepth === "object" ? snapshot.realDataDepth as Record<string, unknown> : null;
  return (
    <div className="rounded border border-lab-border bg-lab-panel2 p-3 text-sm text-lab-muted">
      <h3 className="font-semibold text-white">{title}</h3>
      <dl className="mt-2 grid gap-2 md:grid-cols-2">
        <div><dt className="text-xs uppercase text-lab-muted">readiness</dt><dd className="text-white">{String(snapshot.readiness ?? "unknown")}</dd></div>
        <div><dt className="text-xs uppercase text-lab-muted">Real Forecast Ready</dt><dd className={snapshot.realForecastReady ? "text-lab-green" : "text-lab-amber"}>{String(snapshot.realForecastReady ?? false)}</dd></div>
        <div><dt className="text-xs uppercase text-lab-muted">dataQuality</dt><dd className="text-white">{String(snapshot.dataQuality ?? "unknown")}</dd></div>
        <div><dt className="text-xs uppercase text-lab-muted">confidence</dt><dd className="text-white">{String(snapshot.confidence ?? "unknown")}</dd></div>
        <div><dt className="text-xs uppercase text-lab-muted">Preview Data Depth</dt><dd className="text-white">{previewDepth ? `${String(previewDepth.level)}/5 · ${String(previewDepth.label)}` : "unknown"}</dd></div>
        <div><dt className="text-xs uppercase text-lab-muted">Real Data Depth</dt><dd className="text-white">{realDepth ? `${String(realDepth.level)}/5 · ${String(realDepth.label)}` : "unknown"}</dd></div>
      </dl>
      {Array.isArray(snapshot.missingBlocks) && snapshot.missingBlocks.length ? (
        <p className="mt-2 text-xs text-lab-amber">Осталось: {snapshot.missingBlocks.slice(0, 4).join(", ")}</p>
      ) : null}
    </div>
  );
}

function statusClass(status: string) {
  if (status === "applied" || status === "valid") return "rounded border border-lab-green/60 px-2 py-1 text-xs text-lab-green";
  if (status === "partial") return "rounded border border-lab-amber/60 px-2 py-1 text-xs text-lab-amber";
  if (status === "needs_review" || status === "invalid") return "rounded border border-lab-red/60 px-2 py-1 text-xs text-lab-red";
  return "rounded border border-lab-border px-2 py-1 text-xs text-lab-muted";
}
