import { isDirectRun, runValidateCli } from "./normalizerCore";

export { validateNormalizedCsv } from "./normalizerCore";

if (isDirectRun(import.meta.url)) {
  runValidateCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
