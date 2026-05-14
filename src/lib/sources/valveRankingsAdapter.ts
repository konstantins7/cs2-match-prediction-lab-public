import { arrayFromPayload, fetchJsonDetailed, resultFromRecords, sourceRecordFromRaw } from "./adapterUtils";
import type { SourceAdapter } from "./types";
import { buildSourceStatus, disabledResult, envFlag, failedResult, SOURCE_PRIORITY } from "./types";

const source = "valve-rankings" as const;
const capabilities = ["rankings", "teams"] as const;
const requiredEnv = ["ENABLE_VALVE_RANKINGS_SYNC"];
const valveRepoLive = "https://api.github.com/repos/ValveSoftware/counter-strike_regional_standings/contents/live";

type GithubContentItem = {
  name: string;
  type: "file" | "dir";
  path: string;
  download_url?: string | null;
};

function parseStandingsMarkdown(markdown: string, sourceFile: GithubContentItem) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const columns = line.split("|").map((column) => column.trim());
      const rank = Number(columns[1]);
      const points = Number(columns[2]);
      const teamName = columns[3]?.replace(/<[^>]+>/g, "").trim();
      const roster = columns[4]?.replace(/<[^>]+>/g, "").trim();
      return {
        externalId: `${sourceFile.name}:${rank}`,
        rank,
        points,
        teamName,
        roster,
        region: sourceFile.name.match(/standings_([a-z]+)_/)?.[1] ?? "global",
        sourceFile: sourceFile.path,
        sourceUrl: sourceFile.download_url
      };
    })
    .filter((row) => Number.isFinite(row.rank) && row.teamName);
}

export const valveRankingsAdapter: SourceAdapter = {
  name: source,
  label: "Valve Regional Standings",
  priority: SOURCE_PRIORITY[source],
  capabilities: [...capabilities],
  requiredEnv,
  status() {
    const enabled = envFlag("ENABLE_VALVE_RANKINGS_SYNC");
    return buildSourceStatus({
      source,
      label: "Valve Regional Standings",
      priority: SOURCE_PRIORITY[source],
      capabilities: [...capabilities],
      requiredEnv,
      enabled,
      configured: true,
      message: enabled ? "Enabled for public Valve ranking metadata sync from GitHub." : "Disabled: set ENABLE_VALVE_RANKINGS_SYNC=true."
    });
  },
  async sync(context) {
    const status = this.status();
    if (!status.enabled) return disabledResult(source, context.jobType, status.message);
    if (context.jobType !== "valve_rankings" && context.jobType !== "teams") {
      return failedResult(source, context.jobType, `Valve rankings adapter supports rankings/team rank jobs, not ${context.jobType}.`);
    }
    try {
      const live = await fetchJsonDetailed(valveRepoLive, {}, context.fetchImpl);
      const years = arrayFromPayload(live.payload) as GithubContentItem[];
      const latestYear = years.filter((item) => item.type === "dir").sort((a, b) => b.name.localeCompare(a.name))[0];
      if (!latestYear) throw new Error("Valve rankings live directory has no year folders.");
      const yearUrl = `https://api.github.com/repos/ValveSoftware/counter-strike_regional_standings/contents/${latestYear.path}`;
      const yearPayload = await fetchJsonDetailed(yearUrl, {}, context.fetchImpl);
      const files = (arrayFromPayload(yearPayload.payload) as GithubContentItem[])
        .filter((item) => item.type === "file" && item.name.startsWith("standings_") && item.name.endsWith(".md"))
        .sort((a, b) => a.name.localeCompare(b.name));
      const latestGlobal = files.filter((file) => file.name.includes("standings_global_")).at(-1) ?? files.at(-1);
      if (!latestGlobal?.download_url) throw new Error("Valve rankings has no downloadable standings markdown.");
      const markdownResponse = await (context.fetchImpl ?? fetch)(latestGlobal.download_url, {
        headers: { Accept: "text/plain", "User-Agent": "CS2-Match-Prediction-Lab/0.3 research-dashboard" }
      });
      if (!markdownResponse.ok) throw new Error(`HTTP ${markdownResponse.status} ${markdownResponse.statusText}`);
      const markdown = await markdownResponse.text();
      const fetchedAt = context.now ?? new Date();
      const standings = parseStandingsMarkdown(markdown, latestGlobal).slice(0, 120);
      const records = standings.map((raw) =>
        sourceRecordFromRaw({
          source,
          entityType: "valve_ranking",
          raw,
          fetchedAt,
          externalId: String(raw.externalId),
          sourceConfidence: 0.9
        })
      );
      return resultFromRecords({
        source,
        jobType: context.jobType,
        records,
        notes: "Valve rankings synced from public GitHub standings markdown.",
        endpoint: latestGlobal.download_url,
        method: "GET",
        rawSample: standings[0] ?? null
      });
    } catch (error) {
      return failedResult(source, context.jobType, error instanceof Error ? error.message : "Valve rankings sync failed.");
    }
  }
};
