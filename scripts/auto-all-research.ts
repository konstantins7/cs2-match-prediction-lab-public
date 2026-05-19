import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  runAutoAllExtended,
  runAutoAllExtendedCli,
  type ExtendedAutoAllResult
} from "./auto-all-extended";

export type ResearchAutoAllResult = ExtendedAutoAllResult;
export const runAutoAllResearch = runAutoAllExtended;
export const runAutoAllResearchCli = runAutoAllExtendedCli;

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runAutoAllResearchCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
