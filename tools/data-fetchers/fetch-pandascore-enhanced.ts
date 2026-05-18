import { runPandaScoreFetcher, type PandaScoreOptions } from "./fetch-pandascore";
import { makeReport, wait, type FetcherReport } from "./utils";

const source = "pandascore-enhanced";

export type PandaScoreEnhancedOptions = PandaScoreOptions & {
  delayMs?: number;
};

export async function runPandaScoreEnhancedFetcher(options: PandaScoreEnhancedOptions = {}): Promise<FetcherReport> {
  const env = options.env ?? process.env;
  if (!isEnabled(env.ENABLE_PANDASCORE_AUTO_FETCH)) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["ENABLE_PANDASCORE_AUTO_FETCH=false. PandaScore auto-fill skipped."]
    });
  }
  if (!env.PANDASCORE_API_KEY) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["PANDASCORE_API_KEY is not configured."]
    });
  }
  await wait(options.delayMs ?? 1000);
  const report = await runPandaScoreFetcher({
    ...options,
    force: true,
    env: { ...env, ENABLE_PANDASCORE_SYNC: "true" }
  });
  return {
    ...report,
    source,
    warnings: report.warnings.map((warning) => warning.replace("PandaScore", "PandaScore auto-fill"))
  };
}

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}
