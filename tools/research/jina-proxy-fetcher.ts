import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactUrl, type FetchLike, type FetcherEnv } from "../data-fetchers/utils";
import { hltvResearchUserAgent, isResearchEnabled } from "./hltv-client";

export type JinaProxyFetchOptions = {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  cacheDir?: string;
  now?: Date;
  maxBytes?: number;
};

export type JinaProxyFetchResult = {
  status: "success" | "cached" | "disabled" | "failed";
  url: string;
  body: string;
  warnings: string[];
};

const jinaTtlMs = 24 * 60 * 60 * 1000;
const defaultMaxBytes = 2_000_000;

export async function fetchViaJinaProxy(originalUrl: string, options: JinaProxyFetchOptions = {}): Promise<JinaProxyFetchResult> {
  const env = options.env ?? process.env;
  if (!isResearchEnabled(env, "ENABLE_JINA_PROXY_FALLBACK")) {
    return { status: "disabled", url: redactUrl(originalUrl), body: "", warnings: ["Research source is disabled: ENABLE_JINA_PROXY_FALLBACK."] };
  }
  const cachePath = jinaCachePath(originalUrl, options.cacheDir);
  const cached = await readFreshJinaCache(cachePath, options.now ?? new Date());
  if (cached) return { status: "cached", url: redactUrl(originalUrl), body: cached, warnings: ["Jina Reader cache hit."] };

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(originalUrl);
  } catch {
    return { status: "failed", url: redactUrl(originalUrl), body: "", warnings: ["Jina Reader source URL is invalid."] };
  }
  const jinaUrl = `https://r.jina.ai/http://${sourceUrl.host}${sourceUrl.pathname}${sourceUrl.search}`;
  try {
    const response = await (options.fetchImpl ?? fetch)(jinaUrl, {
      headers: {
        Accept: "text/plain,text/markdown,*/*",
        "User-Agent": hltvResearchUserAgent
      }
    });
    if (!response.ok) return { status: "failed", url: redactUrl(originalUrl), body: "", warnings: [`Jina Reader returned HTTP ${response.status}.`] };
    const text = await response.text();
    const maxBytes = options.maxBytes ?? defaultMaxBytes;
    const truncated = text.length > maxBytes;
    const body = truncated ? text.slice(0, maxBytes) : text;
    if (!body.trim()) return { status: "failed", url: redactUrl(originalUrl), body: "", warnings: ["Jina Reader returned an empty body."] };
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify({ timestamp: (options.now ?? new Date()).toISOString(), body }, null, 2)}\n`, "utf8");
    return {
      status: "success",
      url: redactUrl(originalUrl),
      body,
      warnings: truncated ? [`Jina Reader response truncated at ${maxBytes} bytes; complex tables may be incomplete.`] : []
    };
  } catch (error) {
    return { status: "failed", url: redactUrl(originalUrl), body: "", warnings: [error instanceof Error ? error.message : "Jina Reader fallback failed."] };
  }
}

function jinaCachePath(originalUrl: string, cacheDir?: string) {
  const digest = createHash("sha256").update(originalUrl).digest("hex");
  return path.resolve(process.cwd(), cacheDir ?? path.join("data", "research-cache", "jina"), `${digest}.json`);
}

async function readFreshJinaCache(filePath: string, now: Date) {
  try {
    const cached = JSON.parse(await readFile(filePath, "utf8")) as { timestamp?: string; body?: string };
    const timestamp = cached.timestamp ? new Date(cached.timestamp).getTime() : 0;
    if (cached.body && Number.isFinite(timestamp) && now.getTime() - timestamp < jinaTtlMs) return cached.body;
  } catch {
    // Cache miss.
  }
  return "";
}
