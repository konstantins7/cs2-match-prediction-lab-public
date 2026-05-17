import {
  fetchJson,
  getISODate,
  isDirectRun,
  listArg,
  makeReport,
  mergeSheetRows,
  parseCliArgs,
  printReport,
  rowsFromPayload,
  shouldRun,
  stringArg,
  textAt,
  type CsvMergeResult,
  type FetcherReport,
  type FetcherRunOptions
} from "./utils";

const source = "esport.is";
const baseUrl = "https://esport.is/api";

export type EsportIsOptions = FetcherRunOptions & {
  matchId?: string;
  teamNames?: string[];
};

export async function runEsportIsFetcher(options: EsportIsOptions = {}): Promise<FetcherReport> {
  const env = options.env ?? process.env;
  if (!shouldRun(env, "ENABLE_ESPORTIS_SYNC", options.force)) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["ENABLE_ESPORTIS_SYNC=false. Use --force for a manual one-shot fetch."]
    });
  }

  const fetched: Record<string, number> = {};
  const writes: CsvMergeResult[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const endpoints = {
    upcoming: `${baseUrl}/matches/upcoming?game=cs2&limit=50`,
    live: `${baseUrl}/matches/live?game=cs2`,
    rankings: `${baseUrl}/rankings/cs2`,
    news: `${baseUrl}/news?game=cs2`
  };

  const payloads: Partial<Record<keyof typeof endpoints, unknown>> = {};
  for (const [key, endpoint] of Object.entries(endpoints) as Array<[keyof typeof endpoints, string]>) {
    try {
      payloads[key] = await fetchJson(endpoint, { headers: { Accept: "application/json" } }, options.fetchImpl);
      fetched[key] = rowsFromPayload(payloads[key], [key, "matches", "rankings", "news", "data"]).length;
    } catch (error) {
      errors.push(`${key}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  if (!options.matchId) {
    warnings.push("matches/rankings fetched but not written: current private inbox has no exact match/ranking CSV schema and no --matchId was provided for news_events.csv.");
  } else {
    const newsRows = normalizeNewsRows(payloads.news, {
      matchId: options.matchId,
      teamNames: options.teamNames ?? [],
      collectedAt: getISODate(options.now)
    });
    if (newsRows.length) {
      writes.push(await mergeSheetRows("news_events", newsRows, ["matchId", "sourceName", "title", "publishedAt"], options));
    } else {
      warnings.push("No esport.is news rows matched the provided target match context.");
    }
  }

  return makeReport(source, {
    status: errors.length ? (writes.some((write) => write.rowsInserted > 0) ? "partial" : "failed") : "success",
    fetched,
    writes,
    warnings,
    errors
  });
}

export function normalizeNewsRows(payload: unknown, context: { matchId: string; teamNames: string[]; collectedAt: string }) {
  const items = rowsFromPayload(payload, ["news", "items", "data"]);
  return items
    .map((item) => {
      const title = textAt(item, ["title", "headline", "name"]);
      const summary = textAt(item, ["summary", "description", "body", "text"]);
      const publishedAt = textAt(item, ["publishedAt", "published_at", "createdAt", "date"]) || context.collectedAt;
      const affectedTeam = context.teamNames.find((teamName) => `${title} ${summary}`.toLowerCase().includes(teamName.toLowerCase())) ?? "";
      return {
        matchId: context.matchId,
        sourceName: "esport.is",
        sourceType: "official_api",
        title,
        summary: summary || title,
        publishedAt,
        affectedTeam,
        affectedPlayer: "",
        eventType: "news",
        reliability: "api_reference",
        impactScore: "0.1",
        confidence: "0.55"
      };
    })
    .filter((row) => row.title && row.summary);
}

export async function runEsportIsCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const report = await runEsportIsFetcher({
    force: Boolean(args.force),
    dryRun: Boolean(args["dry-run"]),
    matchId: stringArg(args, "matchId"),
    teamNames: listArg(args, "teams")
  });
  printReport(report);
  if (report.status === "failed") process.exitCode = 1;
}

if (isDirectRun(import.meta.url)) {
  runEsportIsCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
