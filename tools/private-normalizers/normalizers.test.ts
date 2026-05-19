import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analystSheetTemplates } from "../../src/lib/analystSheetTemplates";
import {
  inferSheetType,
  normalizeTablePaste,
  validateNormalizedCsv,
  writeNormalizedCsv,
  type NormalizerOptions,
  type NormalizerSheetType
} from "./scripts/normalizerCore";

function isApifyResearchBranch() {
  for (const headPath of [path.join(process.cwd(), ".git", "HEAD"), path.join(process.cwd(), ".git")]) {
    try {
      if (readFileSync(headPath, "utf8").trim().endsWith("refs/heads/research/apify-integration")) return true;
    } catch {
      // Try the next Git metadata shape.
    }
  }
  return false;
}

const baseOptions = {
  matchId: "pandascore_match_1488973",
  teamName: "Evo Novo",
  sourceName: "Manual copied table",
  sourceUrl: "https://example.test/source",
  collectedAt: "2026-05-17T10:00:00Z",
  period: "last_3_months",
  confidence: 65
};

function normalize(type: NormalizerSheetType, inputText: string, patch: Partial<NormalizerOptions> = {}) {
  return normalizeTablePaste({
    ...baseOptions,
    type,
    inputText,
    ...patch
  });
}

describe("private normalized table normalizers", () => {
  it("converts generic pasted player table to player_stats.csv", () => {
    const result = normalize("player_stats", [
      "Player\tMaps\tKills\tDeaths\tK-D\tRating\tADR\tKAST",
      "EvoRifler\t12\t190\t170\t1.12\t1.08\t75.4\t72.5%"
    ].join("\n"));
    const validation = validateNormalizedCsv("player_stats", result.csv);
    expect(validation.ok).toBe(true);
    expect(result.csv).toContain("EvoRifler");
    expect(result.csv).toContain("0.725");
    expect(headerPrefix(result.csv, "player_stats")).toBe(true);
  });

  it("converts generic pasted map table to map_stats.csv", () => {
    const result = normalize("map_stats", [
      "Map\tMaps\tWins\tLosses\tWin%\tCT%\tT%",
      "Ancient\t7\t4\t3\t57.1%\t55%\t51%"
    ].join("\n"));
    const validation = validateNormalizedCsv("map_stats", result.csv);
    expect(validation.ok).toBe(true);
    expect(result.csv).toContain("Ancient");
    expect(result.csv).toContain("0.571");
    expect(headerPrefix(result.csv, "map_stats")).toBe(true);
  });

  it("converts generic pasted veto table to veto_history.csv", () => {
    const result = normalize("veto_history", [
      "Map\tSample\tPick%\tBan%\tDecider%",
      "Nuke\t9\t22%\t18%\t10%"
    ].join("\n"));
    const validation = validateNormalizedCsv("veto_history", result.csv);
    expect(validation.ok).toBe(true);
    expect(result.csv).toContain("Nuke");
    expect(result.csv).toContain("0.22");
    expect(headerPrefix(result.csv, "veto_history")).toBe(true);
  });

  it("converts generic pasted roster table to roster.csv", () => {
    const result = normalize("roster", [
      "Player\tRole\tCountry",
      "EvoRifler\trifler\tKZ"
    ].join("\n"));
    const validation = validateNormalizedCsv("roster", result.csv);
    expect(validation.ok).toBe(true);
    expect(result.csv).toContain("EvoRifler");
    expect(headerPrefix(result.csv, "roster")).toBe(true);
  });

  it("infers HLTV-style copied player table without network behavior", () => {
    const pasted = [
      "Player\tMaps\tKills\tDeaths\tRating 2.0\tK-D\tADR\tKAST",
      "EvoRifler\t14\t210\t194\t1.11\t1.08\t74.2\t71.4%"
    ].join("\n");
    expect(inferSheetType(pasted)).toBe("player_stats");
    const result = normalize("player_stats", pasted);
    expect(validateNormalizedCsv("player_stats", result.csv).ok).toBe(true);
  });

  it("rejects missing sourceName and placeholder rows", () => {
    expect(() => normalize("player_stats", "Player\tMaps\tK-D\tRating\nplayer_name\t12\t1.1\t1.05", { sourceName: "" })).toThrow(/sourceName/);
    const result = normalize("player_stats", "Player\tMaps\tK-D\tRating\nplayer_name\t12\t1.1\t1.05");
    const validation = validateNormalizedCsv("player_stats", result.csv);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/placeholder/);
  });

  it("rejects invalid maps and zero sample or confidence", () => {
    const invalidMap = normalize("map_stats", "Map\tMaps\tWins\tLosses\nCache\t7\t4\t3");
    expect(validateNormalizedCsv("map_stats", invalidMap.csv).errors.join(" ")).toMatch(/mapName/);
    expect(() => normalize("map_stats", "Map\tMaps\tWins\tLosses\nAncient\t7\t4\t3", { confidence: 0 })).toThrow(/confidence/);
  });

  it("fails on existing output unless append, replace, or out policy is explicit", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "private-normalizer-"));
    try {
      const result = normalize("roster", "Player\tRole\tCountry\nEvoRifler\trifler\tKZ");
      const target = path.join(temp, "data", "private-inbox", "roster.csv");
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, result.csv, { encoding: "utf8", flag: "wx" }).catch(async () => {
        await rm(target, { force: true });
        await writeFile(target, result.csv, "utf8");
      });
      await expect(writeNormalizedCsv("roster", result.csv, { cwd: temp })).rejects.toThrow(/Target file already exists/);
      await expect(writeNormalizedCsv("roster", result.csv, { cwd: temp, append: true })).resolves.toMatchObject({ rowsWritten: 1 });
      const appended = await readFile(target, "utf8");
      expect(appended.trim().split(/\r?\n/)).toHaveLength(3);
      await expect(writeNormalizedCsv("roster", result.csv, { cwd: temp, replace: true })).resolves.toMatchObject({ rowsWritten: 1 });
      const replaced = await readFile(target, "utf8");
      expect(replaced.trim().split(/\r?\n/)).toHaveLength(2);
      await expect(writeNormalizedCsv("roster", result.csv, { cwd: temp, outputPath: "roster_draft.csv" })).resolves.toMatchObject({ rowsWritten: 1 });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("does not introduce network, browser, Apify, or crawler dependencies", async () => {
    const toolFiles = [
      "tools/private-normalizers/scripts/normalizerCore.ts",
      "tools/private-normalizers/scripts/normalize_generic_table_paste.ts",
      "tools/private-normalizers/scripts/normalize_hltv_table_paste.ts",
      "tools/private-normalizers/scripts/validate_normalized_file.ts"
    ];
    const combined = (await Promise.all(toolFiles.map((file) => readFile(path.join(process.cwd(), file), "utf8")))).join("\n");
    expect(combined).not.toMatch(/fetch\s*\(/);
    expect(combined).not.toMatch(/from\s+["']node:https?["']/);
    expect(combined).not.toMatch(/require\(["'](?:https?|axios|cheerio|puppeteer|playwright|apify)["']\)/);
    expect(combined.toLowerCase()).not.toContain("telegram");
    const pkg = await readFile(path.join(process.cwd(), "package.json"), "utf8");
    const forbiddenDependencyPattern = isApifyResearchBranch() ? /puppeteer|playwright|cheerio|axios/ : /apify|puppeteer|playwright|cheerio|axios/;
    expect(pkg.toLowerCase()).not.toMatch(forbiddenDependencyPattern);
  });
});

function headerPrefix(csv: string, type: NormalizerSheetType) {
  const header = csv.split(/\r?\n/)[0].split(",");
  const expected = analystSheetTemplates[type].columns;
  return expected.every((column, index) => header[index] === column);
}
