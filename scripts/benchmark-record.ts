import { mkdir, readFile, readdir, appendFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const reportArg = arg("--report");
  const reportPath = reportArg ? path.resolve(reportArg) : await latestReport();
  if (!reportPath) throw new Error("No benchmark report found. Pass --report data/reports/benchmark_YYYY-MM-DD.json.");
  const json = JSON.parse(await readFile(reportPath, "utf8")) as { summary?: Record<string, unknown>; mode?: string };
  const summary = json.summary ?? {};
  const out = path.join(process.cwd(), "data", "reports", "history.csv");
  await mkdir(path.dirname(out), { recursive: true });
  const headers = ["recordedAt", "report", "totalMatches", "realForecastReadyBefore", "nearlyReadyBefore", "manualFallbackRequired", "averageElapsedMs"];
  const line = [
    new Date().toISOString(),
    path.basename(reportPath),
    summary.totalMatches ?? 0,
    summary.realForecastReadyBefore ?? 0,
    summary.nearlyReadyBefore ?? 0,
    summary.manualFallbackRequired ?? 0,
    summary.averageElapsedMs ?? 0
  ].join(",");
  try {
    await readFile(out, "utf8");
  } catch {
    await appendFile(out, `${headers.join(",")}\n`, "utf8");
  }
  await appendFile(out, `${line}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, out, report: reportPath }, null, 2));
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function latestReport() {
  const dir = path.join(process.cwd(), "data", "reports");
  const files = await readdir(dir).catch(() => []);
  const reports = files.filter((file) => /^benchmark_.*\.json$/.test(file)).sort();
  const latest = reports.at(-1);
  return latest ? path.join(dir, latest) : "";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
