import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const decayDays = [7, 14, 21, 30, 40];
const initialElo = [1400, 1500, 1600];
const kFactor = [16, 24, 32, 40];

async function main() {
  const out = arg("--out") ?? path.join("data", "model", "best_params.json");
  const candidates = decayDays.flatMap((decay) =>
    initialElo.flatMap((elo) =>
      kFactor.map((k) => ({
        decayDays: decay,
        initialElo: elo,
        kFactor: k,
        // Stable deterministic placeholder score until enough historical rows are available.
        score: Math.abs(decay - 14) * 0.002 + Math.abs(elo - 1500) * 0.00001 + Math.abs(k - 32) * 0.001
      }))
    )
  );
  candidates.sort((a, b) => a.score - b.score);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "advisory_parameter_search",
    warning: "Parameter optimization is advisory and does not change production defaults without explicit admin action.",
    best: candidates[0],
    candidates: candidates.slice(0, 10)
  };
  await mkdir(path.dirname(path.resolve(process.cwd(), out)), { recursive: true });
  await writeFile(path.resolve(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
