"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analystSheetLabel, analystSheetTypes, type AnalystSheetType } from "@/lib/analystSheetTemplates";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type AiSheet = {
  sheetType: AnalystSheetType;
  content: string;
  rows: Array<Record<string, unknown>>;
  validation: {
    isValid?: boolean;
    errors?: string[];
    warnings?: string[];
    rowIssues?: Array<{ rowIndex: number; lineNumber: number; field?: string; severity: "error" | "warning"; message: string }>;
    rowsParsed?: number;
  };
};

type ExtractResult = {
  ok: boolean;
  disabled?: boolean;
  extractionId?: string;
  sourceSite?: string;
  detectedSource?: string;
  promptVersion?: string;
  promptVariant?: string;
  confidence?: number;
  timedApplyEligible?: boolean;
  warnings?: string[];
  sheets?: AiSheet[];
  suggestedNextAction?: string;
  errors?: string[];
};

type ApplyResult = {
  ok?: boolean;
  applied?: boolean;
  errors?: string[];
  warnings?: string[];
  coveredBlocks?: string[];
  missingBlocks?: string[];
  rowsParsed?: number;
};

type AiStatus = {
  enabled?: boolean;
  model?: string;
  fineTunedModel?: string;
  fineTunedAvailable?: boolean;
  autoApplyEnabled?: boolean;
  autoApplyMinConfidence?: number;
  autoApplyDelayMs?: number;
};

type ExtendedEvent = {
  step: string;
  status: "running" | "success" | "warning" | "error";
  message: string;
};

const maxImageBytes = 10 * 1024 * 1024;
const allowedImageTypes = ["image/png", "image/jpeg", "image/webp"];

export function AiDataExtractor({ matchId, teamA, teamB, realForecastReady = false }: { matchId: string; teamA: string; teamB: string; realForecastReady?: boolean }) {
  const router = useRouter();
  const [inputText, setInputText] = useState("");
  const [sourceHint, setSourceHint] = useState("");
  const [selfCheck, setSelfCheck] = useState(false);
  const [promptVariant, setPromptVariant] = useState("default");
  const [useFineTuned, setUseFineTuned] = useState(false);
  const [saveForFineTuning, setSaveForFineTuning] = useState(false);
  const [autoApplyOptIn, setAutoApplyOptIn] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [autoApplyCancelled, setAutoApplyCancelled] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [activeSheet, setActiveSheet] = useState<AnalystSheetType>("roster");
  const [contents, setContents] = useState<Partial<Record<AnalystSheetType, string>>>({});
  const [fileWarning, setFileWarning] = useState("");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [screenshotConsent, setScreenshotConsent] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrWarning, setOcrWarning] = useState("");
  const [gapEvents, setGapEvents] = useState<ExtendedEvent[]>([]);
  const gapSourceRef = useRef<EventSource | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetch("/api/ai/status")
      .then((response) => response.json())
      .then((json: AiStatus) => setAiStatus(json))
      .catch(() => setAiStatus(null));
  }, []);

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    gapSourceRef.current?.close();
    if (countdownRef.current) clearTimeout(countdownRef.current);
  }, [imagePreview]);

  const extractAction = useAsyncAction(async () => {
    setApplyResult(null);
    setCountdown(null);
    setAutoApplyCancelled(false);
    const response = await fetch("/api/ai/extract-local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchId,
        teamA,
        teamB,
        inputText,
        sourceHint,
        selfCheck,
        promptVariant,
        modelOverride: useFineTuned && aiStatus?.fineTunedAvailable ? aiStatus.fineTunedModel : undefined
      })
    });
    const json = await response.json() as ExtractResult;
    setResult(json);
    const nextContents = Object.fromEntries((json.sheets ?? []).map((sheet) => [sheet.sheetType, sheet.content])) as Partial<Record<AnalystSheetType, string>>;
    setContents(nextContents);
    const firstSheet = (json.sheets ?? [])[0]?.sheetType;
    if (firstSheet) setActiveSheet(firstSheet);
    return json;
  }, { actionName: "local_ai_extract" });

  async function applySheets(autoApply: boolean) {
    const sheets = analystSheetTypes
      .map((sheetType) => ({ sheetType, content: contents[sheetType] ?? "" }))
      .filter((sheet) => sheet.content.trim().length > 0);
    const response = await fetch("/api/ai/apply-local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchId,
        extractionId: result?.extractionId,
        sheets,
        autoApply,
        saveForFineTuning,
        inputText: saveForFineTuning ? inputText : undefined,
        sourceSite: result?.detectedSource ?? result?.sourceSite,
        promptVersion: result?.promptVersion,
        promptVariant: result?.promptVariant
      })
    });
    const json = await response.json() as ApplyResult;
    setApplyResult(json);
    if (json.ok) router.refresh();
    return json;
  }

  const applyAction = useAsyncAction(async () => applySheets(false), { actionName: "local_ai_apply" });
  const timedApplyAction = useAsyncAction(async () => applySheets(true), { actionName: "local_ai_timed_apply" });

  const sheets = useMemo(() => result?.sheets ?? [], [result]);
  const active = sheets.find((sheet) => sheet.sheetType === activeSheet) ?? sheets[0];
  const hardErrors = sheets.flatMap((sheet) => sheet.validation.errors ?? []);
  const currentContent = active ? contents[active.sheetType] ?? active.content : "";
  const missingBlocks = useMemo(() => {
    const present = new Set(sheets.map((sheet) => sheet.sheetType));
    return (["roster", "player_stats", "map_stats", "veto_history"] as AnalystSheetType[]).filter((sheetType) => !present.has(sheetType));
  }, [sheets]);

  useEffect(() => {
    if (countdownRef.current) clearTimeout(countdownRef.current);
    const eligible =
      autoApplyOptIn &&
      aiStatus?.autoApplyEnabled &&
      result?.ok &&
      result.timedApplyEligible &&
      !realForecastReady &&
      hardErrors.length === 0 &&
      !applyResult?.applied &&
      !autoApplyCancelled;
    if (!eligible) {
      setCountdown(null);
      return;
    }
    const delayMs = Number(aiStatus?.autoApplyDelayMs || 5000);
    setCountdown(Math.max(1, Math.ceil(delayMs / 1000)));
  }, [result?.extractionId, autoApplyOptIn, realForecastReady, autoApplyCancelled, aiStatus?.autoApplyEnabled, aiStatus?.autoApplyDelayMs]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      void timedApplyAction.execute();
      return;
    }
    countdownRef.current = setTimeout(() => setCountdown((current) => current === null ? null : current - 1), 1000);
    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, [countdown, timedApplyAction]);

  async function loadFile(file: File | undefined) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (allowedImageTypes.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(lower)) {
      if (file.size > maxImageBytes) {
        setFileWarning("Скриншот слишком большой. Максимум 10 МБ.");
        return;
      }
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setOcrFile(file);
      setImagePreview(URL.createObjectURL(file));
      setSourceHint(file.name);
      setFileWarning("");
      return;
    }
    if (!lower.endsWith(".txt") && !lower.endsWith(".html") && !lower.endsWith(".md")) {
      setFileWarning("Поддерживаются .txt, .html, .md и скриншоты PNG/JPG/WebP.");
      return;
    }
    setFileWarning("");
    setInputText(await file.text());
    setSourceHint(file.name);
  }

  async function runOcr() {
    if (!ocrFile) return;
    if (!screenshotConsent) {
      setOcrWarning("Подтвердите, что скриншот не содержит конфиденциальной информации.");
      return;
    }
    setOcrWarning("");
    setOcrProgress(0);
    const Tesseract = await import("tesseract.js");
    const recognized = await Tesseract.recognize(ocrFile, "eng", {
      logger: (event) => {
        if (typeof event.progress === "number") setOcrProgress(Math.round(event.progress * 100));
      }
    });
    const text = recognized.data.text.trim();
    const confidence = Math.round(recognized.data.confidence ?? 0);
    setInputText(text);
    setOcrProgress(100);
    if (confidence < 50 || text.length < 120) {
      setOcrWarning(`OCR confidence ${confidence}%. Проверьте текст вручную или используйте текстовый импорт.`);
    } else {
      setOcrWarning(`OCR confidence ${confidence}%. Текст можно отредактировать перед AI import.`);
    }
  }

  function cancelTimedApply() {
    setAutoApplyCancelled(true);
    setCountdown(null);
    if (countdownRef.current) clearTimeout(countdownRef.current);
  }

  function fillGaps() {
    gapSourceRef.current?.close();
    setGapEvents([]);
    const params = new URLSearchParams({
      matchId,
      teamA,
      teamB,
      mode: "max",
      includeH2h: "true",
      dryRun: "false",
      focus: missingBlocks.join(",")
    });
    const source = new EventSource(`/api/auto-all-extended?${params.toString()}`);
    gapSourceRef.current = source;
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as ExtendedEvent;
      setGapEvents((current) => [...current, event]);
      if (event.step === "complete" || event.status === "error") {
        source.close();
        gapSourceRef.current = null;
        router.refresh();
      }
    };
    source.onerror = () => {
      setGapEvents((current) => [...current, { step: "connection", status: "error", message: "Research gap-fill SSE closed." }]);
      source.close();
      gapSourceRef.current = null;
    };
  }

  return (
    <section className="rounded border border-lab-cyan/35 bg-lab-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-lab-cyan">Local AI import</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Быстрый AI импорт</h2>
          <p className="mt-1 max-w-3xl text-sm text-lab-muted">
            Вставьте текст/HTML/Markdown или распознайте скриншот в браузере. Ollama работает локально, Apply остаётся через проверенный analyst-sheet путь.
          </p>
        </div>
        <span className="rounded-full border border-lab-green/35 bg-lab-green/10 px-3 py-1 text-xs font-medium text-lab-green">text + OCR · local only</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <label className="block text-sm text-lab-muted">
            Source hint
            <input
              value={sourceHint}
              onChange={(event) => setSourceHint(event.target.value)}
              placeholder="HLTV copied page, Liquipedia, ESL..."
              className="mt-1 w-full rounded-lg border border-lab-border bg-black/30 px-3 py-2 text-white outline-none focus:border-lab-cyan"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-sm text-lab-muted">
              Prompt
              <select value={promptVariant} onChange={(event) => setPromptVariant(event.target.value)} className="mt-1 w-full rounded-lg border border-lab-border bg-black/30 px-3 py-2 text-white outline-none focus:border-lab-cyan">
                <option value="default">default</option>
                <option value="tables">tables-heavy</option>
                <option value="roster">roster-heavy</option>
              </select>
            </label>
            {aiStatus?.fineTunedAvailable ? (
              <label className="flex items-end gap-2 rounded-lg border border-lab-border bg-black/20 px-3 py-2 text-sm text-lab-muted">
                <input type="checkbox" checked={useFineTuned} onChange={(event) => setUseFineTuned(event.target.checked)} />
                fine-tuned model
              </label>
            ) : (
              <div className="rounded-lg border border-lab-border bg-black/20 px-3 py-2 text-xs text-lab-muted">Fine-tuned model not detected.</div>
            )}
            <label className="flex items-end gap-2 rounded-lg border border-lab-border bg-black/20 px-3 py-2 text-sm text-lab-muted">
              <input type="checkbox" checked={autoApplyOptIn} disabled={!aiStatus?.autoApplyEnabled} onChange={(event) => setAutoApplyOptIn(event.target.checked)} />
              timed Apply {aiStatus?.autoApplyEnabled ? `>=${aiStatus.autoApplyMinConfidence ?? 85}` : "disabled"}
            </label>
          </div>
          <div className="rounded-lg border border-lab-border bg-black/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-lg border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">
                Upload text or screenshot
                <input type="file" accept=".txt,.html,.md,text/plain,text/markdown,text/html,image/png,image/jpeg,image/webp" onChange={(event) => void loadFile(event.target.files?.[0])} className="hidden" />
              </label>
              <label className="flex items-center gap-2 text-sm text-lab-muted">
                <input type="checkbox" checked={screenshotConsent} onChange={(event) => setScreenshotConsent(event.target.checked)} />
                screenshot has no confidential data
              </label>
              {ocrFile ? (
                <button type="button" onClick={() => void runOcr()} disabled={!screenshotConsent || ocrProgress > 0 && ocrProgress < 100} className="rounded-lg border border-lab-cyan/45 bg-lab-cyan/10 px-3 py-2 text-sm font-medium text-lab-cyan disabled:opacity-50">
                  {ocrProgress > 0 && ocrProgress < 100 ? `OCR ${ocrProgress}%` : "Распознать текст OCR"}
                </button>
              ) : null}
            </div>
            {imagePreview ? <img src={imagePreview} alt="Screenshot preview" className="mt-3 max-h-56 rounded border border-lab-border object-contain" /> : null}
            {ocrWarning ? <p className="mt-2 text-sm text-lab-amber">{ocrWarning}</p> : null}
          </div>
          <label className="block text-sm text-lab-muted">
            Copied text / HTML / Markdown
            <textarea
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              rows={10}
              placeholder="Скопируйте текст страницы матча или статистики и вставьте сюда..."
              className="mt-1 w-full resize-y rounded-lg border border-lab-border bg-black/30 p-3 font-mono text-xs text-white outline-none focus:border-lab-cyan"
              spellCheck={false}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">
              Upload .txt/.html/.md
              <input type="file" accept=".txt,.html,.md,text/plain,text/markdown,text/html,image/png,image/jpeg,image/webp" onChange={(event) => void loadFile(event.target.files?.[0])} className="hidden" />
            </label>
            <label className="flex items-center gap-2 text-sm text-lab-muted">
              <input type="checkbox" checked={selfCheck} onChange={(event) => setSelfCheck(event.target.checked)} />
              self-check pass
            </label>
            <label className="flex items-center gap-2 text-sm text-lab-muted">
              <input type="checkbox" checked={saveForFineTuning} onChange={(event) => setSaveForFineTuning(event.target.checked)} />
              save accepted example
            </label>
            <button
              type="button"
              onClick={() => void extractAction.execute()}
              disabled={extractAction.isLoading || inputText.trim().length === 0}
              className="rounded-lg border border-lab-cyan/45 bg-lab-cyan/10 px-3 py-2 text-sm font-medium text-lab-cyan disabled:opacity-50"
            >
              {extractAction.isLoading ? "Распознаём..." : "Распознать локально"}
            </button>
            {sheets.length ? (
              <button
                type="button"
                onClick={() => void applyAction.execute()}
                disabled={applyAction.isLoading || hardErrors.length > 0}
                className="rounded-lg border border-lab-green/45 bg-lab-green/10 px-3 py-2 text-sm font-medium text-lab-green disabled:opacity-50"
              >
                {applyAction.isLoading ? "Применяем..." : "Применить распознанные данные"}
              </button>
            ) : null}
          </div>
          {fileWarning ? <p className="text-sm text-lab-amber">{fileWarning}</p> : null}
          {extractAction.isLoading ? <p className="text-sm text-lab-muted">Обычно локальная 3B модель отвечает за 5-20 секунд на CPU.</p> : null}
          {countdown !== null ? (
            <div className="rounded border border-lab-amber/60 bg-lab-amber/10 p-3 text-sm text-lab-amber">
              Данные будут применены через {countdown} сек. Это обычный Apply через проверенный endpoint.
              <button type="button" onClick={cancelTimedApply} className="ml-3 rounded border border-lab-amber px-2 py-1 text-xs">Отмена</button>
            </div>
          ) : autoApplyCancelled ? <p className="text-sm text-lab-muted">Авто-применение отменено. Можно нажать Apply вручную.</p> : null}
          {realForecastReady && autoApplyOptIn ? <p className="text-sm text-lab-muted">Timed Apply отключён: матч уже Real Forecast Ready.</p> : null}
        </div>

        <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-lab-muted">
          <h3 className="font-semibold text-white">Как получить лучший результат</h3>
          <ul className="mt-2 space-y-2">
            <li>Скопируйте весь блок страницы: roster, stats, maps, veto.</li>
            <li>Не вставляйте API keys или приватные данные.</li>
            <li>OCR экспериментальный: всегда проверьте распознанный текст.</li>
            <li>AI не должен выдумывать пропуски: пустые таблицы лучше fake rows.</li>
          </ul>
        </aside>
      </div>

      {result ? (
        <div className={`mt-4 rounded-xl border p-3 ${result.ok ? "border-lab-green/35 bg-lab-green/10" : "border-lab-amber/35 bg-lab-amber/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-white">{result.disabled ? "Local AI disabled" : "AI extraction preview"}</h3>
            <span className="rounded border border-white/10 px-2 py-1 text-xs text-lab-muted">
              {result.detectedSource ?? result.sourceSite ?? "unknown"} · {result.promptVersion ?? "prompt"} · confidence {Math.round(result.confidence ?? 0)}
            </span>
          </div>
          <IssueList title="Errors" items={result.errors ?? hardErrors} tone="text-lab-red" />
          <IssueList title="Warnings" items={[...(result.warnings ?? []), ...(result.suggestedNextAction ? [result.suggestedNextAction] : [])]} tone="text-lab-amber" />

          {sheets.length ? (
            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                {sheets.map((sheet) => (
                  <button
                    key={sheet.sheetType}
                    type="button"
                    onClick={() => setActiveSheet(sheet.sheetType)}
                    className={active?.sheetType === sheet.sheetType ? "rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black" : "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan"}
                  >
                    {analystSheetLabel(sheet.sheetType)} ({sheet.validation.rowsParsed ?? sheet.rows.length})
                  </button>
                ))}
              </div>
              {active ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <EditableCsvTable
                    content={currentContent}
                    onChange={(content) => setContents((current) => ({ ...current, [active.sheetType]: content }))}
                    issues={active.validation.rowIssues ?? []}
                  />
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <h4 className="font-semibold text-white">{analystSheetLabel(active.sheetType)}</h4>
                    <IssueList title="Sheet errors" items={active.validation.errors ?? []} tone="text-lab-red" />
                    <IssueList title="Sheet warnings" items={active.validation.warnings ?? []} tone="text-lab-amber" />
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(currentContent)}
                      className="mt-3 rounded border border-lab-border px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan"
                    >
                      Скопировать CSV
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {missingBlocks.length ? (
            <div className="mt-4 rounded border border-lab-border bg-black/20 p-3">
              <p className="text-sm text-lab-muted">Не хватает блоков: {missingBlocks.map((sheetType) => analystSheetLabel(sheetType)).join(", ")}.</p>
              <button type="button" onClick={fillGaps} className="mt-2 rounded border border-lab-amber/60 px-3 py-2 text-sm text-lab-amber hover:border-lab-amber">
                Дополнить AI данными
              </button>
              {gapEvents.length ? (
                <div className="mt-2 max-h-32 overflow-y-auto rounded border border-lab-border bg-lab-panel2 p-2 text-xs text-lab-muted">
                  {gapEvents.slice(-8).map((event, index) => <p key={`${event.step}-${index}`}>{event.step}: {event.message}</p>)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {applyResult ? (
        <div className={`mt-4 rounded-xl border p-3 ${applyResult.ok ? "border-lab-green/35 bg-lab-green/10" : "border-lab-red/35 bg-lab-red/10"}`}>
          <h3 className="font-semibold text-white">{applyResult.applied ? "Apply complete" : "Apply result"}</h3>
          <p className="mt-1 text-sm text-lab-muted">
            Rows: {applyResult.rowsParsed ?? 0}. Covered: {(applyResult.coveredBlocks ?? []).join(", ") || "none"}. Missing: {(applyResult.missingBlocks ?? []).join(", ") || "none"}.
          </p>
          <IssueList title="Errors" items={applyResult.errors ?? []} tone="text-lab-red" />
          <IssueList title="Warnings" items={applyResult.warnings ?? []} tone="text-lab-amber" />
        </div>
      ) : null}
    </section>
  );
}

function EditableCsvTable({ content, onChange, issues }: { content: string; onChange: (content: string) => void; issues: AiSheet["validation"]["rowIssues"] }) {
  const parsed = parseSimpleCsv(content);
  function updateCell(rowIndex: number, columnIndex: number, value: string) {
    const nextRows = parsed.rows.map((row, index) => index === rowIndex ? row.map((cell, cellIndex) => cellIndex === columnIndex ? value : cell) : row);
    onChange(toSimpleCsv(parsed.headers, nextRows));
  }
  if (!parsed.headers.length) {
    return <textarea value={content} onChange={(event) => onChange(event.target.value)} className="min-h-52 w-full rounded-lg border border-lab-border bg-black/30 p-3 font-mono text-xs text-white" />;
  }
  return (
    <div className="max-h-[460px] overflow-auto rounded-lg border border-lab-border bg-black/20">
      <table className="min-w-full text-left text-xs">
        <thead className="sticky top-0 bg-lab-panel2 text-lab-muted">
          <tr>{parsed.headers.map((header) => <th key={header} className="px-2 py-2 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-lab-border">
          {parsed.rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {parsed.headers.map((header, columnIndex) => {
                const issue = issues?.find((entry) => entry.rowIndex === rowIndex && entry.field === header);
                const tone = issue?.severity === "error" ? "border-lab-red/60 bg-lab-red/10" : issue?.severity === "warning" ? "border-lab-amber/60 bg-lab-amber/10" : "border-white/10 bg-black/20";
                return (
                  <td key={`${rowIndex}-${header}`} className="min-w-28 px-1 py-1">
                    <input
                      value={row[columnIndex] ?? ""}
                      title={issue?.message}
                      onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                      className={`w-full rounded border px-2 py-1 text-white outline-none focus:border-lab-cyan ${tone}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssueList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs uppercase text-lab-muted">{title}</p>
      <ul className={`mt-1 space-y-1 text-sm ${tone}`}>
        {items.slice(0, 12).map((item, index) => <li key={`${title}-${index}-${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

function parseSimpleCsv(content: string) {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0] ?? "");
  return {
    headers,
    rows: lines.slice(1).map(splitCsvLine)
  };
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === ",") {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function toSimpleCsv(headers: string[], rows: string[][]) {
  return `${headers.map(escapeCsv).join(",")}\n${rows.map((row) => headers.map((_, index) => escapeCsv(row[index] ?? "")).join(",")).join("\n")}\n`;
}

function escapeCsv(value: string) {
  return value.includes(",") || value.includes("\"") || value.includes("\n") ? `"${value.replace(/"/g, "\"\"")}"` : value;
}
