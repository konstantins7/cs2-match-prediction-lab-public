import { tailUserActionLog } from "../src/lib/userActionLogger";

const limit = Number(process.argv[process.argv.indexOf("--limit") + 1] || 50);

tailUserActionLog(Number.isFinite(limit) ? limit : 50).then((lines) => {
  console.log(lines.join("\n"));
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
