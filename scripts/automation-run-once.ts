import { runAutomationOnce, type AutomationJobName } from "@/lib/automation/runner";

const args = new Set(process.argv.slice(2));
const jobs = readArg("--jobs")?.split(",").map((item) => item.trim()).filter(Boolean) as AutomationJobName[] | undefined;

runAutomationOnce({ dryRun: args.has("--dry-run"), jobs }).then((result) => {
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
