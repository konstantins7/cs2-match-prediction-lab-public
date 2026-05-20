import { rebuildMatchFeatureHistory } from "@/lib/scientific/matchFeatureHistory";

function arg(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const limit = Number(arg("limit") ?? "250");
  const result = await rebuildMatchFeatureHistory(Number.isFinite(limit) ? limit : 250);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
