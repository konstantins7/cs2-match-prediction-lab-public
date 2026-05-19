import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runHltvDiagnostics } from "../../scripts/hltv-diagnostics";
import { inspectCommunityDatasetFile, scanCommunityDatasetRegistry } from "../../tools/community-datasets/registry";
import { normalizeBo3Payload, runBo3Cs2ApiFetcher } from "../../tools/research/bo3-api-client";
import { normalizeEsportisResearchRows, runEsportisResearchFetcher } from "../../tools/research/esportis-api-client";

const researchEnv = {
  ENABLE_RESEARCH_SOURCES: "true",
  ENABLE_HLTV_AUTOMATION: "true",
  ENABLE_ESPORTIS_SYNC: "true",
  ENABLE_BO3_CS2API_SYNC: "true"
};

describe("HLTV diagnostics", () => {
  it("skips network when research flags are disabled", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "hltv-diagnostics-"));
    try {
      let calls = 0;
      const report = await runHltvDiagnostics({
        teamA: "Evo Novo",
        teamB: "WAZABI",
        hltvMatchId: "12345",
        out: path.join(temp, "diagnostics.json"),
        env: { ENABLE_RESEARCH_SOURCES: "true", ENABLE_HLTV_AUTOMATION: "false" },
        fetchImpl: async () => {
          calls += 1;
          return new Response("");
        }
      });
      expect(calls).toBe(0);
      expect(report.summary.disabled).toBeGreaterThan(0);
      const persisted = JSON.parse(await readFile(path.join(temp, "diagnostics.json"), "utf8")) as typeof report;
      expect(persisted.researchEnabled).toBe(false);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("reports 403-style failures honestly without parsing data", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "hltv-diagnostics-"));
    try {
      const report = await runHltvDiagnostics({
        teamA: "Evo Novo",
        teamB: "WAZABI",
        hltvMatchId: "12345",
        out: path.join(temp, "diagnostics.json"),
        env: researchEnv,
        cacheDir: path.join(temp, "cache"),
        rateLimitMs: 0,
        fetchImpl: async () => new Response("Forbidden", { status: 403, statusText: "Forbidden" })
      });
      expect(report.summary.failed).toBeGreaterThan(0);
      expect(JSON.stringify(report)).toContain("HTTP 403 Forbidden");
      expect(JSON.stringify(report)).not.toContain("veto_history.csv");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("dry-run checks targets without writing diagnostics", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "hltv-diagnostics-"));
    try {
      const out = path.join(temp, "diagnostics.json");
      const report = await runHltvDiagnostics({
        teamA: "Evo Novo",
        teamB: "WAZABI",
        dryRun: true,
        out,
        env: researchEnv,
        fetchImpl: async () => new Response("ok")
      });
      expect(report.targets[0].status).toBe("dry_run");
      await expect(readFile(out, "utf8")).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("Esport.is research client", () => {
  it("normalizes only useful schema-safe rows", () => {
    const rows = normalizeEsportisResearchRows({
      "team:Evo Novo": {
        data: [{
          name: "Evo Novo",
          players: [{ nickname: "Blamz", role: "rifler", maps: 12, rating: 1.11, adr: 78.4, kast: 74 }],
          maps: [{ mapName: "Mirage", mapsPlayed: 8, wins: 5, losses: 3, winRate: 62.5 }]
        }]
      },
      news: { data: [{ title: "Evo Novo roster note", summary: "Official note", publishedAt: "2026-05-19T00:00:00Z" }] }
    }, {
      matchId: "m1",
      teamNames: ["Evo Novo", "WAZABI"],
      collectedAt: "2026-05-19T00:00:00.000Z"
    });
    expect(rows.rosterRows).toHaveLength(1);
    expect(rows.playerRows).toHaveLength(1);
    expect(rows.mapRows).toHaveLength(1);
    expect(rows.newsRows).toHaveLength(1);
    expect(rows.warnings.join(" ")).toContain("WAZABI");
  });

  it("dry-run report does not write files", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "esportis-research-"));
    try {
      const report = await runEsportisResearchFetcher({
        matchId: "m1",
        teamNames: ["Evo Novo", "WAZABI"],
        dryRun: true,
        inboxPath: temp,
        env: researchEnv,
        fetchImpl: async (input: string | URL) => {
          const url = String(input);
          if (url.includes("teams?search=Evo")) {
            return Response.json({ data: [{ name: "Evo Novo", players: [{ nickname: "Blamz", maps: 10, rating: 1.1 }] }] });
          }
          if (url.includes("teams?search=WAZABI")) {
            return Response.json({ data: [{ name: "WAZABI", players: [{ nickname: "BacH", maps: 9, rating: 1.02 }] }] });
          }
          return Response.json({ data: [] });
        }
      });
      expect(report.status).toBe("success");
      expect(report.writes.every((write) => write.dryRun)).toBe(true);
      await expect(readFile(path.join(temp, "roster.csv"), "utf8")).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("BO3/cs2api research client", () => {
  it("skips cleanly when env flags are missing", async () => {
    const report = await runBo3Cs2ApiFetcher({
      matchId: "m1",
      teamNames: ["Evo Novo", "WAZABI"],
      env: { ENABLE_RESEARCH_SOURCES: "true", ENABLE_BO3_CS2API_SYNC: "false" }
    });
    expect(report.status).toBe("skipped");
  });

  it("normalizes fixture payloads without requiring Python", () => {
    const rows = normalizeBo3Payload({
      teams: [{
        name: "Evo Novo",
        players: [{ nickname: "Blamz", maps: 14, rating: 1.18, kills: 240, deaths: 210, adr: 82 }],
        maps: [{ mapName: "Ancient", mapsPlayed: 7, wins: 4, losses: 3 }]
      }]
    }, {
      matchId: "m1",
      teamNames: ["Evo Novo", "WAZABI"],
      collectedAt: "2026-05-19T00:00:00.000Z"
    });
    expect(rows.rosterRows).toHaveLength(1);
    expect(rows.playerRows[0]).toMatchObject({ nickname: "Blamz", rating: 1.18 });
    expect(rows.mapRows[0]).toMatchObject({ mapName: "Ancient", mapsPlayed: 7 });
    expect(rows.warnings.join(" ")).toContain("WAZABI");
  });
});

describe("community dataset registry", () => {
  it("inspects normalized and offline community CSV files", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "community-datasets-"));
    try {
      await writeFile(path.join(temp, "results.csv"), "date,team_1,team_2,_map,result_1,result_2,match_id,event_id,rank_1,rank_2,match_winner\n2026-05-01,A,B,Mirage,13,8,m1,e1,1,2,A\n", "utf8");
      await writeFile(path.join(temp, "roster.csv"), "matchId,teamName,nickname,role,country,sourceName,collectedAt,period,sampleSize,confidence\nm1,Evo Novo,Blamz,rifler,DK,Community CSV,2026-05-19T00:00:00Z,current,1,0.7\n", "utf8");
      const report = await scanCommunityDatasetRegistry({ rootPath: temp });
      expect(report.entries.map((entry) => entry.kind).sort()).toEqual(["normalized_private_inbox", "offline_dataset"]);
      expect(report.summary.files).toBe(2);
      expect(report.entries.every((entry) => entry.canRaiseRealForecastReady === false)).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("rejects unsupported community dataset names", () => {
    const entry = inspectCommunityDatasetFile({ fileName: "random.csv", content: "a,b\n1,2\n" });
    expect(entry.ok).toBe(false);
    expect(entry.kind).toBe("unsupported");
  });
});
