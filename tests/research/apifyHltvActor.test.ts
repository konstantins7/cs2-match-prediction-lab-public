import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fixtureItems from "./fixtures/apify-hltv-items.json";
import { fetchHltvViaApify, normalizeApifyItems } from "../../tools/research/apify-hltv-actor";

const enabledEnv = {
  ENABLE_RESEARCH_SOURCES: "true",
  ENABLE_APIFY_HLTV_ACTOR: "true",
  APIFY_TOKEN: "apify_api_test_secret",
  APIFY_HLTV_ACTOR_ID: "test/hltv-actor",
  APIFY_DATASET_TTL_HOURS: "24"
};

describe("Apify HLTV actor research client", () => {
  it("skips without explicit flag or token", async () => {
    let calls = 0;
    const result = await fetchHltvViaApify({
      matchId: "m1",
      teamA: "Evo Novo",
      teamB: "WAZABI",
      env: { ENABLE_RESEARCH_SOURCES: "true", ENABLE_APIFY_HLTV_ACTOR: "false", APIFY_TOKEN: "apify_api_test_secret" },
      apifyClientFactory: () => {
        calls += 1;
        throw new Error("should not load client");
      }
    });
    expect(result.status).toBe("skipped");
    expect(calls).toBe(0);
  });

  it("normalizes fixture items into schema-useful rows", () => {
    const rows = normalizeApifyItems(fixtureItems, {
      matchId: "m1",
      teamA: "Evo Novo",
      teamB: "WAZABI",
      confidence: 0.82,
      period: "apify_test"
    }, new Date("2026-05-19T00:00:00Z"));
    expect(rows.roster).toHaveLength(5);
    expect(rows.player_stats).toHaveLength(5);
    expect(rows.map_stats.length).toBeGreaterThanOrEqual(4);
    expect(rows.veto_history).toHaveLength(2);
    expect(rows.h2h).toHaveLength(1);
  });

  it("runs actor once, caches dataset id, and dry-run writes no files", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "apify-hltv-"));
    try {
      let actorCalls = 0;
      let datasetCalls = 0;
      const factory = () => ({
        actor: () => ({
          call: async () => {
            actorCalls += 1;
            return { id: "run-1", defaultDatasetId: "dataset-1" };
          }
        }),
        dataset: () => ({
          listItems: async () => {
            datasetCalls += 1;
            return { items: fixtureItems };
          }
        })
      });
      const first = await fetchHltvViaApify({
        matchId: "m1",
        teamA: "Evo Novo",
        teamB: "WAZABI",
        hltvMatchId: "12345",
        dryRun: true,
        inboxPath: temp,
        cacheDir: path.join(temp, "cache"),
        env: enabledEnv,
        apifyClientFactory: factory
      });
      const second = await fetchHltvViaApify({
        matchId: "m1",
        teamA: "Evo Novo",
        teamB: "WAZABI",
        hltvMatchId: "12345",
        dryRun: true,
        inboxPath: temp,
        cacheDir: path.join(temp, "cache"),
        env: enabledEnv,
        apifyClientFactory: factory
      });
      expect(first.status).toBe("partial");
      expect(second.cacheHit).toBe(true);
      expect(actorCalls).toBe(1);
      expect(datasetCalls).toBe(2);
      expect(first.writes.map((write) => write.fileName)).toEqual(expect.arrayContaining(["roster.csv", "player_stats.csv", "map_stats.csv", "veto_history.csv", "h2h.csv"]));
      await expect(readFile(path.join(temp, "roster.csv"), "utf8")).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("expires cache after configured TTL", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "apify-hltv-"));
    try {
      let actorCalls = 0;
      const factory = () => ({
        actor: () => ({
          call: async () => {
            actorCalls += 1;
            return { id: `run-${actorCalls}`, defaultDatasetId: `dataset-${actorCalls}` };
          }
        }),
        dataset: () => ({
          listItems: async () => ({ items: fixtureItems })
        })
      });
      await fetchHltvViaApify({
        matchId: "m1",
        teamA: "Evo Novo",
        teamB: "WAZABI",
        hltvMatchId: "12345",
        dryRun: true,
        cacheDir: path.join(temp, "cache"),
        env: { ...enabledEnv, APIFY_DATASET_TTL_HOURS: "1" },
        now: new Date("2026-05-19T00:00:00Z"),
        apifyClientFactory: factory
      });
      const expired = await fetchHltvViaApify({
        matchId: "m1",
        teamA: "Evo Novo",
        teamB: "WAZABI",
        hltvMatchId: "12345",
        dryRun: true,
        cacheDir: path.join(temp, "cache"),
        env: { ...enabledEnv, APIFY_DATASET_TTL_HOURS: "1" },
        now: new Date("2026-05-19T02:01:00Z"),
        apifyClientFactory: factory
      });
      expect(expired.cacheHit).toBe(false);
      expect(actorCalls).toBe(2);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("fails closed on malformed items and redacts token from errors", async () => {
    const result = await fetchHltvViaApify({
      matchId: "m1",
      teamA: "Evo Novo",
      teamB: "WAZABI",
      env: enabledEnv,
      apifyClientFactory: () => ({
        actor: () => ({
          call: async () => {
            throw new Error(`bad token ${enabledEnv.APIFY_TOKEN}`);
          }
        }),
        dataset: () => ({
          listItems: async () => ({ items: [{ nope: true }] })
        })
      })
    });
    const serialized = JSON.stringify(result);
    expect(result.status).toBe("failed");
    expect(serialized).not.toContain(enabledEnv.APIFY_TOKEN);
    expect(serialized).toContain("apify_api_[redacted]");
  });
});
