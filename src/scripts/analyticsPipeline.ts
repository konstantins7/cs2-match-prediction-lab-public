import { runAnalyticsPipeline } from "../lib/analyticsPipeline";
import type { ForecastAutopilotMode } from "../lib/autoResearchShared";
import { prisma } from "../lib/prisma";
import { redactString } from "../lib/security/redaction";

type CliArgs = Record<string, string | boolean>;

function parseArgs(argv: string[]) {
  const parsed: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (["dry-run", "force", "savePrediction"].includes(key)) {
      parsed[key] = true;
      continue;
    }
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

function normalizeMode(value: string): ForecastAutopilotMode {
  if (value === "deep") return "deeper";
  if (value === "deeper" || value === "max") return value;
  return "fast";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const matchId = stringArg(args, "matchId");
  if (!matchId) {
    console.error("Usage: npm run data:pipeline -- --matchId <id> --mode fast|deep|max [--dry-run] [--force] [--savePrediction]");
    process.exitCode = 1;
    return;
  }
  const result = await runAnalyticsPipeline(matchId, {
    mode: normalizeMode(stringArg(args, "mode")),
    dryRun: Boolean(args["dry-run"]),
    force: Boolean(args.force),
    savePrediction: Boolean(args.savePrediction)
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(redactString(error instanceof Error ? error.message : "Analytics pipeline failed."));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
