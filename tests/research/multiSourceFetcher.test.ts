import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fetchMultiSourceData, sourceDescriptors, type DataType } from "../../tools/research/multi-source-fetcher";
import { checkRobotsAllowed, isPathAllowedByRobots } from "../../tools/research/robots-cache";

const enabledEnv = {
  ENABLE_RESEARCH_SOURCES: "true",
  ENABLE_HLTV_AUTOMATION: "true"
};

describe("research robots cache", () => {
  it("applies longest matching allow/disallow rules", () => {
    const robots = `
      User-agent: *
      Disallow: /team/
      Allow: /team/public/
    `;
    expect(isPathAllowedByRobots(robots, "/team/private/123")).toBe(false);
    expect(isPathAllowedByRobots(robots, "/team/public/123")).toBe(true);
  });

  it("caches robots.txt for 24 hours and avoids repeat fetches", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "robots-cache-"));
    try {
      let calls = 0;
      const fetchImpl = async () => {
        calls += 1;
        return new Response("User-agent: *\nAllow: /\n");
      };
      const first = await checkRobotsAllowed("https://example.com/team/123", { cacheDir: temp, fetchImpl });
      const second = await checkRobotsAllowed("https://example.com/team/456", { cacheDir: temp, fetchImpl });
      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(true);
      expect(calls).toBe(1);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("fails closed when robots.txt cannot be fetched", async () => {
    const result = await checkRobotsAllowed("https://example.com/team/123", {
      fetchImpl: async () => new Response("Forbidden", { status: 403, statusText: "Forbidden" })
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("failed");
  });
});

describe("multi-source descriptor registry", () => {
  it("declares at least ten descriptors for every research data type", () => {
    const dataTypes: DataType[] = ["roster", "player_stats", "map_stats", "veto", "h2h"];
    for (const dataType of dataTypes) {
      expect(sourceDescriptors[dataType].length, dataType).toBeGreaterThanOrEqual(10);
      expect(sourceDescriptors[dataType].every((descriptor) => descriptor.allowedHosts.length > 0)).toBe(true);
      expect(sourceDescriptors[dataType].every((descriptor) => descriptor.allowedPathPatterns.length > 0)).toBe(true);
    }
  });
});

describe("multi-source fetch flow", () => {
  it("does not make robots or source requests when research env is disabled", async () => {
    let calls = 0;
    const result = await fetchMultiSourceData({
      dataType: "roster",
      matchId: "m1",
      teamName: "Evo Novo",
      dryRun: true,
      env: { ENABLE_RESEARCH_SOURCES: "false", ENABLE_HLTV_AUTOMATION: "false" },
      fetchImpl: async () => {
        calls += 1;
        return new Response("");
      }
    });
    expect(result.status).toBe("failed");
    expect(result.sourceResults.every((source) => source.status === "skipped")).toBe(true);
    expect(result.sourceResults[0].warnings.join(" ")).toContain("Research source is disabled");
    expect(calls).toBe(0);
  });

  it("skips sources with missing identifiers without making network requests", async () => {
    let calls = 0;
    const result = await fetchMultiSourceData({
      dataType: "player_stats",
      matchId: "m1",
      teamName: "Evo Novo",
      dryRun: true,
      env: enabledEnv,
      fetchImpl: async () => {
        calls += 1;
        return new Response("");
      }
    });
    expect(result.status).toBe("failed");
    expect(result.sourceResults.every((source) => source.status === "skipped")).toBe(true);
    expect(result.sourceResults[0].warnings.join(" ")).toContain("missing_identifier");
    expect(calls).toBe(0);
  });

  it("stops on the first useful source and reports partial rows on dry-run", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "multi-source-"));
    try {
      const calls: string[] = [];
      const result = await fetchMultiSourceData({
        dataType: "roster",
        matchId: "m1",
        teamName: "Evo Novo",
        dryRun: true,
        inboxPath: temp,
        cacheDir: path.join(temp, "cache"),
        env: enabledEnv,
        waitImpl: async () => {},
        fetchImpl: async (input: string | URL) => {
          const url = String(input);
          calls.push(url);
          if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
          return Response.json({
            players: [
              { nickname: "Blamz" },
              { nickname: "Borsty" }
            ]
          });
        }
      });
      expect(result.status).toBe("partial");
      expect(result.rows).toHaveLength(2);
      expect(result.sourceResults).toHaveLength(1);
      expect(result.sourceResults[0]).toMatchObject({ source: "liquipedia_roster_api", robotsAllowed: true });
      expect(calls.some((url) => url.includes("liquipedia.net/robots.txt"))).toBe(true);
      await expect(readFile(path.join(temp, "roster.csv"), "utf8")).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("continues after an empty parser and writes exact CSV names idempotently", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "multi-source-"));
    try {
      const result = await fetchMultiSourceData({
        dataType: "roster",
        matchId: "m1",
        teamName: "Evo Novo",
        csstatsTeamId: "123",
        inboxPath: temp,
        cacheDir: path.join(temp, "cache"),
        env: enabledEnv,
        waitImpl: async () => {},
        fetchImpl: async (input: string | URL) => {
          const url = String(input);
          if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
          if (url.includes("liquipedia.net")) return new Response("<html>empty</html>");
          return Response.json({
            players: [
              { nickname: "Blamz" },
              { nickname: "Borsty" },
              { nickname: "Gleerup" },
              { nickname: "PederseNN" },
              { nickname: "Xywzz" }
            ]
          });
        }
      });
      const second = await fetchMultiSourceData({
        dataType: "roster",
        matchId: "m1",
        teamName: "Evo Novo",
        csstatsTeamId: "123",
        inboxPath: temp,
        cacheDir: path.join(temp, "cache"),
        env: enabledEnv,
        waitImpl: async () => {},
        fetchImpl: async (input: string | URL) => {
          const url = String(input);
          if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
          if (url.includes("liquipedia.net")) return new Response("<html>empty</html>");
          return Response.json({ players: [{ nickname: "Blamz" }] });
        }
      });
      expect(result.status).toBe("success");
      expect(result.sourceResults.map((source) => source.source)).toContain("csstats_team_page");
      expect(result.writes[0]).toMatchObject({ fileName: "roster.csv", rowsInserted: 5 });
      expect(second.writes[0]).toMatchObject({ fileName: "roster.csv", rowsInserted: 0 });
      const csv = await readFile(path.join(temp, "roster.csv"), "utf8");
      expect(csv).toContain("Blamz");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
