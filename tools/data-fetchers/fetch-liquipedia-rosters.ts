import {
  fetchJson,
  getISODate,
  isDirectRun,
  listArg,
  makeReport,
  mergeSheetRows,
  parseCliArgs,
  printReport,
  shouldRun,
  stringArg,
  wait,
  type CsvMergeResult,
  type FetchLike,
  type FetcherReport,
  type FetcherRunOptions
} from "./utils";

const source = "liquipedia";
const apiUrl = "https://liquipedia.net/counterstrike/api.php";
const defaultUserAgent = "CS2MatchPredictionLab/0.8 (research; contact: local@example.invalid)";

export type LiquipediaRosterOptions = FetcherRunOptions & {
  matchId?: string;
  teamNames?: string[];
  delayMs?: number;
  userAgent?: string;
};

export async function runLiquipediaRosterFetcher(options: LiquipediaRosterOptions = {}): Promise<FetcherReport> {
  const env = options.env ?? process.env;
  if (!shouldRun(env, "ENABLE_LIQUIPEDIA_SYNC", options.force)) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["ENABLE_LIQUIPEDIA_SYNC=false. Liquipedia MediaWiki fetch skipped."]
    });
  }
  if (!options.matchId || !options.teamNames?.length) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["Provide --matchId and --teams to create exact roster.csv rows."]
    });
  }

  const delayMs = options.delayMs ?? 2000;
  const collectedAt = getISODate(options.now);
  const rosterRows: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const fetched: Record<string, number> = {};

  for (const teamName of options.teamNames) {
    try {
      const payload = await fetchLiquipediaPage(teamName, options.userAgent ?? defaultUserAgent, options.fetchImpl);
      fetched[teamName] = 1;
      const html = extractParseHtml(payload);
      const players = extractRosterNicknames(html).slice(0, 8);
      if (!players.length) {
        warnings.push(`No roster nicknames detected for ${teamName}.`);
      }
      for (const nickname of players) {
        rosterRows.push({
          matchId: options.matchId,
          teamName,
          nickname,
          role: "unknown",
          country: "",
          sourceName: "Liquipedia MediaWiki API",
          collectedAt,
          period: "current_roster",
          sampleSize: "1",
          confidence: "0.62"
        });
      }
      if (delayMs > 0) await wait(delayMs);
    } catch (error) {
      errors.push(`${teamName}: ${error instanceof Error ? error.message : "Liquipedia fetch failed."}`);
    }
  }

  const writes: CsvMergeResult[] = [];
  if (rosterRows.length) {
    writes.push(await mergeSheetRows("roster", rosterRows, ["matchId", "teamName", "nickname", "sourceName"], options));
  }

  return makeReport(source, {
    status: errors.length ? (rosterRows.length ? "partial" : "failed") : "success",
    fetched,
    writes,
    warnings,
    errors
  });
}

export async function fetchLiquipediaPage(teamName: string, userAgent: string, fetchImpl?: FetchLike) {
  const url = new URL(apiUrl);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", teamName);
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "text");
  return fetchJson(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent
    }
  }, fetchImpl);
}

export function extractRosterNicknames(html: string) {
  const rows = html.split(/<tr\b/i).slice(1);
  const nicknames = new Set<string>();
  for (const row of rows) {
    if (!/player|id|nick|teamcard|roster/i.test(row)) continue;
    const links = [...row.matchAll(/<a\b[^>]*title="([^"]+)"[^>]*>(.*?)<\/a>/gi)];
    for (const [, title, body] of links) {
      const nickname = stripTags(body).trim() || title.trim();
      if (isLikelyPlayerNickname(nickname)) nicknames.add(nickname);
    }
  }
  return [...nicknames];
}

export async function runLiquipediaRosterCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const report = await runLiquipediaRosterFetcher({
    force: Boolean(args.force),
    dryRun: Boolean(args["dry-run"]),
    matchId: stringArg(args, "matchId"),
    teamNames: listArg(args, "teams"),
    userAgent: stringArg(args, "userAgent") || undefined
  });
  printReport(report);
  if (report.status === "failed") process.exitCode = 1;
}

function extractParseHtml(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const parse = (payload as Record<string, unknown>).parse;
  if (!parse || typeof parse !== "object") return "";
  const text = (parse as Record<string, unknown>).text;
  if (typeof text === "string") return text;
  if (text && typeof text === "object") return String((text as Record<string, unknown>)["*"] ?? "");
  return "";
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function isLikelyPlayerNickname(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 32) return false;
  if (/^(edit|team|matches|results|overview|statistics|achievements)$/i.test(normalized)) return false;
  return /[a-z0-9]/i.test(normalized);
}

if (isDirectRun(import.meta.url)) {
  runLiquipediaRosterCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
