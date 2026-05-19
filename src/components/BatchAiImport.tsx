"use client";

import { useMemo, useRef, useState } from "react";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type BatchJob = {
  id: string;
  fileName: string;
  matchId: string;
  teamA: string;
  teamB: string;
  inputText: string;
  selected: boolean;
  status: "queued" | "running" | "success" | "error" | "applied";
  confidence?: number;
  sheets?: number;
  warnings: string[];
  error?: string;
  extractionId?: string;
  sheetPayload?: Array<{ sheetType: string; content: string }>;
};

const maxZipBytes = 50 * 1024 * 1024;
const maxFiles = 50;
const maxChars = 120_000;
const blockedExtensions = /\.(exe|bat|cmd|ps1|sh|js|mjs|cjs|vbs|scr|dll)$/i;
const textExtensions = /\.(txt|html?|md|markdown)$/i;

export function BatchAiImport() {
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [message, setMessage] = useState("");
  const cancelledRef = useRef(false);
  const selectedJobs = useMemo(() => jobs.filter((job) => job.selected && job.status === "success" && job.sheetPayload?.length), [jobs]);

  const runAction = useAsyncAction(async () => {
    cancelledRef.current = false;
    await runQueue();
  }, { actionName: "local_ai_batch_extract" });

  const applyAction = useAsyncAction(async () => {
    for (const job of selectedJobs) {
      if (cancelledRef.current) break;
      await applyJob(job);
    }
  }, { actionName: "local_ai_batch_apply" });

  async function loadFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    const expanded: BatchJob[] = [];
    for (const file of incoming) {
      if (file.size > maxZipBytes) {
        setMessage(`${file.name}: file is larger than 50 MB.`);
        continue;
      }
      if (blockedExtensions.test(file.name)) {
        setMessage(`${file.name}: executable/script files are rejected.`);
        continue;
      }
      if (/\.zip$/i.test(file.name)) {
        expanded.push(...await jobsFromZip(file));
      } else if (/\.json$/i.test(file.name)) {
        expanded.push(...jobsFromJson(await file.text(), file.name));
      } else if (textExtensions.test(file.name)) {
        expanded.push(jobFromText(file.name, await file.text()));
      } else {
        setMessage(`${file.name}: unsupported file type.`);
      }
    }
    setJobs((current) => [...current, ...expanded].slice(0, maxFiles));
  }

  async function jobsFromZip(file: File) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    if (entries.length > maxFiles) setMessage(`ZIP has ${entries.length} files; only first ${maxFiles} text files are used.`);
    const output: BatchJob[] = [];
    for (const entry of entries.slice(0, maxFiles)) {
      if (blockedExtensions.test(entry.name) || !textExtensions.test(entry.name)) continue;
      output.push(jobFromText(entry.name, await entry.async("text")));
    }
    return output;
  }

  function jobsFromJson(text: string, fileName: string) {
    const parsed = JSON.parse(text) as Array<{ matchId?: string; teamA?: string; teamB?: string; inputText?: string; sourceHint?: string }>;
    if (!Array.isArray(parsed)) throw new Error(`${fileName}: expected JSON array.`);
    return parsed.slice(0, maxFiles).map((item, index) => ({
      id: `${Date.now()}-${index}-${item.matchId || fileName}`,
      fileName: item.sourceHint || `${fileName}#${index + 1}`,
      matchId: item.matchId || "",
      teamA: item.teamA || "",
      teamB: item.teamB || "",
      inputText: (item.inputText || "").slice(0, maxChars),
      selected: true,
      status: "queued" as const,
      warnings: []
    }));
  }

  function jobFromText(fileName: string, text: string): BatchJob {
    const base = fileName.replace(/\.[^.]+$/, "");
    const teams = base.match(/(.+?)_?vs_?(.+)/i);
    const match = base.match(/(pandascore_match_[a-z0-9_-]+)/i);
    return {
      id: `${Date.now()}-${fileName}-${Math.random().toString(36).slice(2)}`,
      fileName,
      matchId: match?.[1] || "",
      teamA: teams?.[1]?.replace(/[_-]+/g, " ").trim() || "",
      teamB: teams?.[2]?.replace(/[_-]+/g, " ").trim() || "",
      inputText: text.slice(0, maxChars),
      selected: true,
      status: "queued",
      warnings: text.length > maxChars ? [`Trimmed to ${maxChars} characters.`] : []
    };
  }

  async function runQueue() {
    const queue = jobs.filter((job) => job.status === "queued");
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length && !cancelledRef.current) {
        const job = queue[cursor++];
        await extractJob(job);
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
  }

  async function extractJob(job: BatchJob) {
    updateJob(job.id, { status: "running", error: undefined });
    if (!job.matchId || !job.teamA || !job.teamB || !job.inputText.trim()) {
      updateJob(job.id, { status: "error", error: "matchId, teamA, teamB and text are required." });
      return;
    }
    try {
      const response = await fetch("/api/ai/extract-local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: job.matchId, teamA: job.teamA, teamB: job.teamB, inputText: job.inputText, sourceHint: job.fileName })
      });
      const json = await response.json() as {
        ok?: boolean;
        extractionId?: string;
        confidence?: number;
        warnings?: string[];
        sheets?: Array<{ sheetType: string; content: string }>;
        errors?: string[];
      };
      updateJob(job.id, {
        status: json.ok ? "success" : "error",
        confidence: json.confidence,
        sheets: json.sheets?.length ?? 0,
        warnings: json.warnings ?? [],
        error: json.ok ? undefined : (json.errors ?? ["Extraction failed."]).join("; "),
        extractionId: json.extractionId,
        sheetPayload: json.sheets
      });
    } catch (error) {
      updateJob(job.id, { status: "error", error: error instanceof Error ? error.message : "Extraction failed." });
    }
  }

  async function applyJob(job: BatchJob) {
    updateJob(job.id, { status: "running" });
    const response = await fetch("/api/ai/apply-local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId: job.matchId, extractionId: job.extractionId, sheets: job.sheetPayload })
    });
    const json = await response.json() as { ok?: boolean; errors?: string[] };
    updateJob(job.id, { status: json.ok ? "applied" : "error", error: json.ok ? undefined : (json.errors ?? ["Apply failed."]).join("; ") });
  }

  function updateJob(id: string, patch: Partial<BatchJob>) {
    setJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job));
  }

  function cancel() {
    cancelledRef.current = true;
    setMessage("Batch processing cancelled. Running request may finish, queued work will stop.");
  }

  return (
    <section className="rounded border border-lab-border bg-lab-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-lab-cyan">Local AI batch</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Batch AI import</h1>
          <p className="mt-2 max-w-3xl text-sm text-lab-muted">
            ZIP распаковывается в браузере через JSZip. Сервер получает только текстовые задания и применяет только выбранные валидные результаты.
          </p>
        </div>
        <label className="cursor-pointer rounded border border-lab-cyan/50 px-3 py-2 text-sm text-lab-cyan hover:border-lab-cyan">
          Upload ZIP/text/JSON
          <input type="file" multiple accept=".zip,.txt,.html,.htm,.md,.markdown,.json" className="hidden" onChange={(event) => void loadFiles(event.target.files ?? [])} />
        </label>
      </div>
      {message ? <p className="mt-3 text-sm text-lab-amber">{message}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={runAction.isLoading || jobs.length === 0} onClick={() => void runAction.execute()} className="rounded bg-lab-cyan px-3 py-2 text-sm font-semibold text-black disabled:opacity-50">
          {runAction.isLoading ? "Распознаём..." : "Запустить распознавание"}
        </button>
        <button type="button" disabled={applyAction.isLoading || selectedJobs.length === 0} onClick={() => void applyAction.execute()} className="rounded border border-lab-green/60 px-3 py-2 text-sm font-semibold text-lab-green disabled:opacity-50">
          {applyAction.isLoading ? "Применяем..." : `Apply selected (${selectedJobs.length})`}
        </button>
        <button type="button" onClick={cancel} className="rounded border border-lab-border px-3 py-2 text-sm text-lab-muted">Отмена</button>
      </div>
      <div className="mt-4 overflow-x-auto rounded border border-lab-border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-lab-panel2 uppercase text-lab-muted">
            <tr><th className="p-2">Use</th><th>File</th><th>Match</th><th>Teams</th><th>Status</th><th>Confidence</th><th>Sheets</th><th>Warnings / Error</th></tr>
          </thead>
          <tbody className="divide-y divide-lab-border">
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="p-2"><input type="checkbox" checked={job.selected} onChange={(event) => updateJob(job.id, { selected: event.target.checked })} /></td>
                <td className="p-2 text-white">{job.fileName}</td>
                <td className="p-2"><input value={job.matchId} onChange={(event) => updateJob(job.id, { matchId: event.target.value })} className="w-44 rounded border border-lab-border bg-black/20 px-2 py-1 text-white" /></td>
                <td className="p-2">
                  <input value={job.teamA} onChange={(event) => updateJob(job.id, { teamA: event.target.value })} className="w-32 rounded border border-lab-border bg-black/20 px-2 py-1 text-white" />
                  <span className="px-1 text-lab-muted">vs</span>
                  <input value={job.teamB} onChange={(event) => updateJob(job.id, { teamB: event.target.value })} className="w-32 rounded border border-lab-border bg-black/20 px-2 py-1 text-white" />
                </td>
                <td className="p-2">{job.status}</td>
                <td className="p-2">{job.confidence ?? ""}</td>
                <td className="p-2">{job.sheets ?? ""}</td>
                <td className={job.error ? "p-2 text-lab-red" : "p-2 text-lab-amber"}>{job.error || job.warnings.slice(0, 3).join("; ")}</td>
              </tr>
            ))}
            {!jobs.length ? <tr><td colSpan={8} className="p-4 text-lab-muted">Загрузите ZIP, несколько текстовых файлов или JSON array.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
