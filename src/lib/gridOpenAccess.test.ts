import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { determineGridSeriesStateRole, GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS, probeGridOpenAccess } from "./gridOpenAccess";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function gridFetchMock(options: { includeSeries?: boolean; includeState?: boolean } = {}) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const value = String(url);
    calls.push(value);
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("local-grid-test-token");
    if (value.includes("/central-data/graphql")) {
      return new Response(JSON.stringify({
        data: {
          allSeries: {
            totalCount: options.includeSeries === false ? 0 : 1,
            edges: options.includeSeries === false ? [] : [{
              node: {
                id: "grid-series-1",
                startTimeScheduled: "2026-05-21T18:00:00.000Z",
                teams: [
                  { baseInfo: { id: "grid-team-a", name: "Evo Novo" } },
                  { baseInfo: { id: "grid-team-b", name: "WAZABI" } }
                ],
                tournament: { id: "grid-tournament", name: "Demo Cup" }
              }
            }],
            pageInfo: { endCursor: null, hasNextPage: false }
          }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (value.includes("/live-data-feed/series-state/graphql") && options.includeState !== false) {
      return new Response(JSON.stringify({
        data: {
          seriesState: {
            startedAt: "2026-05-21T19:00:00.000Z",
            started: true,
            finished: true,
            teams: [
              { won: true, score: 2, kills: 88, deaths: 70, players: [{ id: "p1", name: "player_one", kills: 22, deaths: 15 }] },
              { won: false, score: 1, kills: 70, deaths: 88, players: [{ id: "p2", name: "player_two", kills: 15, deaths: 22 }] }
            ]
          }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ errors: [{ message: "not found" }] }), { status: 404 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("GRID Open Access integration", () => {
  it("probes Central Data and Series State with mocked Open Access endpoints", async () => {
    process.env.GRID_API_KEY = "local-grid-test-token";
    process.env.ENABLE_GRID_SYNC = "true";
    const { calls, fetchImpl } = gridFetchMock();
    const result = await probeGridOpenAccess(fetchImpl);
    expect(result.centralDataReachable).toBe(true);
    expect(result.seriesStateReachable).toBe(true);
    expect(result.allSeriesFetchedCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain("local-grid-test-token");
    expect(calls.some((call) => call.includes("/central-data/graphql"))).toBe(true);
    expect(calls.some((call) => call.includes("/live-data-feed/series-state/graphql"))).toBe(true);
    for (const unsupported of ["series-events", "file-download", "stats-feed"]) {
      expect(calls.join(" ")).not.toContain(unsupported);
    }
  });

  it("keeps Series State pending when Central Data has no known series id", async () => {
    process.env.GRID_API_KEY = "local-grid-test-token";
    process.env.ENABLE_GRID_SYNC = "true";
    const { calls, fetchImpl } = gridFetchMock({ includeSeries: false });
    const result = await probeGridOpenAccess(fetchImpl);
    expect(result.centralDataReachable).toBe(true);
    expect(result.seriesStateReachable).toBe("pending");
    expect(calls.some((call) => call.includes("/live-data-feed/series-state/graphql"))).toBe(false);
  });

  it("marks unsupported products unavailable without endpoint calls", () => {
    expect(GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS).toEqual(["Series Events API", "File Download API", "Stats Feed"]);
    const source = readFileSync("src/lib/gridOpenAccess.ts", "utf8");
    expect(source).toContain("unsupportedApisCalled: false");
    expect(source).not.toContain("series-events/graphql");
    expect(source).not.toContain("file-download");
    expect(source).not.toContain("stats-feed/graphql");
  });

  it("uses EntityAlias/manual mapping and needs_review instead of duplicate teams", () => {
    const source = readFileSync("src/lib/gridOpenAccess.ts", "utf8");
    expect(source).toContain('entityType: "match"');
    expect(source).toContain("prisma.entityAlias.upsert");
    expect(source).toContain("grid_series_low_confidence_match");
    expect(source).toContain("prisma.entityMatchCandidate.create");
    expect(source).not.toContain("prisma.team.create");
    expect(source).not.toContain("prisma.team.upsert");
  });

  it("maps Series State kills/deaths only into scoped records and respects post-start roles", () => {
    expect(determineGridSeriesStateRole({
      targetStartTime: new Date("2026-05-21T18:00:00.000Z"),
      sourceDate: new Date("2026-05-21T19:00:00.000Z"),
      started: true,
      finished: true
    })).toBe("post_match_analysis");
    const source = readFileSync("src/lib/gridOpenAccess.ts", "utf8");
    expect(source).toContain("prisma.playerStatSnapshot.create");
    expect(source).toContain("kills");
    expect(source).toContain("deaths");
    expect(source).toContain("dataLeakageCheckPassed: leakage.passed");
  });

  it("registers admin actions and does not add page-load sync", () => {
    const route = readFileSync("src/app/api/admin/sync/route.ts", "utf8");
    const matchPage = readFileSync("src/app/match/[id]/page.tsx", "utf8");
    expect(route).toContain("grid_oa_sync_central_data");
    expect(route).toContain("grid_oa_manual_series_mapping");
    expect(route).toContain("grid_oa_enrich_match");
    expect(matchPage).not.toContain("grid_oa_enrich_match");
  });

  it("keeps GRID inside existing Real Forecast gates and cutoff filters", () => {
    const inputBuilder = readFileSync("src/lib/prediction/buildPredictionInput.ts", "utf8");
    const prediction = readFileSync("src/lib/realForecast.ts", "utf8");
    expect(inputBuilder).toContain('safeRealEvidenceWhere("grid")');
    expect(inputBuilder).toContain('"analyst_sample", "manual_enrichment", "parsed_demo", "grid"');
    expect(prediction).toContain('row.source === "grid"');
    expect(prediction).toContain("recordPassesCutoff");
  });
});
