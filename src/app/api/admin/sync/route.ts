import { NextResponse } from "next/server";
import {
  rebuildSnapshots,
  buildTeamBasicResultSnapshots,
  runAllSync,
  runPredictionsForUpcomingMatches,
  syncPandaScoreFreeFixtures,
  runSourceSync
} from "@/lib/sources/sourceScheduler";
import type { SourceJobType, SourceName } from "@/lib/sources/types";
import { redactString } from "@/lib/security/redaction";
import { confirmRankMatch, rejectRankMatch } from "@/lib/data/rankMatching";
import { prepareMatchForecast, runForecastAutopilot, runOneClickGlobalRefresh } from "@/lib/autoResearch";
import { probeProviderCapabilities } from "@/lib/providerCapabilityProbe";
import { enrichFaceitContextForMatch, importFaceitManualIds } from "@/lib/faceitContext";
import { enrichGridOpenAccessMatch, importGridManualSeriesMapping, syncGridCentralData } from "@/lib/gridOpenAccess";
import { refreshMatchFeed } from "@/lib/matchFeedCache";
import { runFullMatchAnalysis } from "@/lib/fullMatchAnalysis";
import { resolvePredictionResultManually, resolvePredictionResults } from "@/lib/predictionLifecycle";
import type { ForecastAutopilotMode } from "@/lib/autoResearchShared";

export const dynamic = "force-dynamic";

type SyncRequest = {
  action?: string;
  source?: SourceName;
  jobType?: SourceJobType;
  payload?: string;
  matchId?: string;
  gridSeriesId?: string;
  from?: string;
  to?: string;
  mode?: ForecastAutopilotMode | "deep";
  savePrediction?: boolean;
  predictionPickId?: string;
  actualWinnerTeamId?: string;
  actualScore?: string;
  resultSource?: string;
  notes?: string;
};

function normalizeMode(mode: SyncRequest["mode"]): ForecastAutopilotMode {
  return mode === "deep" ? "deeper" : mode ?? "fast";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncRequest;
    if (body.action === "one_click_global_refresh") {
      const result = await runOneClickGlobalRefresh();
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "forecast_autopilot") {
      const result = await runForecastAutopilot(normalizeMode(body.mode), body.matchId);
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "full_match_analysis") {
      if (!body.matchId) return NextResponse.json({ ok: false, error: "matchId is required." }, { status: 400 });
      const result = await runFullMatchAnalysis(body.matchId, normalizeMode(body.mode), { savePrediction: body.savePrediction === true });
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "resolve_prediction_results") {
      const result = await resolvePredictionResults();
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "manual_prediction_result") {
      if (!body.predictionPickId) return NextResponse.json({ ok: false, error: "predictionPickId is required." }, { status: 400 });
      const result = await resolvePredictionResultManually({
        predictionPickId: body.predictionPickId,
        actualWinnerTeamId: body.actualWinnerTeamId,
        actualScore: body.actualScore,
        resultSource: body.resultSource,
        notes: body.notes
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "refresh_match_feed") {
      const result = await refreshMatchFeed();
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "provider_capability_probe") {
      const result = await probeProviderCapabilities();
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "faceit_manual_id_import") {
      const result = await importFaceitManualIds(body.payload);
      return NextResponse.json({ ok: result.errors.length === 0 || result.aliasesCreated + result.aliasesUpdated + result.candidatesCreated + result.candidatesUpdated > 0, result });
    }
    if (body.action === "faceit_enrich_match") {
      if (!body.matchId) return NextResponse.json({ ok: false, error: "matchId is required." }, { status: 400 });
      const result = await enrichFaceitContextForMatch(body.matchId);
      return NextResponse.json({ ok: result.errors.length === 0 || result.recordsFetched > 0 || result.candidatesNeedingReview > 0, result });
    }
    if (body.action === "grid_oa_sync_central_data") {
      const result = await syncGridCentralData({ from: body.from, to: body.to });
      return NextResponse.json({ ok: result.ok || result.recordsFetched > 0, result });
    }
    if (body.action === "grid_oa_manual_series_mapping") {
      const result = await importGridManualSeriesMapping(body.matchId, body.gridSeriesId);
      return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "grid_oa_enrich_match") {
      if (!body.matchId) return NextResponse.json({ ok: false, error: "matchId is required." }, { status: 400 });
      const result = await enrichGridOpenAccessMatch(body.matchId);
      if (result.recordsCreated > 0 || result.recordsUpdated > 0) {
        await rebuildSnapshots();
        await runPredictionsForUpcomingMatches();
      }
      return NextResponse.json({ ok: result.errors.length === 0 || result.recordsFetched > 0, result });
    }
    if (body.action === "prepare_match") {
      if (!body.matchId) return NextResponse.json({ ok: false, error: "matchId is required." }, { status: 400 });
      const result = await prepareMatchForecast(body.matchId);
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "run_all") {
      const results = await runAllSync();
      return NextResponse.json({ ok: true, results });
    }
    if (body.action === "pandascore_free") {
      const results = await syncPandaScoreFreeFixtures();
      return NextResponse.json({ ok: true, results });
    }
    if (body.action === "rebuild_snapshots") {
      const result = await rebuildSnapshots();
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "build_basic_form_snapshots") {
      const result = await buildTeamBasicResultSnapshots();
      return NextResponse.json({ ok: true, result: { basicResults: result } });
    }
    if (body.action === "recalculate_upcoming") {
      const count = await runPredictionsForUpcomingMatches();
      return NextResponse.json({ ok: true, result: { predictions: count } });
    }
    if (body.action === "manual_import") {
      const result = await runSourceSync("manual", "manual_import", body.payload);
      await rebuildSnapshots();
      await runPredictionsForUpcomingMatches();
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "manual_news_import") {
      const result = await runSourceSync("manual", "manual_news_import", body.payload);
      await rebuildSnapshots();
      await runPredictionsForUpcomingMatches();
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "hltv_manual_ranking_import") {
      const result = await runSourceSync("manual", "hltv_manual_ranking_import", body.payload);
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "parsed_demo_import") {
      const result = await runSourceSync("parsed-demo", "parsed_demo_import", body.payload);
      await rebuildSnapshots();
      await runPredictionsForUpcomingMatches();
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "rank_match_confirm") {
      const payload = JSON.parse(body.payload ?? "{}") as { teamId?: string; externalId?: string };
      if (!payload.teamId || !payload.externalId) return NextResponse.json({ ok: false, error: "teamId and externalId are required." }, { status: 400 });
      const result = await confirmRankMatch(payload.teamId, payload.externalId);
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "rank_match_reject") {
      const payload = JSON.parse(body.payload ?? "{}") as { teamId?: string; externalId?: string };
      if (!payload.teamId || !payload.externalId) return NextResponse.json({ ok: false, error: "teamId and externalId are required." }, { status: 400 });
      const result = await rejectRankMatch(payload.teamId, payload.externalId);
      return NextResponse.json({ ok: true, result });
    }
    if (!body.source || !body.jobType) {
      return NextResponse.json({ ok: false, error: "source and jobType are required." }, { status: 400 });
    }
    const result = await runSourceSync(body.source, body.jobType, body.payload);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: redactString(error instanceof Error ? error.message : "Sync request failed.") },
      { status: 500 }
    );
  }
}
