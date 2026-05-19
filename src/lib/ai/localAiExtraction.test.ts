import { describe, expect, it } from "vitest";
import { buildExtractionResult } from "./localAiExtraction";

describe("localAiExtraction", () => {
  it("normalizes useful AI payloads into analyst sheets", () => {
    const result = buildExtractionResult({
      matchId: "m1",
      teamA: "Evo Novo",
      teamB: "WAZABI",
      extractionId: "x1",
      cached: false,
      durationMs: 10,
      payload: {
        sourceSite: "HLTV copied text",
        confidence: 82,
        roster: [
          { teamName: "Evo Novo", nickname: "alpha", role: "rifler" },
          { teamName: "WAZABI", nickname: "bravo", role: "awper" }
        ],
        playerStats: [
          { teamName: "Evo Novo", nickname: "alpha", maps: 10, kills: 200, deaths: 180, rating: 1.12, adr: 78, kast: 72, impact: 1.08 }
        ],
        mapStats: [
          { teamName: "Evo Novo", mapName: "Dust II", mapsPlayed: 8, wins: 5, losses: 3 }
        ],
        vetoHistory: [
          { teamName: "WAZABI", mapName: "Mirage", action: "ban" }
        ],
        h2h: [
          { teamA: "Evo Novo", teamB: "WAZABI", winner: "Evo Novo", mapName: "Ancient", scoreA: 13, scoreB: 9, sampleSize: 1 }
        ]
      }
    });
    expect(result.sheets.map((sheet) => sheet.sheetType)).toEqual(["roster", "player_stats", "map_stats", "veto_history", "h2h"]);
    expect(result.sheets.find((sheet) => sheet.sheetType === "map_stats")?.content).toContain("Dust2");
    expect(result.sheets.find((sheet) => sheet.sheetType === "veto_history")?.content).toContain("100");
  });

  it("fails closed on impossible numeric values instead of inventing fixes", () => {
    const result = buildExtractionResult({
      matchId: "m1",
      teamA: "Evo Novo",
      teamB: "WAZABI",
      extractionId: "x2",
      cached: false,
      durationMs: 10,
      payload: {
        sourceSite: "copied text",
        confidence: 90,
        playerStats: [
          { teamName: "Evo Novo", nickname: "alpha", maps: 10, kd: 1.2, rating: 9.99, adr: 999, kast: 140, impact: 1.1 }
        ]
      }
    });
    const player = result.sheets.find((sheet) => sheet.sheetType === "player_stats");
    expect(player?.content).not.toContain("9.99");
    expect(player?.validation.errors.join(" ")).toMatch(/rating|adr|kast/i);
  });
});
