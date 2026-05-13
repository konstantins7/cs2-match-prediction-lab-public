import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { checkDevLogContent } from "../lib/devLogCheck";

const logPath = resolve(process.cwd(), "dev-server.err.log");

if (!existsSync(logPath)) {
  console.log("dev-server.err.log does not exist; no runtime errors found.");
  process.exit(0);
}

const result = checkDevLogContent(readFileSync(logPath, "utf8"));

if (!result.ok) {
  console.error("Fresh dev log contains runtime/Fast Refresh/Prisma errors:");
  for (const match of result.matches) console.error(`- ${match}`);
  process.exit(1);
}

console.log("Fresh dev log clean: no runtime/Fast Refresh/Prisma unknown-field errors found.");
