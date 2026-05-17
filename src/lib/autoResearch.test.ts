import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { friendlySourceError } from "./friendlyErrors";
import { getBestNextAction, humanForecastStatus } from "./bestNextAction";
import { GLOBAL_RESEARCH_PROGRESS_STEPS } from "./autoResearchShared";
import { runOneClickGlobalRefreshWithDeps, type AutoResearchDeps } from "./autoResearchCore";
import { AUTO_RESEARCH_ORCHESTRATOR_PLAN, getSourceSkipReason } from "./autoResearch/orchestrator";
import { buildSourceSetupChecklist, isNoExtraApiMode } from "./sourceSetup";
import { dataSourceRegistry } from "./config/dataSourceRegistry";
import { dataAcquisitionPlaybook, getPlaybookEntriesForMissing } from "./dataAcquisitionPlaybook";
import { coachManualPayload } from "./dataQualityCoach";
import { detectManualNewsPlaceholder } from "./news/manualNews";

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

describe("MVP 0.7.6 auto research workflow", () => {
  it("global one-click sync calls expected pipeline functions in order", async () => {
    const calls: string[] = [];
    const metrics = (after = false) => ({
      matches: after ? 11 : 10,
      readyForecasts: 0,
      basicPreview: 4,
      needsManualData: 6,
      teamsWithRank: after ? 3 : 2,
      L0_FIXTURE_ONLY: 2,
      L1_BASIC_CONTEXT: 3,
      L2_BASIC_PREDICTION: 1,
      L3_ANALYTICAL: 0,
      L4_DEEP: 0,
      teamsWithRoster: 0,
      matchesWithMapVeto: 0,
      researchTasks: 6,
      sourceSetupNeeded: 3
    });
    const deps: AutoResearchDeps = {
      getMetrics: async () => {
        calls.push("metrics");
        return metrics(calls.length > 1);
      },
      runOrchestrator: async () => {
        calls.push("orchestrator");
        return {
          results: [result("pandascore"), result("valve-rankings"), result("cs-updates")],
          reports: []
        };
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
    expect(calls).toEqual(["metrics", "orchestrator", "snapshots", "predictions", "research", "metrics"]);
    expect(output.summary.updatedMatches).toBe(1);
    expect(output.summary.newMatches).toBe(1);
    expect(output.summary.succeeded).toContain("получить матчи");
    expect(output.summary.unavailable).toContain("получить player stats");
  });

  it("progress states render in Russian", () => {
    expect(GLOBAL_RESEARCH_PROGRESS_STEPS).toEqual([
      "Получаю матчи",
      "Обновляю рейтинги",
      "Проверяю патчи CS2",
      "Проверяю составы",
      "Проверяю игроков",
      "Проверяю новости",
      "Пересобираю признаки",
      "Пересчитываю прогнозы",
      "Обновляю задачи",
      "Готово"
    ]);
  });

  it("orchestrator includes enabled-source order and optional providers", () => {
    expect(AUTO_RESEARCH_ORCHESTRATOR_PLAN.map((job) => `${job.dataType}:${job.source}`)).toEqual(expect.arrayContaining([
      "fixture:pandascore",
      "ranking:valve-rankings",
      "patch/meta:cs-updates",
      "roster:liquipedia",
      "player stats:faceit",
      "map/veto:grid"
    ]));
  });

  it("source budget manager blocks over-limit calls without crashing", () => {
    const now = new Date("2026-05-13T10:00:00Z");
    const job = { dataType: "fixture", source: "pandascore", jobType: "upcoming_matches" } as const;
    const status = {
      source: "pandascore",
      label: "PandaScore",
      priority: 3,
      enabled: true,
      configured: true,
      status: "idle",
      capabilities: [],
      message: "ok",
      requiredEnv: []
    } as never;
    const reason = getSourceSkipReason(job, status, {
      source: "pandascore",
      requestsUsed: 60,
      requestsRemaining: 0,
      resetAt: new Date("2026-05-13T11:00:00Z"),
      nextAllowedSyncAt: null,
      status: "idle"
    }, now);
    expect(reason).toBe("Лимит источника достигнут, попробуйте позже.");
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
    const source = readFileSync("src/lib/autoResearch/index.ts", "utf8");
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
    const home = readFileSync("src/app/page.tsx", "utf8");
    expect(oneClick).toContain("Обновить всё доступное автоматически");
    expect(oneClick).toContain("Автоматически удалось");
    expect(oneClick).toContain("Не удалось автоматически");
    expect(oneClick).toContain("Обновить страницу");
    expect(oneClick).toContain("router.refresh()");
    expect(statusPanel).toContain("Лучшее следующее действие");
    expect(statusPanel).toContain("/admin/research-queue?matchId=");
    expect(home).toContain("ForecastCommandCenter");
    expect(matchDetail).not.toContain("Модель склоняется");
  });

  it("source setup checklist explains provider value and no-API mode is informational", () => {
    const items = buildSourceSetupChecklist(false, false);
    expect(items.find((item) => item.id === "grid")?.value).toContain("round/player/economy");
    expect(items.find((item) => item.id === "liquipedia")?.value).toContain("составы");
    expect(isNoExtraApiMode(items)).toBeTypeOf("boolean");
  });

  it("source registry keeps manual-only and future providers safe", () => {
    const hltv = dataSourceRegistry.find((item) => item.id === "hltv_manual_top50");
    const telegram = dataSourceRegistry.find((item) => item.id === "telegram_manual");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const sourceIndex = readFileSync("src/lib/sources/index.ts", "utf8");
    expect(hltv?.legalMode).toBe("manual_reference");
    expect(hltv?.forbiddenActions).toContain("HLTV scraping");
    expect(hltv?.forbiddenActions).toContain("Apify HLTV actor sync");
    expect(hltv?.setupInstructions).toContain("Third-party scraper actors");
    expect(telegram?.legalMode).toBe("manual_reference");
    expect(telegram?.forbiddenActions).toContain("Telegram scraping");
    expect(packageJson.dependencies?.["apify-client"]).toBeUndefined();
    expect(packageJson.devDependencies?.["apify-client"]).toBeUndefined();
    expect(sourceIndex.toLowerCase()).not.toContain("apify");
    expect(sourceIndex.toLowerCase()).not.toContain("hltv");
    expect(AUTO_RESEARCH_ORCHESTRATOR_PLAN.map((job) => job.source)).not.toContain("abios");
    expect(dataSourceRegistry.filter((item) => item.accessType === "trial" || item.accessType === "paid_future" || item.accessType === "trial_or_paid_future").every((item) => item.status === "disabled")).toBe(true);
  });

  it("best next action and human status prefer user-readable forecast work", () => {
    const prediction = {
      sourceLevel: "Basic free data",
      realForecast: { isReady: false },
      readiness: {
        level: "L1_BASIC_CONTEXT",
        missingCriticalData: ["player roster missing"]
      }
    } as never;
    const action = getBestNextAction(prediction, [{ task: "Bind roster", status: "open" } as never]);
    expect(action.primaryAction.label).toBe("Добавить составы");
    expect(action.secondaryActions.length).toBeLessThanOrEqual(2);
    expect(humanForecastStatus(prediction)).toBe("Нужен состав");
  });

  it("technical pages remain accessible but are not the main route", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const appShell = readFileSync("src/components/ui/index.tsx", "utf8");
    expect(layout).toContain("AppShell");
    expect(appShell).toContain("Расширенно");
    expect(appShell).toContain("/admin/backtesting");
    expect(appShell).toContain("/admin/data-quality");
    expect(appShell).toContain("advancedNav");
  });

  it("product UX hides technical tasks and makes forecast wizard primary", () => {
    const commandCenter = readFileSync("src/components/ForecastCommandCenter.tsx", "utf8");
    const concierge = readFileSync("src/components/ForecastConciergePanel.tsx", "utf8");
    const researchQueue = readFileSync("src/app/admin/research-queue/page.tsx", "utf8");
    const manualPanel = readFileSync("src/components/ManualEnrichmentPanel.tsx", "utf8");
    const sources = readFileSync("src/app/admin/sources/page.tsx", "utf8");
    const matchDetail = readFileSync("src/components/MatchDetailTabs.tsx", "utf8");
    expect(commandCenter).toContain("Реальные прогнозы готовы");
    expect(commandCenter).toContain("Базовые прогнозы");
    expect(commandCenter).toContain("Нужно одно действие");
    expect(concierge).toContain("Что сайт смог получить автоматически");
    expect(concierge).toContain("Лучшее следующее действие");
    expect(concierge).toContain("Где взять недостающие данные");
    expect(matchDetail).toContain("ForecastConciergePanel");
    expect(researchQueue).toContain("Топ-10 приоритетных матчей");
    expect(researchQueue).toContain("Показать все технические задачи");
    expect(manualPanel).toContain("Шаг 1 — Добавьте составы");
    expect(manualPanel).toContain("Data Quality Coach");
    expect(manualPanel).toContain("Advanced JSON");
    expect(manualPanel).toContain("Самый сильный бесплатный способ улучшить прогноз");
    expect(manualPanel).toContain("Где взять: parsed demo, FACEIT, GRID, manual analyst sheet.");
    expect(sources).toContain("Как получить больше данных");
    expect(sources).toContain("HLTV ranking: только ручной импорт.");
    expect(sources).toContain("Apify HLTV scraper actors не подключены");
    expect(sources).toContain("Карта источников");
    expect(sources).toContain("Сайт работает в basic free mode");
  });

  it("manual HLTV rank matching is needs-review first and does not create duplicate teams", () => {
    const scheduler = readFileSync("src/lib/sources/sourceScheduler.ts", "utf8");
    const start = scheduler.indexOf("async function reconcileHltvManualRankingRecord");
    const end = scheduler.indexOf("function classifyPatchType");
    const body = scheduler.slice(start, end);
    expect(body).toContain("prisma.entityMatchCandidate.create");
    expect(body).toContain('status: "needs_review"');
    expect(body).toContain("return { created: 0, updated: 0, needsReview: 1 }");
    expect(body).not.toContain("prisma.team.create");
  });

  it("data acquisition playbook explains sources by data type", () => {
    expect(dataAcquisitionPlaybook.find((entry) => entry.dataType === "roster")?.sources).toEqual(["LiquipediaDB", "official team page", "manual source"]);
    expect(dataAcquisitionPlaybook.find((entry) => entry.dataType === "player_stats")?.sources).toContain("GRID");
    expect(dataAcquisitionPlaybook.find((entry) => entry.dataType === "map_veto")?.sources).toContain("manual history");
    expect(dataAcquisitionPlaybook.find((entry) => entry.dataType === "h2h")?.sources).toContain("PandaScore past");
    expect(dataAcquisitionPlaybook.find((entry) => entry.dataType === "news")?.sources).toContain("Telegram insider manual note");
    expect(dataAcquisitionPlaybook.find((entry) => entry.dataType === "round_economy")?.sources).toEqual(["parsed demo", "GRID"]);
    expect(getPlaybookEntriesForMissing(["missing player stats", "missing map/veto"]).map((entry) => entry.dataType)).toEqual(["player_stats", "map_veto"]);
  });

  it("data quality coach warns about weak manual data", () => {
    const warnings = coachManualPayload({
      type: "manual_real_pack",
      metadata: {
        sourceName: "",
        collectedAt: "2026-01-01T00:00:00Z",
        period: "last_90_days",
        sampleSize: 0,
        confidence: 0.3
      },
      rosters: { G2: [] },
      playerStats: [],
      mapStats: [],
      vetoHistory: []
    });
    expect(warnings.join(" ")).toContain("Нет sourceName");
    expect(warnings.join(" ")).toContain("Маленькая выборка");
    expect(warnings.join(" ")).toContain("Confidence низкий");
    expect(warnings.join(" ")).toContain("Данные старше 90 дней");
    expect(warnings.join(" ")).toContain("Нет map stats");
    expect(warnings.join(" ")).toContain("Нет veto");
    expect(warnings.join(" ")).toContain("Readiness не поднимется до L3");
  });

  it("forecast autopilot and provider probe UI contracts are present", () => {
    const route = readFileSync("src/app/api/admin/sync/route.ts", "utf8");
    const autopilot = readFileSync("src/components/ForecastAutopilotButton.tsx", "utf8");
    const sources = readFileSync("src/app/admin/sources/page.tsx", "utf8");
    const matches = readFileSync("src/app/matches/page.tsx", "utf8");
    const probe = readFileSync("src/lib/providerCapabilityProbe.ts", "utf8");
    expect(route).toContain("forecast_autopilot");
    expect(route).toContain("provider_capability_probe");
    expect(autopilot).toContain("Найти лучший матч для прогноза");
    expect(autopilot).toContain("Подготовить прогноз для этого матча");
    expect(autopilot).toContain("Найти матч с лучшими данными");
    expect(autopilot).toContain("Forecastability");
    expect(autopilot).toContain("Быстро");
    expect(autopilot).toContain("Глубже");
    expect(autopilot).toContain("Максимум");
    expect(autopilot).toContain("useState<ForecastAutopilotMode>(\"fast\")");
    expect(matches).toContain("sort=forecastable");
    expect(sources).toContain("Autopilot provider contribution");
    expect(sources).toContain("no Real Forecast Ready alone");
    expect(probe).toContain("Central Data");
    expect(probe).toContain("Series State");
    expect(probe).toContain("File Download");
    expect(probe).toContain("Series Events");
    expect(probe).toContain(".dem parser worker not available");
  });

  it("placeholder manual news is rejected before it can become active real news", () => {
    const detected = detectManualNewsPlaceholder({
      sourceName: "Official team site",
      title: "Roster update",
      summary: "Short official note",
      affectedTeam: "Team Name",
      url: "https://www.hltv.org/news/..."
    });
    expect(detected.isPlaceholder).toBe(true);
    expect(detected.reasons.join(" ")).toContain("placeholder news value");
    expect(detected.reasons.join(" ")).toContain("template URL");
  });
});
