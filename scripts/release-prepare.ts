import { planRelease, type ReleaseBump } from "@/lib/automation/releaseHelper";

const args = new Set(process.argv.slice(2));
const bump: ReleaseBump = args.has("--major") ? "major" : args.has("--minor") ? "minor" : "patch";

planRelease({
  bump,
  dryRun: args.has("--dry-run"),
  push: args.has("--push"),
  githubRelease: args.has("--github-release")
}).then((result) => {
  console.log(JSON.stringify(result, null, 2));
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
