import { describe, expect, it, vi } from "vitest";
import { fetchViaArchiveToday } from "../../tools/research/archive-today-fetcher";
import { searchGoogleCse } from "../../tools/research/google-cse-fetcher";
import { fetchViaJinaProxy } from "../../tools/research/jina-proxy-fetcher";
import { extractHltvMatchIdFromRss, extractRssItems } from "../../tools/research/rss-fetcher";

describe("research fallback fetchers", () => {
  it("keeps Archive.today disabled by default", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchViaArchiveToday("https://www.hltv.org/matches/1/a-vs-b", {
      env: { ENABLE_RESEARCH_SOURCES: "true", ENABLE_ARCHIVE_TODAY_FALLBACK: "false" },
      fetchImpl
    });
    expect(result.status).toBe("disabled");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caps Jina responses and reports truncation", async () => {
    const fetchImpl = vi.fn(async () => new Response("x".repeat(20), { status: 200 }));
    const result = await fetchViaJinaProxy("https://www.hltv.org/matches/1/a-vs-b", {
      env: { ENABLE_RESEARCH_SOURCES: "true", ENABLE_JINA_PROXY_FALLBACK: "true" },
      fetchImpl,
      cacheDir: `data/research-cache/test-jina-${Date.now()}`,
      maxBytes: 10
    });
    expect(result.status).toBe("success");
    expect(result.body).toHaveLength(10);
    expect(result.warnings.join(" ")).toContain("truncated");
  });

  it("redacts and falls through on Google CSE quotaExceeded", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 429 }));
    const result = await searchGoogleCse("Evo Novo WAZABI", {
      env: {
        ENABLE_RESEARCH_SOURCES: "true",
        ENABLE_GOOGLE_CSE_FALLBACK: "true",
        GOOGLE_CSE_API_KEY: "secret-key",
        GOOGLE_CSE_CX: "cx"
      },
      fetchImpl
    });
    expect(result.status).toBe("quota_exceeded");
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });

  it("extracts RSS match metadata without evidence rows", () => {
    const items = extractRssItems(`
      <rss><channel><item>
        <title>Evo Novo vs WAZABI</title>
        <link>https://www.hltv.org/matches/123/evo-novo-vs-wazabi</link>
        <pubDate>Tue, 19 May 2026 12:00:00 GMT</pubDate>
      </item></channel></rss>
    `);
    expect(items).toHaveLength(1);
    expect(extractHltvMatchIdFromRss(items, "Evo Novo", "WAZABI")).toBe("123");
  });
});
