import { spawn } from "node:child_process";

const model = process.env.LOCAL_AI_MODEL || "llama3.2:3b";
const baseUrl = process.env.LOCAL_AI_BASE_URL || "http://127.0.0.1:11434";
const shouldPull = process.argv.includes("--pull");

async function main() {
  const ollama = await run("ollama", ["--version"]);
  if (!ollama.ok) {
    console.log(JSON.stringify({
      ok: false,
      step: "ollama",
      message: "Ollama was not found in PATH. Install it from https://ollama.com, then run pnpm ai:setup again. Windows PowerShell: irm https://ollama.com/install.ps1 | iex",
      env: recommendedEnv()
    }, null, 2));
    return;
  }

  let pull: CommandResult | null = null;
  if (shouldPull) pull = await run("ollama", ["pull", model], 10 * 60_000);

  const tags = await fetchJson(`${baseUrl}/api/tags`).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : "tags failed" }));
  const hasModel = JSON.stringify(tags).includes(model.split(":")[0]);
  const smoke = hasModel
    ? await fetchJson(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, stream: false, format: "json", prompt: "Return {\"ok\":true} as strict JSON." })
      }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : "smoke failed" }))
    : { ok: false, error: `Model ${model} not found. Run: ollama pull ${model}` };

  console.log(JSON.stringify({
    ok: Boolean((smoke as Record<string, unknown>).response) || JSON.stringify(smoke).includes("\"ok\""),
    ollama: ollama.output.trim(),
    model,
    hasModel,
    pull: pull ? { ok: pull.ok, output: pull.output.slice(-500) } : "skipped; pass --pull to download",
    smoke,
    env: recommendedEnv()
  }, null, 2));
}

function recommendedEnv() {
  return {
    ENABLE_LOCAL_AI: "true",
    LOCAL_AI_MODEL: model,
    LOCAL_AI_FINETUNED_MODEL: process.env.LOCAL_AI_FINETUNED_MODEL || "cs2-prediction-finetuned",
    LOCAL_AI_BASE_URL: baseUrl,
    LOCAL_AI_TIMEOUT_MS: "30000"
  };
}

type CommandResult = { ok: boolean; output: string };

function run(command: string, args: string[], timeoutMs = 30_000): Promise<CommandResult> {
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

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
