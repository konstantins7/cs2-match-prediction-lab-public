import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactUrl, type FetchLike, type FetcherEnv } from "../data-fetchers/utils";
import { hltvResearchUserAgent, isResearchEnabled } from "./hltv-client";

export type ArchiveTodayFetchOptions = {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  cacheDir?: string;
  now?: Date;
  sourceFlag?: string;
  maxBytes?: number;
};

export type ArchiveTodayFetchResult = {
  status: "success" | "cached" | "disabled" | "failed";
  url: string;
  body: string;
  warnings: string[];
};

const archiveTtlMs = 7 * 24 * 60 * 60 * 1000;
const archiveHosts = ["archive.today", "archive.is", "archive.ph", "archive.vn", "archive.md"];

export async function fetchViaArchiveToday(originalUrl: string, options: ArchiveTodayFetchOptions = {}): Promise<ArchiveTodayFetchResult> {
  const env = options.env ?? process.env;
  const sourceFlag = options.sourceFlag ?? "ENABLE_ARCHIVE_TODAY_FALLBACK";
  if (!isResearchEnabled(env, sourceFlag)) {
    return { status: "disabled", url: redactUrl(originalUrl), body: "", warnings: [`Research source is disabled: ${sourceFlag}.`] };
  }

  const archiveUrl = `https://archive.today/newest/${encodeURIComponent(originalUrl)}`;
  const cachePath = archiveCachePath(originalUrl, options.cacheDir);
  const cached = await readFreshArchiveCache(cachePath, options.now ?? new Date());
  if (cached) return { status: "cached", url: redactUrl(originalUrl), body: cached, warnings: ["Archive.today cache hit."] };

  try {
    const response = await (options.fetchImpl ?? fetch)(archiveUrl, {
      headers: {
        Accept: "text/html,text/plain,*/*",
        "User-Agent": hltvResearchUserAgent
      },
      redirect: "follow"
    });
    if (!response.ok) {
      return { status: "failed", url: redactUrl(originalUrl), body: "", warnings: [`Archive.today returned HTTP ${response.status}.`] };
    }
    const body = await limitedText(response, options.maxBytes ?? 2_000_000);
    if (!body.trim()) return { status: "failed", url: redactUrl(originalUrl), body: "", warnings: ["Archive.today returned an empty body."] };
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify({ timestamp: (options.now ?? new Date()).toISOString(), body }, null, 2)}\n`, "utf8");
    return { status: "success", url: redactUrl(originalUrl), body, warnings: archiveHosts.some((host) => archiveUrl.includes(host)) ? [] : ["Archive.today host alias changed."] };
  } catch (error) {
    return { status: "failed", url: redactUrl(originalUrl), body: "", warnings: [error instanceof Error ? error.message : "Archive.today fallback failed."] };
  }
}

function archiveCachePath(originalUrl: string, cacheDir?: string) {
  const digest = createHash("sha256").update(originalUrl).digest("hex");
  return path.resolve(process.cwd(), cacheDir ?? path.join("data", "research-cache", "archive-today"), `${digest}.json`);
}

async function readFreshArchiveCache(filePath: string, now: Date) {
  try {
    const cached = JSON.parse(await readFile(filePath, "utf8")) as { timestamp?: string; body?: string };
    const timestamp = cached.timestamp ? new Date(cached.timestamp).getTime() : 0;
    if (cached.body && Number.isFinite(timestamp) && now.getTime() - timestamp < archiveTtlMs) return cached.body;
  } catch {
    // Cache miss.
  }
  return "";
}

async function limitedText(response: Response, maxBytes: number) {
  const text = await response.text();
  return text.length > maxBytes ? text.slice(0, maxBytes) : text;
}
