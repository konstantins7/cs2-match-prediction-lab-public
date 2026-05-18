import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAllFetchers } from "../run-all-fetchers";
import { safeHarvest } from "../data-harvesters/safe-orchestrator";
import { runEsportIsFetcher } from "./fetch-esportis";
import { findGridSeriesId, normalizeGridMapRows, normalizeGridVetoRows, runGridFetcher } from "./fetch-grid";
import { findGridSeriesIdEnhancedFromSeries, runGridEnhancedFetcher } from "./fetch-grid-enhanced";
import { extractRosterEntries, extractRosterHintEntries, extractRosterNicknames, runLiquipediaRosterFetcher } from "./fetch-liquipedia-rosters";
import { normalizePandaScorePlayerStat, runPandaScoreFetcher } from "./fetch-pandascore";
import { fetchSteamPlayerStats, runSteamFetcher } from "./fetch-steam";
import { parseStandingsMarkdown, runValveRankingsFetcher } from "./fetch-valve-rankings";
import { mergeSheetRows } from "./utils";

const matchId = "pandascore_match_1488973";
const teams = ["Evo Novo", "WAZABI"];

describe("Safe DAL Phase 1 fetchers", () => {
  it("merges exact accepted private inbox CSV names idempotently", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "safe-dal-"));
    try {
      const options = { inboxPath: path.join(temp, "private-inbox") };
      const row = {
        matchId,
        teamName: "Evo Novo",
        nickname: "evoRifler",
        role: "rifler",
        country: "KZ",
        sourceName: "test source",
        collectedAt: "2026-05-17T10:00:00Z",
        period: "current_roster",
        sampleSize: "1",
        confidence: "0.7"
      };
      const first = await mergeSheetRows("roster", [row], ["matchId", "teamName", "nickname", "sourceName"], options);
      const second = await mergeSheetRows("roster", [row], ["matchId", "teamName", "nickname", "sourceName"], options);
      expect(path.basename(first.filePath)).toBe("roster.csv");
      expect(first.rowsInserted).toBe(1);
      expect(second.rowsInserted).toBe(0);
      expect(second.rowsSkipped).toBe(1);
      const content = await readFile(path.join(temp, "private-inbox", "roster.csv"), "utf8");
      expect(content.trim().split(/\r?\n/)).toHaveLength(2);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("fetches esport.is with mocked endpoints and writes target news_events.csv only", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "safe-dal-esportis-"));
    try {
      const report = await runEsportIsFetcher({
        force: true,
        matchId,
        teamNames: teams,
        inboxPath: path.join(temp, "private-inbox"),
        fetchImpl: mockFetch({
          "matches/upcoming": { matches: [{ id: "m1" }] },
          "matches/live": { matches: [] },
          "rankings/cs2": { rankings: [{ rank: 1, team: { name: "Evo Novo" } }] },
          "news?game=cs2": { news: [{ title: "Evo Novo roster note", summary: "Evo Novo confirms lineup.", publishedAt: "2026-05-16T10:00:00Z" }] }
        })
      });
      expect(report.status).toBe("success");
      expect(report.writes[0]?.fileName).toBe("news_events.csv");
      const content = await readFile(path.join(temp, "private-inbox", "news_events.csv"), "utf8");
      expect(content).toContain("Evo Novo roster note");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("fetches GRID only when enabled/keyed and maps complete map/veto rows", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "safe-dal-grid-"));
    try {
      const payload = {
        data: {
          allSeries: [{
            id: "grid-series-1",
            startTime: "2026-05-17T10:00:00Z",
            teams: [{ name: "Evo Novo" }, { name: "WAZABI" }],
            maps: [{ name: "Ancient", winnerTeamName: "Evo Novo" }],
            vetoEvents: [{ mapName: "Nuke", teamName: "WAZABI", action: "ban" }]
          }]
        }
      };
      const report = await runGridFetcher({
        env: { ENABLE_GRID_SYNC: "true", GRID_API_KEY: "test-key" },
        matchId,
        teamNames: teams,
        inboxPath: path.join(temp, "private-inbox"),
        fetchImpl: mockFetch({ "central-data/graphql": payload })
      });
      expect(report.status).toBe("success");
      expect(report.writes.map((write) => write.fileName).sort()).toEqual(["map_stats.csv", "veto_history.csv"]);
      expect(await readFile(path.join(temp, "private-inbox", "map_stats.csv"), "utf8")).toContain("Ancient");
      expect(await readFile(path.join(temp, "private-inbox", "veto_history.csv"), "utf8")).toContain("Nuke");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("finds a GRID series by fuzzy teams and date without unsupported endpoints", () => {
    const match = findGridSeriesId([
      { id: "wrong", startTime: "2026-05-17T10:00:00Z", teams: [{ name: "Other Team" }, { name: "WAZABI" }] },
      { id: "grid-series-1", startTime: "2026-05-17T12:00:00Z", teams: [{ name: "Evo Novo" }, { name: "WAZABI" }] }
    ], teams, new Date("2026-05-17T12:30:00Z"));
    expect(match.seriesId).toBe("grid-series-1");
    expect(match.score).toBeGreaterThan(0.9);
  });

  it("finds enhanced GRID series by teams, tournament and date", async () => {
    const series = [
      { id: "ambiguous", title: "Other Cup", startTime: "2026-05-17T12:00:00Z", teams: [{ name: "Evo Novo" }, { name: "WAZABI" }] },
      { id: "grid-target", title: "CCT Season 3", tournament: { name: "CCT Season 3" }, startTime: "2026-05-18T12:00:00Z", teams: [{ name: "Evo Novo" }, { name: "WAZABI" }] }
    ];
    expect(findGridSeriesIdEnhancedFromSeries(series, {
      teamA: "Evo Novo",
      teamB: "WAZABI",
      tournament: "CCT Season 3",
      date: new Date("2026-05-18T11:00:00Z")
    })?.seriesId).toBe("grid-target");
    expect(findGridSeriesIdEnhancedFromSeries(series, {
      teamA: "Evo Novo",
      teamB: "Unknown",
      tournament: "CCT Season 3",
      date: new Date("2026-05-18T11:00:00Z")
    })).toBeNull();
  });

  it("GRID enhanced fetcher writes only safe map/veto rows", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "safe-dal-grid-enhanced-"));
    try {
      const report = await runGridEnhancedFetcher({
        env: { ENABLE_GRID_SYNC: "true", GRID_API_KEY: "test-key" },
        matchId,
        teamNames: teams,
        tournament: "CCT",
        inboxPath: path.join(temp, "private-inbox"),
        fetchImpl: mockFetch({
          "central-data/graphql": {
            data: {
              allSeries: [{
                id: "grid-target",
                title: "CCT",
                tournament: { name: "CCT" },
                startTime: "2026-05-17T12:00:00Z",
                teams: [{ name: "Evo Novo" }, { name: "WAZABI" }],
                maps: [{ name: "Ancient", winnerTeamName: "WAZABI" }],
                vetoEvents: [{ mapName: "Nuke", teamName: "Evo Novo", action: "pick" }]
              }]
            }
          }
        })
      });
      expect(report.status).toBe("success");
      expect(report.writes.map((write) => write.fileName).sort()).toEqual(["map_stats.csv", "veto_history.csv"]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("normalizes GRID rows conservatively without inventing map stats", () => {
    expect(normalizeGridMapRows([{ maps: [{ name: "Ancient" }] }], { matchId, teamNames: teams, collectedAt: "2026-05-17T10:00:00Z" })).toEqual([]);
    expect(normalizeGridMapRows([{ maps: [{ name: "Ancient", winnerTeamName: "Evo Novo" }] }], { matchId, teamNames: teams, collectedAt: "2026-05-17T10:00:00Z" })).toHaveLength(2);
    expect(normalizeGridVetoRows([{ vetoEvents: [{ mapName: "Nuke", teamName: "WAZABI", action: "ban" }] }], { matchId, teamNames: teams, collectedAt: "2026-05-17T10:00:00Z" })).toHaveLength(1);
  });

  it("fetches Liquipedia MediaWiki roster with rate limit configurable for tests", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "safe-dal-liquipedia-"));
    try {
      const html = '<table><tr class="Player"><td><span class="ID"><a title="evoRifler">evoRifler</a></span></td></tr></table>';
      expect(extractRosterNicknames(html)).toEqual(["evoRifler"]);
      expect(extractRosterEntries('<table><tr class="Player"><td><img src="Flag_kz.png"><span class="ID"><a title="evoRifler">evoRifler</a></span> IGL</td></tr></table>')[0]).toMatchObject({
        nickname: "evoRifler",
        role: "IGL",
        country: "kz"
      });
      const report = await runLiquipediaRosterFetcher({
        env: { ENABLE_LIQUIPEDIA_SYNC: "true" },
        matchId,
        teamNames: ["Evo Novo"],
        delayMs: 0,
        inboxPath: path.join(temp, "private-inbox"),
        fetchImpl: mockFetch({ "api.php": { parse: { text: { "*": html } } } })
      });
      expect(report.status).toBe("success");
      expect(report.writes[0]?.fileName).toBe("roster.csv");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("uses Liquipedia search fallback for roster hints from the target standings row only", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "safe-dal-liquipedia-hint-"));
    try {
      const standingsHtml = `
        <table>
          <tr>
            <td><span class="team-template-text">Other Team</span></td>
            <td>
              <div class="block-player"><span class="name">WrongA</span></div>
              <div class="block-player"><span class="name">WrongB</span></div>
              <div class="block-player"><span class="name">WrongC</span></div>
              <div class="block-player"><span class="name">WrongD</span></div>
              <div class="block-player"><span class="name">WrongE</span></div>
            </td>
          </tr>
          <tr>
            <td><span class="team-template-text">Evo Novo</span></td>
            <td>
              <div class="block-player"><span class="name">Blamz</span></div>
              <div class="block-player"><span class="name">Borsty</span></div>
              <div class="block-player"><span class="name">Gleerup</span></div>
              <div class="block-player"><span class="name">PederseNN</span></div>
              <div class="block-player"><span class="name">Xywzz</span></div>
            </td>
          </tr>
        </table>
      `;
      expect(extractRosterHintEntries(standingsHtml, "Evo Novo").map((entry) => entry.nickname)).toEqual([
        "Blamz",
        "Borsty",
        "Gleerup",
        "PederseNN",
        "Xywzz"
      ]);
      const report = await runLiquipediaRosterFetcher({
        env: { ENABLE_LIQUIPEDIA_SYNC: "true" },
        matchId,
        teamNames: ["Evo Novo"],
        delayMs: 0,
        inboxPath: path.join(temp, "private-inbox"),
        fetchImpl: async (input: string | URL) => {
          const url = String(input);
          if (url.includes("list=search")) {
            return new Response(JSON.stringify({
              query: {
                search: [
                  { title: "Some Irrelevant Page" },
                  { title: "Valve Regional Standings/Data/2026-05-04" }
                ]
              }
            }), { status: 200 });
          }
          if (url.includes("Valve+Regional+Standings") || url.includes("Valve%20Regional%20Standings")) {
            return new Response(JSON.stringify({ parse: { text: { "*": standingsHtml } } }), { status: 200 });
          }
          return new Response(JSON.stringify({ parse: { text: { "*": "<table></table>" } } }), { status: 200 });
        }
      });
      expect(report.status).toBe("success");
      expect(report.warnings.join(" ")).toContain("Roster extracted from standings/tournament context");
      const content = await readFile(path.join(temp, "private-inbox", "roster.csv"), "utf8");
      expect(content).toContain("Liquipedia MediaWiki API roster hint");
      expect(content).toContain("current_roster_hint");
      expect(content).toContain("2026-05-04T00:00:00.000Z");
      expect(content).toContain("0.58");
      expect(content.trim().split(/\r?\n/)).toHaveLength(6);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("rejects Liquipedia roster hints unless exactly five plausible target-row names exist", () => {
    const fourPlayers = `
      <table><tr><td>Evo Novo</td><td>
        <div class="block-player"><span class="name">Blamz</span></div>
        <div class="block-player"><span class="name">Borsty</span></div>
        <div class="block-player"><span class="name">Gleerup</span></div>
        <div class="block-player"><span class="name">PederseNN</span></div>
      </td></tr></table>
    `;
    const sixPlayers = `
      <table><tr><td>Evo Novo</td><td>
        <div class="block-player"><span class="name">Blamz</span></div>
        <div class="block-player"><span class="name">Borsty</span></div>
        <div class="block-player"><span class="name">Gleerup</span></div>
        <div class="block-player"><span class="name">PederseNN</span></div>
        <div class="block-player"><span class="name">Xywzz</span></div>
        <div class="block-player"><span class="name">Extra</span></div>
      </td></tr></table>
    `;
    expect(extractRosterHintEntries(fourPlayers, "Evo Novo")).toEqual([]);
    expect(extractRosterHintEntries(sixPlayers, "Evo Novo")).toEqual([]);
  });

  it("fetches PandaScore roster/stats only when enabled/keyed and never invents stats", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "safe-dal-pandascore-"));
    try {
      expect(normalizePandaScorePlayerStat({ name: "NoStats" }, { matchId, teamName: "Evo Novo", collectedAt: "2026-05-17T10:00:00Z" })).toBeNull();
      const report = await runPandaScoreFetcher({
        env: { ENABLE_PANDASCORE_SYNC: "true", PANDASCORE_API_KEY: "test-key" },
        matchId,
        teamNames: ["Evo Novo"],
        inboxPath: path.join(temp, "private-inbox"),
        fetchImpl: mockFetch({
          "/csgo/teams": [{
            name: "Evo Novo",
            players: [
              { name: "evoRifler", role: "rifler", nationality: "KZ", maps: 12, rating: 1.08, adr: 74.4, kills: 190, deaths: 176 }
            ]
          }]
        })
      });
      expect(report.status).toBe("success");
      expect(report.writes.map((write) => write.fileName).sort()).toEqual(["player_stats.csv", "roster.csv"]);
      expect(await readFile(path.join(temp, "private-inbox", "player_stats.csv"), "utf8")).toContain("evoRifler");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("fetches Steam Web API stats only as supplemental explicit-ID context", async () => {
    const stats = await fetchSteamPlayerStats({
      steamId: "76561198000000000",
      apiKey: "test-key",
      fetchImpl: mockFetch({
        "GetUserStatsForGame": {
          playerstats: {
            stats: [{ name: "total_kills", value: 100 }],
            achievements: [{ name: "WIN_BOMB_PLANT", achieved: 1 }]
          }
        }
      })
    });
    expect(stats?.stats.total_kills).toBe(100);
    expect((await runSteamFetcher({ env: { ENABLE_STEAM_SYNC: "false", STEAM_API_KEY: "test-key" } })).status).toBe("skipped");
    const report = await runSteamFetcher({
      env: { ENABLE_STEAM_SYNC: "true", STEAM_API_KEY: "test-key" },
      explicitPlayers: [{ steamId: "76561198000000000", nickname: "Blamz" }],
      fetchImpl: mockFetch({
        "GetUserStatsForGame": {
          playerstats: { stats: [{ name: "total_kills", value: 100 }] }
        }
      })
    });
    expect(report.status).toBe("partial");
    expect(report.writes).toEqual([]);
    expect(report.warnings.join(" ")).toContain("supplemental context only");
  });

  it("safe harvester dry-run composes only safe fetchers and writes nothing", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "safe-harvest-"));
    try {
      const result = await safeHarvest({
        matchId,
        teamNames: teams,
        mode: "fast",
        dryRun: true,
        inboxPath: path.join(temp, "private-inbox"),
        env: { ENABLE_LIQUIPEDIA_SYNC: "true", ENABLE_PANDASCORE_SYNC: "false", ENABLE_GRID_SYNC: "false" },
        fetchImpl: mockFetch({
          "api.php": { parse: { text: { "*": '<table><tr class="Player"><td><span class="ID"><a title="evoRifler">evoRifler</a></span></td></tr></table>' } } }
        })
      });
      expect(result.status).toBe("partial");
      expect(result.recordsCreated).toBeGreaterThan(0);
      await expect(readFile(path.join(temp, "private-inbox", "roster.csv"), "utf8")).rejects.toThrow();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("fetches Valve rankings safely but does not write unsupported ranking CSV", async () => {
    const markdown = "| 1 | 2000 | Team Vitality | apEX, ZywOo |\n| 2 | 1800 | Natus Vincere | b1t, w0nderful |";
    expect(parseStandingsMarkdown(markdown, { name: "standings_global_2026_05_17.md", path: "live/2026/standings_global_2026_05_17.md", type: "file", download_url: "https://example.test/standings.md" })).toHaveLength(2);
    const report = await runValveRankingsFetcher({
      env: { ENABLE_VALVE_RANKINGS_SYNC: "true" },
      fetchImpl: mockFetch({
        "contents/live": [{ name: "2026", path: "live/2026", type: "dir" }],
        "contents/live/2026": [{ name: "standings_global_2026_05_17.md", path: "live/2026/standings_global_2026_05_17.md", type: "file", download_url: "https://example.test/standings.md" }],
        "standings.md": markdown
      })
    });
    expect(report.status).toBe("partial");
    expect(report.fetched.rankings).toBe(2);
    expect(report.writes).toEqual([]);
    expect(report.warnings.join(" ")).toMatch(/no accepted ranking CSV schema/);
  });

  it("run-all respects disabled flags and does not mutate DB", async () => {
    const result = await runAllFetchers({
      matchId,
      teamNames: teams,
      dryRun: true
    });
    expect(result.status).toBe("completed");
    expect(result.reports.every((report) => report.status === "skipped")).toBe(true);
  });

  it("keeps DAL tools free of forbidden automation and Prisma writes", async () => {
    const files = [
      "tools/data-fetchers/utils.ts",
      "tools/data-fetchers/fetch-esportis.ts",
      "tools/data-fetchers/fetch-pandascore.ts",
      "tools/data-fetchers/fetch-pandascore-enhanced.ts",
      "tools/data-fetchers/fetch-grid.ts",
      "tools/data-fetchers/fetch-grid-enhanced.ts",
      "tools/data-fetchers/fetch-steam.ts",
      "tools/data-fetchers/fetch-liquipedia-rosters.ts",
      "tools/data-fetchers/fetch-valve-rankings.ts",
      "tools/run-all-fetchers.ts",
      "tools/data-harvesters/safe-orchestrator.ts",
      "tools/data-harvesters/harvest-all.ts"
    ];
    const combined = (await Promise.all(files.map((file) => readFile(path.join(process.cwd(), file), "utf8")))).join("\n").toLowerCase();
    expect(combined).not.toContain("prisma");
    expect(combined).not.toContain("hltv.org");
    expect(combined).not.toContain("telegram");
    expect(combined).not.toContain("apify");
    expect(combined).not.toContain("puppeteer");
    expect(combined).not.toContain("playwright");
    expect(combined).not.toContain("selenium");
    expect(combined).not.toContain("cheerio");
    expect(combined).not.toContain("series events");
    expect(combined).not.toContain("stats feed");
    expect(combined).not.toContain("file download");
  });
});

function mockFetch(routes: Record<string, unknown>) {
  return async (input: string | URL) => {
    const url = String(input);
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((route) => url.includes(route));
    if (!key) return new Response(JSON.stringify({ error: `No mock for ${url}` }), { status: 404 });
    const body = routes[key];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
  };
}
