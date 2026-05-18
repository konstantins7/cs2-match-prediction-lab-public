import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getISODate } from "../data-fetchers/utils";
import { normalizeAwpyJson } from "../parsed-demo/normalize-awpy";

export type ResearchDemoBatchOptions = {
  folder?: string;
  matchId: string;
  teamNames: string[];
  sourceName?: string;
  collectedAt?: string;
  period?: string;
  confidence?: number;
  out?: string;
  dryRun?: boolean;
};

export type ResearchDemoBatchResult = {
  status: "success" | "partial" | "skipped" | "failed";
  out: string;
  jsonFiles: number;
  demFiles: number;
  players: number;
  maps: number;
  warnings: string[];
};

export async function processResearchDemoBatch(options: ResearchDemoBatchOptions): Promise<ResearchDemoBatchResult> {
  const folder = path.resolve(process.cwd(), options.folder ?? path.join("data", "demos"));
  const out = path.resolve(process.cwd(), options.out ?? path.join("data", "private-inbox", "parsed_demo_export.json"));
  const warnings: string[] = [];
  let names: string[] = [];
  try {
    names = await readdir(folder);
  } catch {
    return { status: "skipped", out, jsonFiles: 0, demFiles: 0, players: 0, maps: 0, warnings: [`Demo folder not found: ${folder}.`] };
  }
  const jsonFiles = names.filter((name) => name.toLowerCase().endsWith(".json"));
  const demFiles = names.filter((name) => /\.(dem|dem\.bz2)$/i.test(name));
  if (demFiles.length) warnings.push("Raw .dem files are present, but this branch only normalizes local AWPy JSON exports unless an external parser is run separately.");
  const exports = [];
  for (const fileName of jsonFiles) {
    try {
      const payload = JSON.parse(await readFile(path.join(folder, fileName), "utf8")) as unknown;
      exports.push(normalizeAwpyJson({
        input: payload,
        matchId: options.matchId,
        teamNames: options.teamNames,
        sourceName: options.sourceName ?? "Research AWPy local export",
        collectedAt: options.collectedAt ?? getISODate(),
        period: options.period ?? "research_demo_batch",
        confidence: options.confidence ?? 82
      }));
    } catch (error) {
      warnings.push(`${fileName}: ${error instanceof Error ? error.message : "failed to normalize AWPy JSON"}`);
    }
  }
  if (!exports.length) return { status: warnings.length ? "partial" : "skipped", out, jsonFiles: jsonFiles.length, demFiles: demFiles.length, players: 0, maps: 0, warnings };
  const merged = {
    ...exports[0],
    sourceName: options.sourceName ?? "Research AWPy local export",
    sampleSize: Math.max(...exports.map((item) => item.sampleSize)),
    players: exports.flatMap((item) => item.players),
    maps: exports.flatMap((item) => item.maps),
    teamForms: exports.flatMap((item) => item.teamForms),
    rounds: []
  };
  if (!options.dryRun) {
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  }
  return {
    status: warnings.length ? "partial" : "success",
    out,
    jsonFiles: jsonFiles.length,
    demFiles: demFiles.length,
    players: merged.players.length,
    maps: merged.maps.length,
    warnings
  };
}
