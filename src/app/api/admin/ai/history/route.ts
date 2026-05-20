import { NextResponse } from "next/server";
import { clearAiHistory, exportAiHistoryCsv, getAiHistoryRecord, markAiHistoryBad, readAiHistory } from "@/lib/ai/historyStore";
import { logUserAction } from "@/lib/userActionLogger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const query = {
    page: Number(url.searchParams.get("page") || 1),
    pageSize: Number(url.searchParams.get("pageSize") || 50),
    matchId: url.searchParams.get("matchId") || undefined,
    status: url.searchParams.get("status") || undefined,
    source: url.searchParams.get("source") || undefined,
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined
  };
  if (action === "export") {
    const csv = await exportAiHistoryCsv(query);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=ai-history.csv"
      }
    });
  }
  const id = url.searchParams.get("id");
  if (id) {
    const record = await getAiHistoryRecord(id);
    return NextResponse.json({ ok: Boolean(record), record }, { status: record ? 200 : 404 });
  }
  return NextResponse.json({ ok: true, ...(await readAiHistory(query)) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "mark-bad") {
    const record = await markAiHistoryBad(String(body.id || ""), body.bad !== false);
    return NextResponse.json({ ok: Boolean(record), record }, { status: record ? 200 : 404 });
  }
  if (action === "delete-all") {
    if (body.confirm !== "DELETE_AI_HISTORY") {
      return NextResponse.json({ ok: false, error: "confirm must equal DELETE_AI_HISTORY." }, { status: 400 });
    }
    await logUserAction({ actionName: "local_ai_history_clear", status: "started" }).catch(() => undefined);
    await clearAiHistory();
    await logUserAction({ actionName: "local_ai_history_clear", status: "completed" }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
}
