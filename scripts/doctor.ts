import { runDoctor } from "@/lib/automation/doctor";

runDoctor().then((result) => {
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
