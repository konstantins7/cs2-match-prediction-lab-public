import { runSetupAll } from "@/lib/automation/setup";

const args = new Set(process.argv.slice(2));

runSetupAll({
  skipInstall: args.has("--skip-install"),
  skipServer: args.has("--skip-server"),
  installOllama: args.has("--install-ollama") || process.env.AUTO_INSTALL_OLLAMA === "true",
  pullModel: args.has("--pull-model"),
  dryRun: args.has("--dry-run")
}).then((result) => {
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
