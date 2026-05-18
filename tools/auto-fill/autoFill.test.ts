import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeAwpyFolder } from "../../scripts/awpy-batch";
import { runPandaScoreEnhancedFetcher } from "../data-fetchers/fetch-pandascore-enhanced";
import { importCsstatsCsv } from "./csstats-importer";
import { runAutoFill } from "./auto-fill-service";

const matchId = "pandascore_match_1488973";
const teams = ["Evo Novo", "WAZABI"] as [string, string];

describe("MVP 0.9.4 safe auto-fill helpers", () => {
  it("imports user-provided CSStats map CSV into exact private inbox headers", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "csstats-map-"));
    try {
      const input = path.join(temp, "maps.csv");
      await writeFile(input, "mapName,mapsPlayed,wins,losses,winRate\nAncient,8,5,3,62.5\n", "utf8");
      const result = await importCsstatsCsv({
        filePath: input,
        matchId,
        teamName: "Evo Novo",
        type: "map_stats",
        sourceName: "CSStats user CSV",
        collectedAt: "2026-05-04T00:00:00.000Z",
        period: "last_90_days",
        confidence: 80,
        inboxPath: temp
      });
      expect(result).toMatchObject({ file: "map_stats.csv", rows: 1 });
      const output = await readFile(path.join(temp, "map_stats.csv"), "utf8");
      expect(output.split(/\r?\n/)[0]).toContain("matchId,teamName,mapName,mapsPlayed");
      expect(output).toContain("Ancient");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("imports user-provided CSStats player CSV and skips duplicate rows", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "csstats-player-"));
    try {
      const input = path.join(temp, "players.csv");
      await writeFile(input, "nickname,maps,kills,deaths,rating,adr\nBlamz,10,180,150,1.12,78.4\n", "utf8");
      const options = {
        filePath: input,
        matchId,
        teamName: "Evo Novo",
        type: "player_stats" as const,
        sourceName: "CSStats user CSV",
        collectedAt: "2026-05-04T00:00:00.000Z",
        period: "last_90_days",
        confidence: 80,
        inboxPath: temp
      };
      expect((await importCsstatsCsv(options)).rows).toBe(1);
      expect((await importCsstatsCsv(options)).rows).toBe(0);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("rejects unsafe or low-evidence CSStats inputs", async () => {
    await expect(importCsstatsCsv({
      url: "https://example.com/export.csv",
      matchId,
      teamName: "Evo Novo",
      type: "map_stats",
      sourceName: "CSStats user CSV",
      confidence: 80,
      inboxPath: os.tmpdir()
    })).rejects.toThrow(/not allowed/);
    await expect(importCsstatsCsv({
      filePath: path.join(os.tmpdir(), "missing.csv"),
      matchId,
      teamName: "Team A",
      type: "map_stats",
      sourceName: "source name",
      confidence: 0,
      inboxPath: os.tmpdir()
    })).rejects.toThrow(/teamName|required|confidence/);
  });

  it("runs data auto-fill dry-run without writing files and returns template commands", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "auto-fill-"));
    try {
      const mapInput = path.join(temp, "maps.csv");
      await writeFile(mapInput, "mapName,mapsPlayed,wins\nAncient,8,5\n", "utf8");
      const result = await runAutoFill({
        matchId,
        teamNames: teams,
        mode: "deeper",
        dryRun: true,
        inboxPath: temp,
        teamACsstatsMapFile: mapInput,
        runPandaScore: async () => report("pandascore-enhanced", "skipped"),
        runGrid: async () => report("grid", "skipped"),
        runLiquipedia: async () => report("liquipedia", "skipped")
      });
      expect(result.dryRun).toBe(true);
      expect(result.writes.some((write) => write.file === "map_stats.csv")).toBe(true);
      expect(result.stillMissing).toContain("map_stats.csv");
      expect(result.templateCommands.join(" ")).toContain("template:map-stats");
      await expect(readFile(path.join(temp, "map_stats.csv"), "utf8")).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("runs PandaScore enhanced only when the auto-fetch flag and key are present", async () => {
    expect((await runPandaScoreEnhancedFetcher({
      env: { PANDASCORE_API_KEY: "test-key", ENABLE_PANDASCORE_AUTO_FETCH: "false" },
      delayMs: 0
    })).status).toBe("skipped");
    const result = await runPandaScoreEnhancedFetcher({
      env: { PANDASCORE_API_KEY: "test-key", ENABLE_PANDASCORE_AUTO_FETCH: "true" },
      matchId,
      teamNames: ["Evo Novo"],
      dryRun: true,
      delayMs: 0,
      fetchImpl: async () => new Response(JSON.stringify([{ name: "Evo Novo", players: [{ name: "Blamz", maps: 9, rating: 1.1 }] }]), { status: 200 })
    });
    expect(result.source).toBe("pandascore-enhanced");
    expect(result.writes.map((write) => write.fileName).sort()).toEqual(["player_stats.csv", "roster.csv"]);
  });

  it("merges a folder of local AWPy JSON exports into one parsed demo export", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "awpy-batch-"));
    try {
      await writeFile(path.join(temp, "one.json"), JSON.stringify(awpyJson("Blamz", 55)), "utf8");
      await writeFile(path.join(temp, "two.json"), JSON.stringify(awpyJson("Borsty", 44)), "utf8");
      const output = await normalizeAwpyFolder({
        folder: temp,
        matchId,
        teamNames: teams,
        sourceName: "AWPy batch export",
        collectedAt: "2026-05-04T00:00:00.000Z",
        period: "last_90_days",
        confidence: 85
      });
      expect(output.files).toEqual(["one.json", "two.json"]);
      expect(output.players).toHaveLength(2);
      expect(output.maps).toHaveLength(2);
      expect(output.sampleSize).toBeGreaterThan(1);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

function report(source: string, status: "success" | "partial" | "skipped" | "failed") {
  return Promise.resolve({ source, status, fetched: {}, writes: [], warnings: [], errors: [] });
}

function awpyJson(nickname: string, kills: number) {
  return {
    playerStats: [{ teamName: "Evo Novo", nickname, maps: 1, kills, deaths: 30, rating: 1.05 }],
    maps: [{ teamName: "Evo Novo", mapName: "Ancient", mapsPlayed: 1, wins: 1, losses: 0, winRate: 100 }]
  };
}
