import { runCleanup } from "@/lib/automation/cleanup";

const write = process.argv.includes("--write");

runCleanup({ write }).then((result) => {
  console.log(JSON.stringify(result, null, 2));
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
