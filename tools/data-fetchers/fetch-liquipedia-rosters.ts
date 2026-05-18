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
const rosterHintWarning = "Roster extracted from standings/tournament context; verify before trusted import.";

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
      let players = extractRosterEntries(html).slice(0, 8);
      let rowSourceName = "Liquipedia MediaWiki API";
      let rowPeriod = "current_roster";
      let rowConfidence = "0.7";
      let rowCollectedAt = collectedAt;
      if (!players.length) {
        const fallback = await fetchLiquipediaRosterHint(teamName, options.userAgent ?? defaultUserAgent, options.fetchImpl);
        fetched[`search:${teamName}`] = fallback.pagesChecked;
        players = fallback.players;
        if (players.length) {
          rowSourceName = "Liquipedia MediaWiki API roster hint";
          rowPeriod = "current_roster_hint";
          rowConfidence = "0.58";
          rowCollectedAt = fallback.evidenceDate ?? collectedAt;
          warnings.push(`${teamName}: ${rosterHintWarning}`);
        } else {
          warnings.push(`No roster nicknames detected for ${teamName}.`);
          warnings.push(...fallback.warnings.map((warning) => `${teamName}: ${warning}`));
        }
      }
      for (const player of players) {
        rosterRows.push({
          matchId: options.matchId,
          teamName,
          nickname: player.nickname,
          role: player.role,
          country: player.country,
          sourceName: rowSourceName,
          collectedAt: rowCollectedAt,
          period: rowPeriod,
          sampleSize: "1",
          confidence: rowConfidence
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

export async function fetchLiquipediaSearch(teamName: string, userAgent: string, fetchImpl?: FetchLike) {
  const url = new URL(apiUrl);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", teamName);
  url.searchParams.set("srlimit", "20");
  url.searchParams.set("format", "json");
  return fetchJson(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent
    }
  }, fetchImpl);
}

export async function fetchLiquipediaRosterHint(teamName: string, userAgent: string, fetchImpl?: FetchLike) {
  const warnings: string[] = [];
  const searchPayload = await fetchLiquipediaSearch(teamName, userAgent, fetchImpl);
  const titles = safeSearchTitles(searchPayload).sort((a, b) => candidatePriority(b) - candidatePriority(a)).slice(0, 8);
  let pagesChecked = 0;
  for (const title of titles) {
    const priority = candidatePriority(title);
    if (priority <= 0) continue;
    pagesChecked += 1;
    const payload = await fetchLiquipediaPage(title, userAgent, fetchImpl);
    const players = extractRosterHintEntries(extractParseHtml(payload), teamName);
    if (players.length === 5) return { players, pagesChecked, sourcePage: title, evidenceDate: evidenceDateFromTitle(title), warnings };
    warnings.push(`${title}: roster hint had ${players.length} plausible players, expected exactly 5.`);
  }
  return { players: [] as ReturnType<typeof extractRosterHintEntries>, pagesChecked, sourcePage: "", evidenceDate: "", warnings };
}

export function extractRosterNicknames(html: string) {
  return extractRosterEntries(html).map((entry) => entry.nickname);
}

export function extractRosterEntries(html: string) {
  const rows = html.split(/<tr\b/i).slice(1);
  const byNickname = new Map<string, { nickname: string; role: string; country: string }>();
  for (const row of rows) {
    if (!/player|id|nick|teamcard|roster/i.test(row)) continue;
    const links = [...row.matchAll(/<a\b[^>]*title="([^"]+)"[^>]*>(.*?)<\/a>/gi)];
    for (const [, title, body] of links) {
      const nickname = stripTags(body).trim() || title.trim();
      if (isLikelyPlayerNickname(nickname) && !byNickname.has(nickname)) {
        byNickname.set(nickname, {
          nickname,
          role: extractRole(row),
          country: extractCountry(row)
        });
      }
    }
  }
  return [...byNickname.values()];
}

export function extractRosterHintEntries(html: string, teamName: string) {
  const teamRow = findTargetTeamRow(html, teamName);
  if (!teamRow) return [];
  const startIndex = Math.max(teamRow.toLowerCase().indexOf(teamName.toLowerCase()), 0);
  const afterTeam = teamRow.slice(startIndex + teamName.length);
  const entries = [...afterTeam.matchAll(/<div\b[^>]*class="[^"]*block-player[^"]*"[^>]*>([\s\S]*?)(?=<div\b[^>]*class="[^"]*block-player|<\/td>|$)/gi)]
    .map(([, block]) => {
      const nameMatch = block.match(/<span\b[^>]*class="[^"]*\bname\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const nickname = nameMatch ? stripTags(nameMatch[1]).trim() : "";
      return {
        nickname,
        role: "unknown",
        country: extractCountry(block)
      };
    })
    .filter((entry) => isLikelyPlayerNickname(entry.nickname) && !/^(tbd|unknown)$/i.test(entry.nickname));
  const unique = uniqueEntries(entries);
  return unique.length === 5 ? unique : [];
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

function safeSearchTitles(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const query = (payload as Record<string, unknown>).query;
  if (!query || typeof query !== "object") return [];
  const search = (query as Record<string, unknown>).search;
  if (!Array.isArray(search)) return [];
  return search
    .map((item) => item && typeof item === "object" ? String((item as Record<string, unknown>).title ?? "") : "")
    .filter(Boolean);
}

function candidatePriority(title: string) {
  if (/^Valve Regional Standings\/Data\/\d{4}-\d{2}-\d{2}$/i.test(title)) return 100 + Number(title.match(/\d{4}-(\d{2})-(\d{2})/)?.slice(1).join("") ?? 0);
  if (/\/(?:Online Stage|Qualifier|Play-In|Masters|Championship|Series|Season)\b/i.test(title)) return 50;
  if (/\/Matches$/i.test(title)) return 20;
  return 0;
}

function evidenceDateFromTitle(title: string) {
  const match = title.match(/(?:^|\/)(\d{4})-(\d{2})-(\d{2})(?:$|\/)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z` : "";
}

function findTargetTeamRow(html: string, teamName: string) {
  const teamPattern = new RegExp(escapeRegExp(teamName).replace(/\s+/g, "[\\s_]+"), "i");
  return html.split(/<tr\b/i).slice(1).find((row) => teamPattern.test(stripTags(row)) || teamPattern.test(row)) ?? "";
}

function uniqueEntries(entries: Array<{ nickname: string; role: string; country: string }>) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.nickname.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractRole(row: string) {
  const text = stripTags(row).replace(/\s+/g, " ");
  const known = ["IGL", "AWPer", "rifler", "entry", "support", "coach", "stand-in", "substitute"];
  return known.find((role) => new RegExp(`\\b${role}\\b`, "i").test(text)) ?? "unknown";
}

function extractCountry(row: string) {
  const flag = row.match(/Flag[_ -]([A-Za-z]{2,}|[A-Za-z_]+)\.(?:png|svg)/i);
  if (flag?.[1]) return flag[1].replace(/_/g, " ");
  const title = row.match(/title="([A-Za-z][A-Za-z -]+)"[^>]*>\s*<img/i);
  return title?.[1] ?? "";
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
