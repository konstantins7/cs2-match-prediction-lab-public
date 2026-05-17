import {
  fetchJson,
  fetchText,
  isDirectRun,
  makeReport,
  parseCliArgs,
  printReport,
  rowsFromPayload,
  shouldRun,
  type FetcherReport,
  type FetcherRunOptions
} from "./utils";

const source = "valve-rankings";
const valveRepoLive = "https://api.github.com/repos/ValveSoftware/counter-strike_regional_standings/contents/live";

type GithubContentItem = {
  name: string;
  type: "file" | "dir";
  path: string;
  download_url?: string | null;
};

export type ValveRankingRow = {
  externalId: string;
  rank: number;
  points: number;
  teamName: string;
  roster: string;
  region: string;
  sourceFile: string;
  sourceUrl: string;
};

export async function runValveRankingsFetcher(options: FetcherRunOptions = {}): Promise<FetcherReport> {
  const env = options.env ?? process.env;
  if (!shouldRun(env, "ENABLE_VALVE_RANKINGS_SYNC", options.force)) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["ENABLE_VALVE_RANKINGS_SYNC=false. Valve rankings fetch skipped."]
    });
  }

  try {
    const livePayload = await fetchJson(valveRepoLive, { headers: githubHeaders() }, options.fetchImpl);
    const years = rowsFromPayload(livePayload) as GithubContentItem[];
    const latestYear = years.filter((item) => item.type === "dir").sort((a, b) => b.name.localeCompare(a.name))[0];
    if (!latestYear) throw new Error("Valve rankings live directory has no year folders.");
    const yearUrl = `https://api.github.com/repos/ValveSoftware/counter-strike_regional_standings/contents/${latestYear.path}`;
    const yearPayload = await fetchJson(yearUrl, { headers: githubHeaders() }, options.fetchImpl);
    const files = (rowsFromPayload(yearPayload) as GithubContentItem[])
      .filter((item) => item.type === "file" && item.name.startsWith("standings_") && item.name.endsWith(".md"))
      .sort((a, b) => a.name.localeCompare(b.name));
    const latestGlobal = files.filter((file) => file.name.includes("standings_global_")).at(-1) ?? files.at(-1);
    if (!latestGlobal?.download_url) throw new Error("Valve rankings has no downloadable standings markdown.");
    const markdown = await fetchText(latestGlobal.download_url, { headers: githubHeaders("text/plain") }, options.fetchImpl);
    const rankings = parseStandingsMarkdown(markdown, latestGlobal).slice(0, 120);
    return makeReport(source, {
      status: "partial",
      fetched: { rankings: rankings.length },
      warnings: ["Rankings fetched but not written: current private inbox has no accepted ranking CSV schema. Use existing Valve sync/admin flow for DB-backed ranking snapshots."],
      writes: []
    });
  } catch (error) {
    return makeReport(source, {
      status: "failed",
      errors: [error instanceof Error ? error.message : "Valve rankings fetch failed."]
    });
  }
}

export function parseStandingsMarkdown(markdown: string, sourceFile: GithubContentItem): ValveRankingRow[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const columns = line.split("|").map((column) => column.trim());
      const rank = Number(columns[1]);
      const points = Number(columns[2]);
      const teamName = stripTags(columns[3] ?? "");
      const roster = stripTags(columns[4] ?? "");
      return {
        externalId: `${sourceFile.name}:${rank}`,
        rank,
        points,
        teamName,
        roster,
        region: sourceFile.name.match(/standings_([a-z]+)_/)?.[1] ?? "global",
        sourceFile: sourceFile.path,
        sourceUrl: sourceFile.download_url ?? ""
      };
    })
    .filter((row) => Number.isFinite(row.rank) && row.teamName);
}

export async function runValveRankingsCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const report = await runValveRankingsFetcher({
    force: Boolean(args.force),
    dryRun: Boolean(args["dry-run"])
  });
  printReport(report);
  if (report.status === "failed") process.exitCode = 1;
}

function githubHeaders(accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    "User-Agent": "CS2MatchPredictionLab-DAL/0.8.6"
  };
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "").trim();
}

if (isDirectRun(import.meta.url)) {
  runValveRankingsCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
