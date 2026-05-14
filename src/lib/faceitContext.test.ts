import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFaceitManualIdPayload } from "./faceitContext";

describe("FACEIT context enrichment safety", () => {
  it("parses manual FACEIT ID CSV and JSON payloads", () => {
    expect(parseFaceitManualIdPayload("entityType,name,faceitId\nteam,Natus Vincere,team-1\nplayer,b1t,player-1")).toEqual([
      { entityType: "team", name: "Natus Vincere", faceitId: "team-1" },
      { entityType: "player", name: "b1t", faceitId: "player-1" }
    ]);
    expect(parseFaceitManualIdPayload(JSON.stringify({
      source: "faceit_manual_ids",
      teams: [{ teamName: "Team Name", faceitTeamId: "team-2" }],
      players: [{ nickname: "Player", faceitPlayerId: "player-2" }]
    }))).toEqual([
      { entityType: "team", name: "Team Name", faceitId: "team-2" },
      { entityType: "player", name: "Player", faceitId: "player-2" }
    ]);
  });

  it("registers FACEIT API actions without adding page-load sync", () => {
    const route = readFileSync("src/app/api/admin/sync/route.ts", "utf8");
    const matchPage = readFileSync("src/app/match/[id]/page.tsx", "utf8");
    expect(route).toContain("faceit_manual_id_import");
    expect(route).toContain("faceit_enrich_match");
    expect(matchPage).not.toContain("faceit_enrich_match");
  });

  it("uses explicit known ID routes and forbids automatic search or broad crawl", () => {
    const source = readFileSync("src/lib/faceitContext.ts", "utf8");
    expect(source).toContain("/teams/${encodeURIComponent(alias.externalId)}");
    expect(source).toContain("/players/${encodeURIComponent(alias.externalId)}");
    expect(source).toContain("/stats/${gameId}");
    expect(source).toContain("championships?game=${gameId}&type=upcoming&limit=1");
    expect(source).not.toContain("/search");
    expect(source).not.toContain("nickname=");
    expect(source).not.toContain("teamName=");
    expect(source).toContain("automaticSearchUsed: false");
    expect(source).toContain("broadCrawlUsed: false");
  });

  it("creates aliases or needs-review candidates without duplicate domain entities", () => {
    const source = readFileSync("src/lib/faceitContext.ts", "utf8");
    expect(source).toContain("prisma.entityAlias.upsert");
    expect(source).toContain("prisma.entityMatchCandidate.create");
    expect(source).toContain("missing-faceit-player");
    expect(source).not.toContain("prisma.team.create");
    expect(source).not.toContain("prisma.player.create");
  });

  it("exposes FACEIT UI contracts and source coverage context", () => {
    const statusPanel = readFileSync("src/components/MatchForecastStatusPanel.tsx", "utf8");
    const sourcesPage = readFileSync("src/app/admin/sources/page.tsx", "utf8");
    const manualPanel = readFileSync("src/components/FaceitManualIdImportPanel.tsx", "utf8");
    const coverage = readFileSync("src/lib/sourceCoverageMatrix.ts", "utf8");
    const researchQueue = readFileSync("src/lib/researchQueueCore.ts", "utf8");
    expect(statusPanel).toContain("FaceitEnrichMatchButton");
    expect(manualPanel).toContain("Manual FACEIT ID Import");
    expect(sourcesPage).toContain("search/crawl отключены");
    expect(coverage).toContain("FACEIT team/player context present");
    expect(coverage).toContain("weak confidence evidence only");
    expect(researchQueue).toContain("Confirm FACEIT IDs");
    expect(researchQueue).toContain("не поднимает матч до full L3");
  });

  it("keeps FACEIT cutoff/freshness weak and scoped in prediction input", () => {
    const inputBuilder = readFileSync("src/lib/prediction/buildPredictionInput.ts", "utf8");
    const prediction = readFileSync("src/lib/prediction/calculatePrediction.ts", "utf8");
    expect(inputBuilder).toContain("faceitContextPassesCutoff");
    expect(inputBuilder).toContain('source: "faceit"');
    expect(inputBuilder).toContain("matchId");
    expect(prediction).toContain("faceitContextBonus");
    expect(prediction).toContain("Math.min(2");
  });
});
