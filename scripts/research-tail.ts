import { tailResearchLog } from "../tools/research/research-log";

const linesArg = process.argv.find((arg) => arg.startsWith("--lines="));
const lines = linesArg ? Number(linesArg.split("=")[1]) : 50;

tailResearchLog(Number.isFinite(lines) ? lines : 50)
  .then((rows) => console.log(rows.join("\n")))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
