import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommunityDatasetAutoFetch } from "../../tools/community-datasets/auto-fetch";
import { extractRssItems, fetchMultiSourceData, selectSitemapExportUrl } from "../../tools/research/multi-source-fetcher";
import { fetchViaWayback } from "../../tools/research/wayback-fetcher";

const researchEnv = {
  ENABLE_RESEARCH_SOURCES: "true",
  ENABLE_HLTV_AUTOMATION: "false",
  ENABLE_WAYBACK_FALLBACK: "true",
  ENABLE_SITEMAP_EXPORT_DISCOVERY: "true",
  ENABLE_COMMUNITY_DATASETS: "true"
};

describe("Wayback research fallback", () => {
  it("skips without env flags and makes no network request", async () => {
    let calls = 0;
    const result = await fetchViaWayback("https://www.hltv.org/matches/1/a-vs-b", {
      env: { ENABLE_RESEARCH_SOURCES: "true", ENABLE_WAYBACK_FALLBACK: "false" },
      fetchImpl: async () => {
        calls += 1;
        return new Response("");
      }
    });
    expect(result.status).toBe("disabled");
    expect(calls).toBe(0);
  });

  it("loads the closest snapshot and caches it for seven days", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "wayback-cache-"));
    try {
      const calls: string[] = [];
      const fetchImpl = async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("archive.org/wayback/available")) {
          return Response.json({ archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/20260519000000/https://www.hltv.org/matches/1/a-vs-b" } } });
        }
        return new Response("<html>snapshot body</html>");
      };
      const first = await fetchViaWayback("https://www.hltv.org/matches/1/a-vs-b", {
        env: researchEnv,
        fetchImpl,
        cacheDir: temp,
        directFirst: false,
        allowedHosts: ["www.hltv.org"],
        allowedPathPatterns: [/^\/matches\/\d+\/[a-z0-9-]+$/],
        waitImpl: async () => {}
      });
      const second = await fetchViaWayback("https://www.hltv.org/matches/1/a-vs-b", {
        env: researchEnv,
        fetchImpl,
        cacheDir: temp,
        directFirst: false,
        allowedHosts: ["www.hltv.org"],
        allowedPathPatterns: [/^\/matches\/\d+\/[a-z0-9-]+$/],
        waitImpl: async () => {}
      });
      expect(first).toMatchObject({ status: "success", via: "wayback" });
      expect(second).toMatchObject({ status: "cached", via: "wayback" });
      expect(calls).toHaveLength(2);
      expect(second.body).toContain("snapshot body");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("fails closed when no snapshot exists", async () => {
    const result = await fetchViaWayback("https://www.hltv.org/matches/1/a-vs-b", {
      env: researchEnv,
      directFirst: false,
      allowedHosts: ["www.hltv.org"],
      allowedPathPatterns: [/^\/matches\/\d+\/[a-z0-9-]+$/],
      fetchImpl: async () => Response.json({ archived_snapshots: {} }),
      waitImpl: async () => {}
    });
    expect(result.status).toBe("failed");
    expect(result.body).toBe("");
    expect(result.warnings.join(" ")).toContain("no available snapshot");
  });

  it("feeds archived HLTV match HTML through normalized veto parsing", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "wayback-multisource-"));
    try {
      const html = [
        "<li>1. Evo Novo removed Mirage</li>",
        "<li>2. WAZABI picked Ancient</li>",
        "<li>3. Nuke was left over</li>"
      ].join("\n");
      const result = await fetchMultiSourceData({
        dataType: "veto",
        matchId: "m1",
        teamName: "Evo Novo",
        opponentTeamName: "WAZABI",
        hltvMatchId: "1",
        dryRun: true,
        cacheDir: temp,
        env: researchEnv,
        waitImpl: async () => {},
        fetchImpl: async (input: string | URL) => {
          const url = String(input);
          if (url.includes("archive.org/wayback/available")) {
            return Response.json({ archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/20260519000000/https://www.hltv.org/matches/1/evo-novo-vs-wazabi" } } });
          }
          return new Response(html);
        }
      });
      expect(result.status).toBe("success");
      expect(result.sourceResults.find((source) => source.source === "wayback_hltv_match_veto")?.rows.length).toBeGreaterThan(0);
      await expect(readFile(path.join(temp, "veto_history.csv"), "utf8")).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("structured metadata fallbacks", () => {
  it("extracts roster names from SportsTeam JSON-LD", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "jsonld-roster-"));
    try {
      const html = `<script type="application/ld+json">${JSON.stringify({
        "@type": "SportsTeam",
        name: "Evo Novo",
        member: ["Blamz", "Borsty", "Gleerup", "PederseNN", "Xywzz"].map((name) => ({ "@type": "Person", name }))
      })}</script>`;
      const result = await fetchMultiSourceData({
        dataType: "roster",
        matchId: "m1",
        teamName: "Evo Novo",
        dryRun: true,
        cacheDir: temp,
        env: { ENABLE_RESEARCH_SOURCES: "true" },
        waitImpl: async () => {},
        fetchImpl: async (input: string | URL) => {
          if (String(input).endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
          return new Response(html);
        }
      });
      expect(result.status).toBe("success");
      expect(result.rows.map((row) => row.nickname)).toEqual(["Blamz", "Borsty", "Gleerup", "PederseNN", "Xywzz"]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("extracts RSS items as metadata only", () => {
    const items = extractRssItems("<rss><channel><item><title>Evo Novo vs WAZABI</title><link>https://www.hltv.org/matches/1/evo-novo-vs-wazabi</link><pubDate>Tue, 19 May 2026 12:00:00 GMT</pubDate></item></channel></rss>");
    expect(items).toEqual([{ title: "Evo Novo vs WAZABI", link: "https://www.hltv.org/matches/1/evo-novo-vs-wazabi", pubDate: "Tue, 19 May 2026 12:00:00 GMT" }]);
  });

  it("selects only allowlisted export-like sitemap URLs", () => {
    const selected = selectSitemapExportUrl([
      "https://csgostats.gg/team/123/page/2",
      "https://evil.example/team/123/export?type=maps",
      "https://csgostats.gg/team/123/export?type=maps"
    ], {
      allowedHosts: ["csgostats.gg"],
      allowedPathPatterns: [/^\/team\/[^/]+\/export$/],
      dataType: "map_stats"
    }, { dataType: "map_stats", matchId: "m1", teamName: "Evo Novo", csstatsTeamId: "123" });
    expect(selected).toBe("https://csgostats.gg/team/123/export?type=maps");
  });

  it("fetches map CSV through sitemap export discovery", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "sitemap-export-"));
    try {
      const result = await fetchMultiSourceData({
        dataType: "map_stats",
        matchId: "m1",
        teamName: "Evo Novo",
        dryRun: true,
        cacheDir: temp,
        env: { ENABLE_RESEARCH_SOURCES: "true", ENABLE_SITEMAP_EXPORT_DISCOVERY: "true" },
        waitImpl: async () => {},
        fetchImpl: async (input: string | URL) => {
          const url = String(input);
          if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
          if (url.endsWith("/sitemap.xml")) return new Response("<urlset><url><loc>https://csgostats.gg/team/123/export?type=maps</loc></url></urlset>");
          return new Response("mapName,mapsPlayed,wins,losses,winRate\nAncient,7,4,3,57.1\n");
        }
      });
      expect(result.status).toBe("partial");
      expect(result.sourceResults.find((source) => source.source === "csstats_sitemap_maps_csv")?.warnings.join(" ")).toContain("sitemap_export=");
      expect(result.rows[0]).toMatchObject({ mapName: "Ancient", mapsPlayed: 7 });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("community dataset auto-fetch", () => {
  it("normalizes valid registry JSON rows and writes nothing during dry-run", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "community-auto-"));
    try {
      const registryPath = path.join(temp, "registry.json");
      await writeFile(registryPath, JSON.stringify([{ id: "fixture-roster", url: "https://raw.githubusercontent.com/example/repo/main/roster.json", fileName: "roster.csv", updatedAt: "2026-05-19T00:00:00Z", maxAgeDays: 7 }]), "utf8");
      const report = await runCommunityDatasetAutoFetch({
        dryRun: true,
        registryPath,
        inboxPath: temp,
        env: researchEnv,
        now: new Date("2026-05-20T00:00:00Z"),
        fetchImpl: async () => Response.json([{ matchId: "m1", teamName: "Evo Novo", nickname: "Blamz", role: "rifler", country: "DK", sourceName: "Community Dataset", collectedAt: "2026-05-19T00:00:00Z", period: "current", sampleSize: 1, confidence: 0.7 }])
      });
      expect(report.status).toBe("success");
      expect(report.writes[0]).toMatchObject({ fileName: "roster.csv", dryRun: true, rowsInserted: 1 });
      await expect(readFile(path.join(temp, "roster.csv"), "utf8")).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("rejects stale or malformed community datasets without fake rows", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "community-auto-"));
    try {
      const registryPath = path.join(temp, "registry.json");
      await writeFile(registryPath, JSON.stringify([
        { id: "stale", url: "https://raw.githubusercontent.com/example/repo/main/roster.json", fileName: "roster.csv", updatedAt: "2020-01-01T00:00:00Z", maxAgeDays: 1 },
        { id: "bad", url: "https://raw.githubusercontent.com/example/repo/main/bad.json", fileName: "roster.csv" }
      ]), "utf8");
      const report = await runCommunityDatasetAutoFetch({
        dryRun: true,
        registryPath,
        inboxPath: temp,
        env: researchEnv,
        now: new Date("2026-05-20T00:00:00Z"),
        fetchImpl: async () => Response.json([{ teamName: "Evo Novo" }])
      });
      expect(report.writes).toHaveLength(0);
      expect(report.warnings.join(" ")).toContain("stale");
      expect(report.warnings.join(" ")).toContain("did not validate");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
