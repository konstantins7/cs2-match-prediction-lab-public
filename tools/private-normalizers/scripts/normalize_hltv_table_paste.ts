import { isDirectRun, runHltvCli } from "./normalizerCore";

export { inferSheetType, normalizeTablePaste, validateNormalizedCsv, writeNormalizedCsv } from "./normalizerCore";

if (isDirectRun(import.meta.url)) {
  runHltvCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
