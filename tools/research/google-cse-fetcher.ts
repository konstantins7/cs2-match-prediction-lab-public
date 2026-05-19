import { redactUrl, type FetchLike, type FetcherEnv } from "../data-fetchers/utils";
import { isResearchEnabled } from "./hltv-client";

export type GoogleCseResult = {
  status: "success" | "skipped" | "failed" | "quota_exceeded";
  links: string[];
  warnings: string[];
};

export async function searchGoogleCse(query: string, options: {
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  siteSearch?: string;
} = {}): Promise<GoogleCseResult> {
  const env = options.env ?? process.env;
  if (!isResearchEnabled(env, "ENABLE_GOOGLE_CSE_FALLBACK")) {
    return { status: "skipped", links: [], warnings: ["Research source is disabled: ENABLE_GOOGLE_CSE_FALLBACK."] };
  }
  const key = env.GOOGLE_CSE_API_KEY ?? "";
  const cx = env.GOOGLE_CSE_CX ?? "";
  if (!key || !cx) return { status: "skipped", links: [], warnings: ["Google CSE key/cx is not configured."] };

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", options.siteSearch ? `site:${options.siteSearch} ${query}` : query);
  try {
    const response = await (options.fetchImpl ?? fetch)(url.toString(), { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const error = payload.error as Record<string, unknown> | undefined;
    const reason = JSON.stringify(error ?? payload).toLowerCase();
    if (reason.includes("quotaexceeded") || reason.includes("quota exceeded")) {
      return { status: "quota_exceeded", links: [], warnings: ["Google CSE quotaExceeded; falling through to the next source."] };
    }
    if (!response.ok) return { status: "failed", links: [], warnings: [`Google CSE returned HTTP ${response.status} for ${redactUrl(url.toString())}.`] };
    const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
    return { status: "success", links: items.map((item) => String(item.link ?? "")).filter(Boolean), warnings: [] };
  } catch (error) {
    return { status: "failed", links: [], warnings: [error instanceof Error ? error.message.replace(key, "[redacted]") : "Google CSE request failed."] };
  }
}
