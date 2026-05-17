import { isDirectRun, runGenericCli } from "./normalizerCore";

export { normalizeTablePaste, validateNormalizedCsv, writeNormalizedCsv } from "./normalizerCore";

if (isDirectRun(import.meta.url)) {
  runGenericCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
