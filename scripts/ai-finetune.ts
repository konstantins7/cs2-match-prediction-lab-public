import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataset = path.join(root, "data", "ai-finetuning", "sharegpt_local_ai_dataset.jsonl");
const modelDir = path.join(root, "data", "model", "lora");
const modelfile = path.join(modelDir, "Modelfile");
const targetModel = process.env.LOCAL_AI_FINETUNED_MODEL || "cs2-prediction-finetuned";
const baseModel = process.env.LOCAL_AI_MODEL || "llama3.2:3b";

async function main() {
  const examples = await countExamples();
  if (examples < 50) {
    console.log(JSON.stringify({
      ok: false,
      skipped: true,
      reason: `At least 50 accepted examples are required; found ${examples}.`,
      next: "Use the AI import UI with 'save accepted example', then run pnpm ai:prepare-dataset."
    }, null, 2));
    return;
  }

  const python = await run("python", ["--version"], 10_000);
  if (!python.ok) {
    console.log(JSON.stringify({
      ok: false,
      skipped: true,
      reason: "Python was not found in PATH.",
      next: "Install Python and a LoRA workflow such as Unsloth/Axolotl, or set AI_FINETUNE_COMMAND to your local training command."
    }, null, 2));
    return;
  }

  const command = process.env.AI_FINETUNE_COMMAND;
  if (!command) {
    await writeDefaultModelfile();
    console.log(JSON.stringify({
      ok: false,
      skipped: true,
      examples,
      python: python.output.trim(),
      reason: "AI_FINETUNE_COMMAND is not set. No training was launched.",
      dataset,
      modelfile,
      next: "Run your local LoRA trainer with the dataset, place adapters/GGUF artifacts under data/model/lora, then re-run with AI_CREATE_OLLAMA_MODEL=true."
    }, null, 2));
    return;
  }

  const trained = await run(command, [], 6 * 60 * 60_000);
  await writeDefaultModelfile();
  const created = process.env.AI_CREATE_OLLAMA_MODEL === "true" ? await run("ollama", ["create", targetModel, "-f", modelfile], 10 * 60_000) : null;
  console.log(JSON.stringify({
    ok: trained.ok && (created ? created.ok : true),
    examples,
    trained: { ok: trained.ok, output: trained.output.slice(-1000) },
    ollamaCreate: created ? { ok: created.ok, output: created.output.slice(-1000) } : "skipped; set AI_CREATE_OLLAMA_MODEL=true",
    targetModel
  }, null, 2));
}

async function countExamples() {
  try {
    const text = await readFile(dataset, "utf8");
    return text.split(/\r?\n/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function writeDefaultModelfile() {
  await mkdir(modelDir, { recursive: true });
  const files = await readdir(modelDir).catch(() => []);
  const adapter = files.find((file) => /\.(gguf|safetensors)$/i.test(file));
  await writeFile(modelfile, [
    `FROM ${baseModel}`,
    adapter ? `ADAPTER ./${adapter}` : "# Place LoRA adapter or GGUF artifact in this folder, then re-run ollama create.",
    'PARAMETER temperature 0.1',
    'SYSTEM """Extract CS2 match evidence into normalized analyst sheets. Return strict JSON only."""',
    ""
  ].join("\n"), "utf8");
}

function run(command: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: process.platform === "win32" });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: Buffer.concat(chunks).toString("utf8") });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, output: error.message });
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
