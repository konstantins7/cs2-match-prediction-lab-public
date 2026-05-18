import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analystSheetTemplates } from "../src/lib/analystSheetTemplates";
import { validateNormalizedFile } from "../src/lib/validation/normalizedFileValidator";
import { normalizeAwpyJson } from "../tools/parsed-demo/normalize-awpy";
import { runRealityCheck } from "./reality-check";
import { generateAnalystSheetTemplate, runTemplateAnalystSheetCli } from "./template-analyst-sheet";

const matchId = "pandascore_match_1488973";
const teams = ["Evo Novo", "WAZABI"];

describe("MVP 0.9.3 real data completion helpers", () => {
  it("generates map/player/veto templates with exact headers and invalid placeholder defaults", () => {
    for (const type of ["map_stats", "player_stats", "veto_history"] as const) {
      const csv = generateAnalystSheetTemplate({
        type,
        matchId,
        teamName: "Evo Novo",
        collectedAt: "2026-05-04T00:00:00.000Z"
      });
      expect(csv.split(/\r?\n/)[0]).toBe(analystSheetTemplates[type].columns.join(","));
      const validation = validateNormalizedFile({
        fileName: analystSheetTemplates[type].filename,
        content: csv,
        expectedMatchId: matchId,
        allowedTeamNames: ["Evo Novo"]
      });
      expect(validation.isValid).toBe(false);
      expect(validation.errors.join(" ")).toMatch(/sourceName|sampleSize|confidence|placeholder/i);
    }
  });

  it("writes template output deterministically through --out", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "template-helper-"));
    try {
      const out = path.join(temp, "map_stats.csv");
      await runTemplateAnalystSheetCli([
        "--type", "map_stats",
        "--matchId", matchId,
        "--team", "Evo Novo",
        "--collectedAt", "2026-05-04T00:00:00.000Z",
        "--out", out
      ]);
      const content = await readFile(out, "utf8");
      expect(content).toContain("Evo Novo");
      expect(content).toContain("Ancient");
      expect(content.split(/\r?\n/)[0]).toBe(analystSheetTemplates.map_stats.columns.join(","));
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("runs reality check as dry-run without writing private inbox files or leaking keys", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "reality-helper-"));
    try {
      const result = await runRealityCheck({
        matchId,
        teamNames: teams,
        mode: "deeper",
        inboxPath: temp,
        env: { GRID_API_KEY: "", PANDASCORE_API_KEY: "", ENABLE_SAFE_HARVESTER: "true" },
        safeHarvestImpl: async () => ({
          status: "partial",
          matchId,
          teamNames: teams,
          mode: "deeper",
          startedAt: "2026-05-18T00:00:00.000Z",
          reports: [],
          recordsCreated: 0,
          recordsUpdated: 0,
          warnings: [],
          errors: []
        })
      });
      expect(result.env.GRID_API_KEY).toBe("not_configured");
      expect(result.env.PANDASCORE_API_KEY).toBe("not_configured");
      expect(result.nextAction).toContain("map_stats.csv");
      await expect(readdir(temp)).resolves.toEqual([]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("normalizes mocked AWPy JSON into parsed demo export shape", () => {
    const output = normalizeAwpyJson({
      input: {
        playerStats: [
          { teamName: "Evo Novo", nickname: "Blamz", maps: 3, kills: 55, deaths: 42, rating: 1.11, adr: 78.5 },
          { teamName: "WAZABI", nickname: "VireZ", maps: 3, kills: 49, deaths: 44, rating: 1.02, adr: 73.1 }
        ],
        maps: [
          { teamName: "Evo Novo", mapName: "Ancient", mapsPlayed: 3, wins: 2, losses: 1, winRate: 66.7 },
          { teamName: "WAZABI", mapName: "Ancient", mapsPlayed: 3, wins: 1, losses: 2, winRate: 33.3 }
        ]
      },
      matchId,
      teamNames: teams,
      sourceName: "Local AWPy export",
      collectedAt: "2026-05-04T00:00:00.000Z",
      period: "last_match",
      confidence: 85
    });
    expect(output).toMatchObject({
      type: "parsed_demo_export",
      sourceTool: "awpy",
      matchId,
      dataRole: "historical_team_form",
      sourceName: "Local AWPy export"
    });
    expect(output.players).toHaveLength(2);
    expect(output.maps).toHaveLength(2);
    expect(output.sampleSize).toBeGreaterThan(0);
  });

  it("rejects placeholder source, zero confidence and empty AWPy stats", () => {
    const base = {
      input: { playerStats: [] },
      matchId,
      teamNames: teams,
      sourceName: "Local AWPy export",
      collectedAt: "2026-05-04T00:00:00.000Z",
      period: "last_match",
      confidence: 85
    };
    expect(() => normalizeAwpyJson({ ...base, sourceName: "source name" })).toThrow(/sourceName/);
    expect(() => normalizeAwpyJson({ ...base, confidence: 0 })).toThrow(/confidence/);
    expect(() => normalizeAwpyJson(base)).toThrow(/no useful player or map stats/i);
  });

  it("keeps helper scripts free of forbidden automation and direct DB writes", async () => {
    const files = [
      "scripts/template-analyst-sheet.ts",
      "scripts/reality-check.ts",
      "tools/parsed-demo/normalize-awpy.ts"
    ];
    const combined = (await Promise.all(files.map((file) => readFile(path.join(process.cwd(), file), "utf8")))).join("\n").toLowerCase();
    for (const forbidden of ["prisma", "cheerio", "puppeteer", "playwright", "selenium", "apify", "telegram", "hltv.org", "scrape"]) {
      expect(combined).not.toContain(forbidden);
    }
  });
});
