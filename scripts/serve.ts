import { spawn } from "node:child_process";
import { runDoctor } from "@/lib/automation/doctor";

const mode = process.argv.includes("--prod") ? "start" : "dev";

void runDoctor().then((result) => {
  const warnings = result.checks.filter((check) => !check.ok);
  for (const warning of warnings) {
    console.warn(`[startup-check] ${warning.name}: ${warning.detail}${warning.fix ? ` Fix: ${warning.fix}` : ""}`);
  }
}).catch((error) => {
  console.warn(`[startup-check] skipped: ${error instanceof Error ? error.message : String(error)}`);
});

const child = spawn("pnpm", [mode], { stdio: "inherit", shell: process.platform === "win32" });
child.on("close", (code) => {
  process.exitCode = code ?? 0;
});
