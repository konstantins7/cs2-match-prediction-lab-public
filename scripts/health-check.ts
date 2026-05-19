import { spawn } from "node:child_process";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { redactString } from "../src/lib/security/redaction";

type CheckResult = { name: string; ok: boolean; detail: string };

const root = process.cwd();
const node = process.execPath;
const production = process.argv.includes("--production");
const apiSmoke = process.argv.includes("--api") || Boolean(process.env.HEALTH_BASE_URL);

async function main() {
  const results: CheckResult[] = [];
  results.push(await staticSafety());
  if (production) results.push(productionEnvPosture());
  results.push(await run("lint", [nodeScript("eslint"), ".", "--max-warnings=0"]));
  results.push(await run("next typegen", [nodeScript("next"), "typegen"]));
  results.push(await run("typecheck", [nodeScript("tsc"), "--noEmit", "--incremental", "false"]));
  results.push(await run("test", [nodeScript("vitest"), "run"]));
  results.push(await run("build", [nodeScript("next"), "build"]));
  results.push(await run("cli:data:pipeline", [nodeScript("tsx"), "src/scripts/analyticsPipeline.ts", "--matchId", "pandascore_match_1488973", "--mode", "fast", "--dry-run"]));
  results.push(await run("cli:data:auto-all", [nodeScript("tsx"), "scripts/auto-all.ts", "--matchId", "pandascore_match_1488973", "--teamA", "Evo Novo", "--teamB", "WAZABI", "--mode", "deeper", "--dry-run"]));
  results.push(await run("cli:data:auto-all:extended", [nodeScript("tsx"), "scripts/auto-all-extended.ts", "--matchId", "pandascore_match_1488973", "--teamA", "Evo Novo", "--teamB", "WAZABI", "--mode", "max", "--dry-run"]));
  if (apiSmoke) results.push(...await runApiSmoke(process.env.HEALTH_BASE_URL ?? "http://127.0.0.1:3000"));
  else results.push({ name: "api smoke", ok: true, detail: "Skipped; set HEALTH_BASE_URL or pass --api to probe a running local server." });

  await mkdir(path.join(root, "data", "reports"), { recursive: true });
  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, production, results }, null, 2));
  if (failed.length) process.exitCode = 1;
}

function nodeScript(name: "eslint" | "next" | "tsc" | "vitest" | "tsx") {
  const files = {
    eslint: "node_modules/eslint/bin/eslint.js",
    next: "node_modules/next/dist/bin/next",
    tsc: "node_modules/typescript/bin/tsc",
    vitest: "node_modules/vitest/vitest.mjs",
    tsx: "node_modules/tsx/dist/cli.mjs"
  };
  return path.join(root, files[name]);
}

async function run(name: string, args: string[]): Promise<CheckResult> {
  return new Promise((resolve) => {
    const child = spawn(node, args, { cwd: root, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
    child.on("close", (code) => {
      const output = redactString(Buffer.concat([...chunks, ...errors]).toString("utf8")).trim();
      resolve({
        name,
        ok: code === 0,
        detail: output.split(/\r?\n/).slice(-12).join("\n") || `exit ${code}`
      });
    });
  });
}

async function staticSafety(): Promise<CheckResult> {
  const packageJson = await readFile(path.join(root, "package.json"), "utf8");
  const forbiddenPackages = ["puppeteer", "playwright", "selenium", "cheerio", "jsdom"];
  const packageHits = forbiddenPackages.filter((item) => new RegExp(`"${item}"`).test(packageJson));
  const files = await trackedSourceFiles(root);
  const autoApplyHits: string[] = [];
  const forbiddenUsageHits: string[] = [];
  for (const file of files) {
    const relativePath = relative(file);
    if (relativePath === "scripts/health-check.ts" || relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) continue;
    const text = await readFile(file, "utf8");
    if (text.includes("--auto-apply")) autoApplyHits.push(relativePath);
    if (/(puppeteer|playwright|selenium|cheerio|jsdom|apify-client)/i.test(text) && !/docs[\\/]|README|CHANGELOG|node_modules/.test(relativePath)) {
      forbiddenUsageHits.push(relativePath);
    }
  }
  const hits = [...packageHits.map((hit) => `package:${hit}`), ...autoApplyHits.map((hit) => `auto-apply:${hit}`), ...forbiddenUsageHits.map((hit) => `usage:${hit}`)];
  return { name: "static safety", ok: hits.length === 0, detail: hits.length ? hits.join("\n") : "No forbidden packages/usages or --auto-apply found." };
}

function productionEnvPosture(): CheckResult {
  const errors: string[] = [];
  if (process.env.ENABLE_MOCK_DATA && process.env.ENABLE_MOCK_DATA !== "false") errors.push("ENABLE_MOCK_DATA must be false for production posture.");
  if (process.env.ENABLE_ANALYST_SAMPLE && process.env.ENABLE_ANALYST_SAMPLE !== "false") errors.push("ENABLE_ANALYST_SAMPLE must be false for production posture.");
  return { name: "production env posture", ok: errors.length === 0, detail: errors.join("\n") || "Production-like env flags are safe." };
}

async function runApiSmoke(baseUrl: string): Promise<CheckResult[]> {
  const probes = [
    ["/api/matches?page=1&limit=2", "GET"],
    ["/api/command-center", "GET"],
    ["/api/admin/data-quality", "GET"],
    ["/api/match-features/pandascore_match_1488973", "GET"],
    ["/api/match-analysis/pandascore_match_1488973?mode=deep&v=1", "GET"],
    ["/api/auto-all", "POST"]
  ] as const;
  const results: CheckResult[] = [];
  for (const [pathName, method] of probes) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(`${baseUrl}${pathName}`, {
        method,
        signal: controller.signal,
        headers: method === "POST" ? { "content-type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify({ matchId: "pandascore_match_1488973", teamA: "Evo Novo", teamB: "WAZABI", mode: "fast", dryRun: true }) : undefined
      });
      clearTimeout(timeout);
      results.push({ name: `api:${method} ${pathName}`, ok: response.status >= 200 && response.status < 500, detail: `status ${response.status}` });
    } catch (error) {
      results.push({ name: `api:${method} ${pathName}`, ok: false, detail: error instanceof Error ? error.message : "request failed" });
    }
  }
  return results;
}

async function trackedSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if ([".git", ".next", "node_modules", "data"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await trackedSourceFiles(full));
    else if (/\.(ts|tsx|js|jsx|json|md|prisma)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function relative(file: string) {
  return path.relative(root, file).replace(/\\/g, "/");
}

main().catch((error) => {
  console.error(redactString(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
