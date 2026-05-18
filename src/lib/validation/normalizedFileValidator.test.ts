import { describe, expect, it } from "vitest";
import { validateNormalizedFile } from "./normalizedFileValidator";

const matchId = "pandascore_match_1488973";
const teams = ["Evo Novo", "WAZABI"];

describe("normalized file validator", () => {
  it("accepts valid normalized map_stats CSV and warns only about sourceUrl", () => {
    const csv = [
      "matchId,teamName,mapName,mapsPlayed,wins,losses,winRate,roundsWon,roundsLost,ctRoundWinRate,tRoundWinRate,pickRate,banRate,deciderRate,sourceName,collectedAt,period,sampleSize,confidence",
      `${matchId},Evo Novo,Ancient,7,4,3,0.57,91,82,0.54,0.49,0.18,0.22,0.14,Verified table,2026-05-16T10:00:00Z,last_90_days,7,0.72`
    ].join("\n");
    const result = validateNormalizedFile({ fileName: "map_stats.csv", content: csv, expectedMatchId: matchId, allowedTeamNames: teams });

    expect(result.isValid).toBe(true);
    expect(result.rowsParsed).toBe(1);
    expect(result.coveredBlock).toBe("map_stats");
    expect(result.warnings.join(" ")).toContain("sourceUrl");
  });

  it("fails missing required columns", () => {
    const result = validateNormalizedFile({ fileName: "roster.csv", content: "matchId,teamName\nm1,Evo Novo" });

    expect(result.isValid).toBe(false);
    expect(result.missingColumns).toContain("nickname");
    expect(result.errors.join(" ")).toContain("missing column");
  });

  it("fails placeholder source and player names", () => {
    const csv = [
      "matchId,teamName,nickname,role,country,sourceName,collectedAt,period,sampleSize,confidence",
      `${matchId},Team A,player_name,rifler,KZ,source name,2026-05-16T10:00:00Z,current_roster,1,0.7`
    ].join("\n");
    const result = validateNormalizedFile({ fileName: "roster.csv", content: csv, expectedMatchId: matchId, allowedTeamNames: teams });

    expect(result.isValid).toBe(false);
    expect(result.errors.join(" ")).toContain("teamName");
    expect(result.errors.join(" ")).toContain("nickname");
    expect(result.errors.join(" ")).toContain("sourceName");
  });

  it("fails team mismatch when allowed teams are provided", () => {
    const csv = [
      "matchId,teamName,nickname,role,country,sourceName,collectedAt,period,sampleSize,confidence,sourceUrl",
      `${matchId},Other Team,realNick,rifler,KZ,Verified source,2026-05-16T10:00:00Z,current_roster,1,0.7,https://example.test`
    ].join("\n");
    const result = validateNormalizedFile({ fileName: "roster.csv", content: csv, expectedMatchId: matchId, allowedTeamNames: teams });

    expect(result.isValid).toBe(false);
    expect(result.errors.join(" ")).toContain("teamName does not match");
  });

  it("fails invalid maps and zero sample/confidence", () => {
    const csv = [
      "matchId,teamName,mapName,sampleSize,pickRate,banRate,deciderRate,sourceName,collectedAt,period,confidence",
      `${matchId},Evo Novo,Cache,0,0,0,0,Verified source,2026-05-16T10:00:00Z,last_90_days,0`
    ].join("\n");
    const result = validateNormalizedFile({ fileName: "veto_history.csv", content: csv, expectedMatchId: matchId, allowedTeamNames: teams });

    expect(result.isValid).toBe(false);
    expect(result.errors.join(" ")).toContain("mapName");
    expect(result.errors.join(" ")).toContain("sampleSize");
    expect(result.errors.join(" ")).toContain("confidence");
  });
});
