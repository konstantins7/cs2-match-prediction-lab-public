import { afterEach, describe, expect, it } from "vitest";
import { csUpdatesAdapter, classifySteamPatchQuality } from "./csUpdatesAdapter";
import { liquipediaRateLimitResult } from "./liquipediaAdapter";
import { manualImportAdapter } from "./manualImportAdapter";
import { pandascoreAdapter } from "./pandascoreAdapter";
import { parsedDemoAdapter } from "./parsedDemoAdapter";
import { valveRankingsAdapter } from "./valveRankingsAdapter";
import { buildDataSyncJobData } from "./jobUtils";
import { failedResult } from "./types";
import { redactSecrets, redactString } from "../security/redaction";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("source adapters", () => {
  it("returns disabled status without API keys and does not crash", async () => {
    delete process.env.PANDASCORE_API_KEY;
    process.env.ENABLE_PANDASCORE_SYNC = "true";
    const result = await pandascoreAdapter.sync({ jobType: "upcoming_matches" });
    expect(result.status).toBe("disabled");
    expect(result.recordsFetched).toBe(0);
  });

  it("builds failed sync job data when a source is unavailable", () => {
    const failed = failedResult("pandascore", "upcoming_matches", "network unavailable token=super-secret-value");
    const job = buildDataSyncJobData(failed, new Date("2026-05-12T08:00:00.000Z"), 0, 0);
    expect(job.status).toBe("failed");
    expect(job.failureCount).toBe(1);
    expect(job.errorsJson).toContain("network unavailable");
    expect(job.errorsJson).not.toContain("super-secret-value");
  });

  it("redacts API key-like values from strings and objects", () => {
    expect(redactString("PANDASCORE_API_KEY=super-secret-value")).not.toContain("super-secret-value");
    expect(redactSecrets({ authorization: "Bearer super-secret-value" })).toEqual({ authorization: "[REDACTED]" });
  });

  it("uses the legacy /csgo prefix for PandaScore CS2 free fixtures", async () => {
    process.env.PANDASCORE_API_KEY = "local-test-token";
    process.env.ENABLE_PANDASCORE_SYNC = "true";
    let calledUrl = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      calledUrl = String(url);
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const result = await pandascoreAdapter.sync({ jobType: "upcoming_matches", fetchImpl });
    expect(result.status).toBe("success");
    expect(calledUrl).toContain("/csgo/matches/upcoming");
    expect(calledUrl).not.toContain("/cs2/");
  });

  it("marks PandaScore paid or blocked endpoints as blocked without crashing", async () => {
    process.env.PANDASCORE_API_KEY = "local-test-token";
    process.env.ENABLE_PANDASCORE_SYNC = "true";
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "paid_required for current plan" }), {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "application/json" }
      })) as typeof fetch;
    const result = await pandascoreAdapter.sync({ jobType: "finished_matches", fetchImpl });
    expect(result.status).toBe("blocked");
    expect(result.notes).toContain("blocked by current plan");
    expect(result.endpoint).toBe("/csgo/matches/past");
  });

  it("PandaScore free sync stores raw-ready ExternalSourceRecord data", async () => {
    process.env.PANDASCORE_API_KEY = "local-test-token";
    process.env.ENABLE_PANDASCORE_SYNC = "true";
    const fetchImpl = (async () =>
      new Response(JSON.stringify([{ id: 101, name: "Fixture Team" }]), {
        status: 200,
        headers: { "content-type": "application/json", "x-rate-limit-remaining": "42" }
      })) as typeof fetch;
    const result = await pandascoreAdapter.sync({ jobType: "teams", fetchImpl });
    expect(result.recordsFetched).toBe(1);
    expect(result.records[0].entityType).toBe("team");
    expect(result.records[0].source).toBe("pandascore");
    expect(result.rateLimitRemaining).toBe(42);
  });

  it("creates blocked Liquipedia status on rate limit", () => {
    const result = liquipediaRateLimitResult("rosters", new Date("2026-05-12T08:00:00.000Z"));
    expect(result.status).toBe("blocked");
    expect(result.rateLimitRemaining).toBe(0);
    expect(result.nextAllowedSyncAt?.toISOString()).toBe("2026-05-12T09:00:00.000Z");
  });

  it("marks incomplete Steam update items as partial quality", () => {
    const quality = classifySteamPatchQuality({ title: "Counter-Strike 2", contents: "Small update." });
    expect(quality.quality).toBe("partial");
    expect(quality.confidence).toBeLessThan(0.6);
  });

  it("CS updates adapter is safely disabled when env flag is off", async () => {
    process.env.ENABLE_CS_UPDATES_SYNC = "false";
    const result = await csUpdatesAdapter.sync({ jobType: "game_meta_updates" });
    expect(result.status).toBe("disabled");
  });

  it("Valve rankings sync works without an API key under mock fetch", async () => {
    process.env.ENABLE_VALVE_RANKINGS_SYNC = "true";
    const fetchImpl = (async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/contents/live")) {
        return new Response(JSON.stringify([{ name: "2026", type: "dir", path: "live/2026" }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (value.endsWith("/contents/live/2026")) {
        return new Response(
          JSON.stringify([{ name: "standings_global_2026_05_04.md", type: "file", path: "live/2026/standings_global_2026_05_04.md", download_url: "https://example.test/standings.md" }]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("| Standing | Points | Team Name | Roster | |\n| 1 | 2000 | Aurora Five | a, b, c, d, e | |", { status: 200 });
    }) as typeof fetch;
    const result = await valveRankingsAdapter.sync({ jobType: "valve_rankings", fetchImpl });
    expect(result.status).toBe("success");
    expect(result.records[0].entityType).toBe("valve_ranking");
  });

  it("Steam updates sync creates raw game meta records or partial records", async () => {
    process.env.ENABLE_CS_UPDATES_SYNC = "true";
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          appnews: {
            newsitems: [{ gid: "steam-1", title: "Release Notes", contents: "Map gameplay weapon economy update ".repeat(20), date: 1770000000 }]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;
    const result = await csUpdatesAdapter.sync({ jobType: "game_meta_updates", fetchImpl });
    expect(result.records[0].entityType).toBe("game_meta_update");
    expect(["success", "partial"]).toContain(result.status);
  });

  it("manual import emits manual_real match records", async () => {
    const payload = JSON.stringify({
      source: "manual",
      entityType: "matches",
      matches: [{ eventName: "Manual Cup", startTime: "2026-05-13T18:00:00.000Z", format: "BO3", teamA: "Aurora Five", teamB: "Nordic Pulse", status: "upcoming", maps: [] }]
    });
    const result = await manualImportAdapter.sync({ jobType: "manual_import", payload });
    expect(result.records[0].entityType).toBe("match");
    expect(JSON.stringify(result.records[0].raw)).toContain("manual_real");
  });

  it("HLTV manual ranking import emits ranking records without scraping", async () => {
    const payload = JSON.stringify({
      source: "hltv_manual_reference",
      rankingDate: "2026-05-12",
      teams: [{ rank: 1, teamName: "Aurora Five", hltvReferenceUrl: "https://www.hltv.org/team/demo" }]
    });
    const result = await manualImportAdapter.sync({ jobType: "hltv_manual_ranking_import", payload });
    expect(result.records[0].entityType).toBe("hltv_manual_ranking");
    expect(JSON.stringify(result.records[0].raw)).toContain("hltv_manual_reference");
  });

  it("parsed demo import emits parsed demo snapshot records", async () => {
    const result = await parsedDemoAdapter.sync({
      jobType: "parsed_demo_import",
      payload: JSON.stringify({ teams: [], playerStats: [], mapStats: [], teamForms: [] })
    });
    expect(result.records[0].entityType).toBe("parsed_demo_stats");
  });
});
