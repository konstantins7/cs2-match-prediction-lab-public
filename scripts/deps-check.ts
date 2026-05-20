import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

execFileAsync("pnpm", ["outdated"], { timeout: 120_000, windowsHide: true, shell: process.platform === "win32" }).then((result) => {
  console.log(result.stdout || "Dependencies are up to date.");
}).catch((error: unknown) => {
  const output = typeof error === "object" && error && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
  if (output) console.log(output);
  else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});
