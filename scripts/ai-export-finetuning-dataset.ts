import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const acceptedDir = path.join(root, "data", "cache", "ai-responses", "accepted");
const out = path.join(root, "data", "ai-finetuning", "local_ai_confirmed_dataset.jsonl");

async function main() {
  const files = await readdir(acceptedDir).catch(() => []);
  const lines: string[] = [];
  for (const file of files.filter((entry) => entry.endsWith(".json"))) {
    const parsed = JSON.parse(await readFile(path.join(acceptedDir, file), "utf8")) as Record<string, unknown>;
    lines.push(JSON.stringify({
      source: "local_ai_confirmed_apply",
      matchId: parsed.matchId,
      timestamp: parsed.timestamp,
      messages: [
        { role: "system", content: "Extract CS2 match evidence into normalized analyst sheets." },
        { role: "assistant", content: JSON.stringify({ sheets: parsed.sheets }) }
      ]
    }));
  }
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
  console.log(JSON.stringify({ ok: true, examples: lines.length, out }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
