import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractFirstDemoUrl, fetchCsstatsDemo } from "../../tools/research/csstats-demo-fetcher";
import {
  extractHltvMatchId,
  extractHltvMapStats,
  extractHltvPlayerStats,
  extractH2hRows,
  extractTeamIds,
  extractVetoRows,
  researchFetchText,
  resetHltvResearchRateLimitForTests,
  resolveHltvMatchId
} from "../../tools/research";

const enabledEnv = {
  ENABLE_RESEARCH_SOURCES: "true",
  ENABLE_HLTV_AUTOMATION: "true",
  ENABLE_CSSTATS_DEMO_FETCH: "true"
};

describe("HLTV research fetchers", () => {
  it("requires research and HLTV env flags before making requests", async () => {
    let calls = 0;
    const result = await resolveHltvMatchId({
      teamA: "Evo Novo",
      teamB: "WAZABI",
      env: { ENABLE_RESEARCH_SOURCES: "true", ENABLE_HLTV_AUTOMATION: "false" },
      fetchImpl: async () => {
        calls += 1;
        return new Response("<html></html>");
      }
    });
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });

  it("respects cache and rate limit for allowed HLTV URLs", async () => {
    resetHltvResearchRateLimitForTests();
    const temp = await mkdtemp(path.join(os.tmpdir(), "hltv-research-cache-"));
    try {
      let calls = 0;
      const waits: number[] = [];
      const fetchImpl = async () => {
        calls += 1;
        return new Response(`<a href="/matches/${calls}/evo-novo-vs-wazabi">Evo Novo vs WAZABI</a>`);
      };
      const first = await researchFetchText("https://www.hltv.org/search?query=Evo+Novo+WAZABI", {
        env: enabledEnv,
        cacheDir: temp,
        rateLimitMs: 100,
        waitImpl: async (ms) => { waits.push(ms); },
        fetchImpl
      });
      const cached = await researchFetchText("https://www.hltv.org/search?query=Evo+Novo+WAZABI", {
        env: enabledEnv,
        cacheDir: temp,
        rateLimitMs: 100,
        waitImpl: async (ms) => { waits.push(ms); },
        fetchImpl
      });
      const secondNetwork = await researchFetchText("https://www.hltv.org/matches/2/evo-novo-vs-wazabi", {
        env: enabledEnv,
        cacheDir: temp,
        rateLimitMs: 100,
        waitImpl: async (ms) => { waits.push(ms); },
        fetchImpl
      });
      expect(first.status).toBe("success");
      expect(cached.status).toBe("cached");
      expect(secondNetwork.status).toBe("success");
      expect(calls).toBe(2);
      expect(waits.some((ms) => ms > 0)).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("parses match id, veto, H2H and team ids from controlled fixtures", () => {
    const search = '<a href="/matches/12345/evo-novo-vs-wazabi">Evo Novo vs WAZABI</a>';
    expect(extractHltvMatchId(search, "Evo Novo", "WAZABI")?.matchId).toBe("12345");

    const matchPage = `
      <a href="/team/111/evo-novo">Evo Novo</a>
      <a href="/team/222/wazabi">WAZABI</a>
      <ul class="veto">
        <li>1. Evo Novo removed Nuke</li>
        <li>2. WAZABI picked Mirage</li>
        <li>3. Ancient was left over</li>
      </ul>
      <div class="recent-matches">2026-05-01 Evo Novo 2 - 1 WAZABI Mirage</div>
    `;
    const context = {
      matchId: "pandascore_match_1488973",
      teamA: "Evo Novo",
      teamB: "WAZABI",
      collectedAt: "2026-05-18T00:00:00.000Z",
      period: "hltv_match_page",
      confidence: 62
    };
    expect(extractTeamIds(matchPage, ["Evo Novo", "WAZABI"])).toEqual({ "Evo Novo": "111", WAZABI: "222" });
    expect(extractVetoRows(matchPage, context)).toHaveLength(4);
    expect(extractH2hRows(matchPage, context)[0]).toMatchObject({ winner: "Evo Novo", mapName: "Mirage" });
  });

  it("parses team map and player stats conservatively", () => {
    const mapRows = extractHltvMapStats(`
      <table><tr><td>Mirage</td><td>12</td><td>8</td><td>4</td><td>66.7%</td></tr></table>
    `, {
      matchId: "m1",
      teamName: "Evo Novo",
      collectedAt: "2026-05-18T00:00:00.000Z",
      period: "hltv_team_maps",
      confidence: 72
    });
    expect(mapRows[0]).toMatchObject({ mapName: "Mirage", mapsPlayed: 12, sampleSize: 12 });

    const playerRows = extractHltvPlayerStats(`
      <table><tr><td>Blamz</td><td>18</td><td>340</td><td>300</td><td>75.5</td><td>1.12</td></tr></table>
    `, {
      matchId: "m1",
      teamName: "Evo Novo",
      collectedAt: "2026-05-18T00:00:00.000Z",
      period: "hltv_player_stats",
      confidence: 72
    });
    expect(playerRows[0]).toMatchObject({ nickname: "Blamz", maps: 18, sampleSize: 18 });
  });

  it("fails closed on malformed pages", () => {
    const context = {
      matchId: "m1",
      teamA: "Evo Novo",
      teamB: "WAZABI",
      collectedAt: "2026-05-18T00:00:00.000Z",
      period: "hltv_match_page",
      confidence: 62
    };
    expect(extractHltvMatchId("<html>blocked</html>", "Evo Novo", "WAZABI")).toBeNull();
    expect(extractVetoRows("<html>blocked</html>", context)).toEqual([]);
    expect(extractH2hRows("<html>blocked</html>", context)).toEqual([]);
    expect(extractHltvMapStats("<html>blocked</html>", { matchId: "m1", teamName: "Evo Novo", collectedAt: context.collectedAt, period: "p", confidence: 1 })).toEqual([]);
    expect(extractHltvPlayerStats("<html>blocked</html>", { matchId: "m1", teamName: "Evo Novo", collectedAt: context.collectedAt, period: "p", confidence: 1 })).toEqual([]);
  });
});

describe("Research CSStats demo fetch", () => {
  it("requires explicit demo flag and writes only under data/demos style output", async () => {
    const skipped = await fetchCsstatsDemo({
      matchId: "m1",
      teamName: "Evo Novo",
      teamId: "123",
      env: { ENABLE_RESEARCH_SOURCES: "true", ENABLE_CSSTATS_DEMO_FETCH: "false" },
      fetchImpl: async () => new Response("")
    });
    expect(skipped.status).toBe("skipped");
  });

  it("extracts only allowlisted demo links and can dry-run the download path", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "csstats-demo-"));
    try {
      expect(extractFirstDemoUrl('<a href="/files/demo.dem">demo</a>', "https://csgostats.gg/team/123/demos")).toBe("https://csgostats.gg/files/demo.dem");
      expect(extractFirstDemoUrl('<a href="https://evil.test/demo.dem">demo</a>', "https://csgostats.gg/team/123/demos")).toBe("");
      const result = await fetchCsstatsDemo({
        matchId: "m1",
        teamName: "Evo Novo",
        teamId: "123",
        env: enabledEnv,
        dryRun: true,
        demosDir: temp,
        fetchImpl: async (input: string | URL) => {
          if (String(input).includes("/demos")) return new Response('<a href="/files/demo.dem">demo</a>');
          return new Response("demo");
        }
      });
      expect(result.status).toBe("success");
      expect(result.demoPath).toContain(temp);
      await expect(readFile(result.demoPath ?? "", "utf8")).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
