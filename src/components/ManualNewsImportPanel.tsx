"use client";

import { useMemo, useState } from "react";

const templates = {
  manual: {
    sourceName: "Official team site",
    sourceType: "official_team",
    sourceTier: "official",
    url: "",
    title: "Roster update",
    summary: "Short official note",
    publishedAt: "2026-05-13T00:00:00.000Z",
    collectedAt: "2026-05-13T00:00:00.000Z",
    affectedTeam: "Team Name",
    affectedPlayer: "",
    eventType: "roster_change",
    isOfficial: true,
    isRumor: false,
    isConfirmed: true,
    reliabilityScore: 0.9,
    impactDirection: "negative",
    impactScore: -2,
    riskScore: 3,
    expiresAt: "2026-06-13T00:00:00.000Z"
  },
  hltv: {
    sourceName: "HLTV manual reference",
    sourceType: "hltv_manual_reference",
    sourceTier: "media_reference",
    hltvUrl: "https://www.hltv.org/news/...",
    title: "Manual HLTV reference note",
    summary: "Short manually entered summary; no scraping.",
    publishedAt: "2026-05-13T00:00:00.000Z",
    collectedAt: "2026-05-13T00:00:00.000Z",
    affectedTeam: "Team Name",
    affectedPlayer: "",
    eventType: "stand_in",
    isOfficial: false,
    isRumor: false,
    isConfirmed: true,
    reliabilityScore: 0.78,
    impactDirection: "negative",
    impactScore: -2,
    riskScore: 3
  },
  telegram: {
    sourceName: "OverDrive manual note",
    sourceType: "telegram_insider_manual",
    sourceTier: "insider",
    telegramPostUrl: "https://t.me/...",
    handle: "@handle",
    title: "Manual insider signal",
    summary: "Short manually entered summary; no Telegram scraping.",
    publishedAt: "2026-05-13T00:00:00.000Z",
    collectedAt: "2026-05-13T00:00:00.000Z",
    affectedTeam: "Team Name",
    affectedPlayer: "",
    eventType: "transfer_rumor",
    isOfficial: false,
    isRumor: true,
    isConfirmed: false,
    reliabilityScore: 0.55,
    impactDirection: "negative",
    impactScore: -2,
    riskScore: 5
  }
} as const;

type TemplateKey = keyof typeof templates;

export function ManualNewsImportPanel({ defaultMatchId }: { defaultMatchId?: string }) {
  const [template, setTemplate] = useState<TemplateKey>("manual");
  const initial = useMemo(() => JSON.stringify({ ...templates.manual, matchId: defaultMatchId ?? "" }, null, 2), [defaultMatchId]);
  const [payload, setPayload] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("HLTV/Telegram здесь только manual/reference-only. Scraping не используется.");

  function choose(next: TemplateKey) {
    setTemplate(next);
    setPayload(JSON.stringify({ ...templates[next], matchId: defaultMatchId ?? "" }, null, 2));
    setMessage("Шаблон загружен. Проверьте sourceName, дату, reliability и affectedTeam перед импортом.");
  }

  async function apply() {
    setBusy(true);
    setMessage("Импортирую manual news...");
    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "manual_news_import", payload })
      });
      const json = await response.json() as { ok: boolean; error?: string; result?: { recordsFetched?: number; status?: string } };
      setMessage(json.ok ? `Manual news import: ${json.result?.status ?? "done"} · records ${json.result?.recordsFetched ?? 0}.` : json.error ?? "Manual news import failed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Manual news import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded border border-lab-border bg-lab-panel p-4">
      <h2 className="font-semibold text-white">Manual News Import</h2>
      <p className="mt-1 text-sm text-lab-muted">
        Официальные сообщения, HLTV manual reference и Telegram/insider notes вводятся вручную. Массовый scraping HLTV/Telegram запрещён; новости не используются для ML training/fine-tuning.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => choose("manual")} className={buttonClass(template === "manual")}>Official/manual news</button>
        <button type="button" onClick={() => choose("hltv")} className={buttonClass(template === "hltv")}>HLTV manual reference</button>
        <button type="button" onClick={() => choose("telegram")} className={buttonClass(template === "telegram")}>Telegram insider manual</button>
      </div>
      <textarea
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        spellCheck={false}
        className="mt-3 min-h-56 w-full rounded border border-lab-border bg-lab-panel2 p-3 font-mono text-xs text-white outline-none focus:border-lab-cyan"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={apply} className="rounded bg-lab-cyan px-3 py-2 text-sm font-medium text-black disabled:opacity-50">
          Применить manual news
        </button>
        <p className="text-sm text-lab-muted">{message}</p>
      </div>
    </section>
  );
}

function buttonClass(active: boolean) {
  return active
    ? "rounded bg-lab-cyan px-3 py-1.5 text-sm font-medium text-black"
    : "rounded border border-lab-border px-3 py-1.5 text-sm text-lab-muted hover:border-lab-cyan";
}
