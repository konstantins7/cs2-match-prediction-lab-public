import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeAwpyJson } from "../tools/parsed-demo/normalize-awpy";

type CliArgs = Record<string, string | boolean>;

export async function runAwpyBatchCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const output = await normalizeAwpyFolder({
    folder: requiredArg(args, "folder"),
    matchId: requiredArg(args, "matchId"),
    teamNames: listArg(args, "teams"),
    sourceName: requiredArg(args, "sourceName"),
    collectedAt: requiredArg(args, "collectedAt"),
    period: requiredArg(args, "period"),
    confidence: numberArg(args, "confidence")
  });
  const out = requiredArg(args, "out");
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await writeFile(out, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    file: out,
    files: output.files.length,
    players: output.players.length,
    maps: output.maps.length,
    note: "File written only; validate/preview/apply through /admin/imports."
  }, null, 2));
}

export async function normalizeAwpyFolder(options: {
  folder: string;
  matchId: string;
  teamNames: string[];
  sourceName: string;
  collectedAt: string;
  period: string;
  confidence: number;
}) {
  const files = (await readdir(options.folder)).filter((file) => file.toLowerCase().endsWith(".json")).sort();
  if (!files.length) throw new Error("No AWPy JSON files found in folder.");
  const exports = [];
  for (const file of files) {
    const input = JSON.parse(await readFile(path.join(options.folder, file), "utf8")) as unknown;
    exports.push({
      file,
      parsed: normalizeAwpyJson({ input, ...options })
    });
  }
  const first = exports[0]?.parsed;
  if (!first) throw new Error("No AWPy JSON files could be normalized.");
  return {
    ...first,
    sourceName: options.sourceName,
    period: options.period,
    sampleSize: exports.reduce((sum, item) => sum + item.parsed.sampleSize, 0),
    files: exports.map((item) => item.file),
    players: exports.flatMap((item) => item.parsed.players),
    maps: exports.flatMap((item) => item.parsed.maps),
    teamForms: exports.flatMap((item) => item.parsed.teamForms),
    rounds: []
  };
}

function parseArgs(argv: string[]) {
  const parsed: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function stringArg(args: CliArgs, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function requiredArg(args: CliArgs, key: string) {
  const value = stringArg(args, key);
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function listArg(args: CliArgs, key: string) {
  return requiredArg(args, key).split(",").map((value) => value.trim()).filter(Boolean);
}

function numberArg(args: CliArgs, key: string) {
  const parsed = Number(requiredArg(args, key));
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${key} must be greater than 0.`);
  return parsed;
}

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runAwpyBatchCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
