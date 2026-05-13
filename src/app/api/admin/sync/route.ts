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

export const dynamic = "force-dynamic";

type SyncRequest = {
  action?: string;
  source?: SourceName;
  jobType?: SourceJobType;
  payload?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncRequest;
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
