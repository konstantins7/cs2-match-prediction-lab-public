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
  console.error("Fresh dev log contains critical runtime/Prisma/module/500 errors:");
  for (const match of result.matches) console.error(`- ${match}`);
  process.exit(1);
}

if (result.warnings.length > 0) {
  console.warn("Fresh dev log has Fast Refresh warnings, but no critical runtime errors:");
  for (const warning of result.warnings) console.warn(`- ${warning}`);
} else {
  console.log("Fresh dev log clean: no critical runtime errors or Fast Refresh warnings found.");
}
