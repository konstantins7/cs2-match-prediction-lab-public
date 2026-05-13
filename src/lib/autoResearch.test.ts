import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { friendlySourceError } from "./friendlyErrors";
import { GLOBAL_RESEARCH_PROGRESS_STEPS } from "./autoResearchShared";
import { runOneClickGlobalRefreshWithDeps, type AutoResearchDeps } from "./autoResearchCore";

function result(source: "pandascore" | "valve-rankings" | "cs-updates", status: "success" | "failed" | "blocked" | "disabled" = "success") {
  return {
    source,
    jobType: source === "valve-rankings" ? "valve_rankings" : source === "cs-updates" ? "game_meta_updates" : "upcoming_matches",
    status,
    records: source === "pandascore" ? [{ source, externalId: "m1", entityType: "match", raw: {}, fetchedAt: new Date(), sourceConfidence: 0.7 }] : [],
    recordsFetched: source === "pandascore" ? 1 : 0,
    errors: status === "success" ? [] : ["HTTP 403 paid_required"]
  } as const;
}

describe("MVP 0.4 auto research workflow", () => {
  it("global one-click sync calls expected pipeline functions in order", async () => {
    const calls: string[] = [];
    const deps: AutoResearchDeps = {
      getMetrics: async () => {
        calls.push("metrics");
        return { matches: calls.length > 1 ? 11 : 10, readyForecasts: 0, basicPreview: 4, needsManualData: 6, teamsWithRank: calls.length > 1 ? 3 : 2 };
      },
      syncPandaScore: async () => {
        calls.push("pandascore");
        return [result("pandascore")];
      },
      syncValveRankings: async () => {
        calls.push("valve");
        return result("valve-rankings");
      },
      syncCsUpdates: async () => {
        calls.push("steam");
        return result("cs-updates");
      },
      rebuildSnapshots: async () => {
        calls.push("snapshots");
        return {};
      },
      recalculatePredictions: async () => {
        calls.push("predictions");
        return 10;
      },
      refreshResearchQueue: async () => {
        calls.push("research");
        return 10;
      }
    };
    const output = await runOneClickGlobalRefreshWithDeps(deps);
    expect(calls).toEqual(["metrics", "pandascore", "valve", "steam", "snapshots", "predictions", "research", "metrics"]);
    expect(output.summary.updatedMatches).toBe(1);
    expect(output.summary.newMatches).toBe(1);
  });

  it("progress states render in Russian", () => {
    expect(GLOBAL_RESEARCH_PROGRESS_STEPS).toEqual([
      "Получаю матчи",
      "Обновляю рейтинги",
      "Проверяю обновления CS2",
      "Сопоставляю команды",
      "Пересобираю аналитику",
      "Пересчитываю прогнозы",
      "Готово"
    ]);
  });

  it("friendly source errors hide technical details", () => {
    expect(friendlySourceError("pandascore", "fetch failed")).toBe("PandaScore временно недоступен");
    expect(friendlySourceError("pandascore", "HTTP 403 paid_required")).toBe("Endpoint недоступен на текущем тарифе");
    expect(friendlySourceError("grid", "not configured")).toBe("GRID не настроен");
  });

  it("page files do not trigger sync on load", () => {
    for (const file of ["src/app/page.tsx", "src/app/matches/page.tsx", "src/app/predictions/page.tsx", "src/app/match/[id]/page.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("one_click_global_refresh");
      expect(source).not.toContain("prepare_match");
    }
  });

  it("match-specific prepare does not run broad source sync", () => {
    const source = readFileSync("src/lib/autoResearch.ts", "utf8");
    const prepareBody = source.slice(source.indexOf("export async function prepareMatchForecast"));
    expect(prepareBody).not.toContain("syncPandaScoreFreeFixtures(");
    expect(prepareBody).not.toContain("syncValveRankings(");
    expect(prepareBody).not.toContain("syncGameMetaUpdates(");
    expect(prepareBody).toContain("savePredictionAudit(matchId)");
  });

  it("guided UI exposes Russian labels and refresh fallback", () => {
    const oneClick = readFileSync("src/components/OneClickResearchButton.tsx", "utf8");
    const statusPanel = readFileSync("src/components/MatchForecastStatusPanel.tsx", "utf8");
    const matchDetail = readFileSync("src/components/MatchDetailTabs.tsx", "utf8");
    expect(oneClick).toContain("Обновить всё доступное автоматически");
    expect(oneClick).toContain("Обновить страницу");
    expect(oneClick).toContain("router.refresh()");
    expect(statusPanel).toContain("Что сделать дальше");
    expect(statusPanel).toContain("/admin/research-queue?matchId=");
    expect(matchDetail).not.toContain("Модель склоняется");
  });
});
