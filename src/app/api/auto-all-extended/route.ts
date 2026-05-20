import { NextResponse } from "next/server";
import { redactString } from "@/lib/security/redaction";
import { logUserAction } from "@/lib/userActionLogger";
import { runAutoAllExtended } from "../../../../scripts/auto-all-extended";
import type { FocusDataType } from "../../../../scripts/auto-all-extended";
import type { AutoFillMode } from "../../../../tools/auto-fill";

export const dynamic = "force-dynamic";

type StreamEvent = {
  step: string;
  status: "running" | "success" | "warning" | "error";
  message: string;
  data?: unknown;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = text(searchParams.get("matchId"));
  const teamA = text(searchParams.get("teamA"));
  const teamB = text(searchParams.get("teamB"));
  if (!matchId || !teamA || !teamB) {
    return NextResponse.json({ ok: false, error: "matchId, teamA and teamB are required." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, message: redactString(event.message) })}\n\n`));
      };
      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(`: keepalive ${new Date().toISOString()}\n\n`));
      }, 10_000);

      void (async () => {
        const startedAt = Date.now();
        try {
          send({ step: "start", status: "running", message: "Starting extended Auto-All." });
          await logUserAction({
            actionName: "auto_all_extended",
            matchId,
            params: { teamA, teamB, mode: mode(searchParams.get("mode")), dryRun: searchParams.get("dryRun") === "true" },
            status: "started"
          }).catch(() => undefined);
          if (process.env.ENABLE_RESEARCH_SOURCES !== "true") {
            send({
              step: "research_flags",
              status: "warning",
              message: "ENABLE_RESEARCH_SOURCES is not true; extended sources will be skipped and safe baseline will still run."
            });
          }
          const result = await runAutoAllExtended({
            matchId,
            teamA,
            teamB,
            mode: mode(searchParams.get("mode")),
            dryRun: searchParams.get("dryRun") === "true",
            hltvMatchId: text(searchParams.get("hltvMatchId")),
            teamAHltvId: text(searchParams.get("teamAHltvId")),
            teamBHltvId: text(searchParams.get("teamBHltvId")),
            teamACsstatsId: text(searchParams.get("teamACsstatsId")),
            teamBCsstatsId: text(searchParams.get("teamBCsstatsId")),
            includeH2h: searchParams.get("includeH2h") === "true",
            focusDataTypes: focus(searchParams.get("focus"))
          });
          send({
            step: "complete",
            status: result.writes.length ? "success" : "warning",
            message: result.nextAction,
            data: result
          });
          await logUserAction({
            actionName: "auto_all_extended",
            matchId,
            params: { mode: mode(searchParams.get("mode")), dryRun: result.dryRun, writes: result.writes.length },
            durationMs: Date.now() - startedAt,
            status: "completed"
          }).catch(() => undefined);
        } catch (error) {
          const message = redactString(error instanceof Error ? error.message : "Extended Auto-All failed.");
          send({
            step: "error",
            status: "error",
            message
          });
          await logUserAction({
            actionName: "auto_all_extended",
            matchId,
            params: { teamA, teamB },
            durationMs: Date.now() - startedAt,
            status: "error",
            errorMessage: message
          }).catch(() => undefined);
        } finally {
          clearInterval(keepalive);
          controller.close();
        }
      })();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function mode(value: unknown): AutoFillMode {
  return value === "fast" || value === "deeper" || value === "max" ? value : "max";
}

function focus(value: unknown): FocusDataType[] | undefined {
  const allowed = new Set<FocusDataType>(["roster", "player_stats", "map_stats", "veto", "h2h", "news_events"]);
  const items = text(value).split(",").map((item) => item.trim()).filter((item): item is FocusDataType => allowed.has(item as FocusDataType));
  return items.length ? [...new Set(items)] : undefined;
}
