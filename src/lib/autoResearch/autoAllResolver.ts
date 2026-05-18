import { runAutoFill, type AutoFillMode, type AutoFillResult } from "../../../tools/auto-fill";

export type AutoAllResolverOptions = {
  matchId: string;
  teamNames: [string, string];
  mode?: AutoFillMode;
  dryRun?: boolean;
  env?: Record<string, string | undefined>;
};

export type AutoAllResolverResult = {
  status: "skipped" | "success" | "partial";
  result?: AutoFillResult;
  message: string;
};

export async function runAutoAllResolver(options: AutoAllResolverOptions): Promise<AutoAllResolverResult> {
  const env = options.env ?? process.env;
  if (!enabled(env.ENABLE_AUTO_ALL_RESOLVER)) {
    return {
      status: "skipped",
      message: "ENABLE_AUTO_ALL_RESOLVER=false. Auto-all resolver is available only as an explicit pipeline helper."
    };
  }
  const result = await runAutoFill({
    matchId: options.matchId,
    teamNames: options.teamNames,
    mode: options.mode ?? "fast",
    dryRun: options.dryRun,
    env
  });
  return {
    status: result.stillMissing.length ? "partial" : "success",
    result,
    message: result.nextAction
  };
}

function enabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}
