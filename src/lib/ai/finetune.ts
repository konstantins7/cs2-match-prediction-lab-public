import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactString } from "@/lib/security/redaction";

export async function prepareFineTuningDataset(input: { root?: string } = {}) {
  const root = input.root ?? process.cwd();
  const acceptedDir = path.join(root, "data", "cache", "ai-responses", "accepted");
  const out = path.join(root, "data", "ai-finetuning", "sharegpt_local_ai_dataset.jsonl");
  const files = await readdir(acceptedDir).catch(() => []);
  const lines: string[] = [];
  const skipped: string[] = [];
  for (const file of files.filter((entry) => entry.endsWith(".json"))) {
    const parsed = JSON.parse(await readFile(path.join(acceptedDir, file), "utf8")) as {
      matchId?: string;
      inputText?: string;
      sourceSite?: string;
      promptVersion?: string;
      promptVariant?: string;
      sheets?: unknown;
    };
    if (!parsed.inputText || !parsed.sheets) {
      skipped.push(file);
      continue;
    }
    lines.push(JSON.stringify({
      source: "cs2_match_prediction_lab_local_ai",
      matchId: parsed.matchId,
      sourceSite: parsed.sourceSite || "unknown",
      promptVersion: parsed.promptVersion || "unknown",
      promptVariant: parsed.promptVariant || "default",
      messages: [
        { role: "system", content: "Extract CS2 match evidence into normalized analyst sheets. Return strict JSON only." },
        { role: "user", content: redactString(parsed.inputText).slice(0, 60_000) },
        { role: "assistant", content: JSON.stringify({ sheets: parsed.sheets }) }
      ]
    }));
  }
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
  return { ok: true, examples: lines.length, skipped: skipped.length, out, format: "sharegpt-jsonl" };
}
