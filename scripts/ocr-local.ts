import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

type Args = Record<string, string | boolean>;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const image = stringArg(args, "image");
  const out = stringArg(args, "out");
  if (!image) {
    console.log(JSON.stringify({ ok: false, message: "Usage: pnpm ocr:local -- --image path.png [--out text.txt]" }, null, 2));
    return;
  }
  const version = await run("tesseract", ["--version"], 10_000);
  if (!version.ok) {
    console.log(JSON.stringify({
      ok: false,
      message: "Local tesseract CLI was not found in PATH. Use browser OCR or install Tesseract locally.",
      detail: version.output.slice(0, 300)
    }, null, 2));
    return;
  }
  const result = await run("tesseract", [image, "stdout", "-l", stringArg(args, "lang") || "eng"], 60_000);
  if (out && result.ok) await writeFile(out, result.output, "utf8");
  console.log(JSON.stringify({ ok: result.ok, image, out: out || null, chars: result.output.length, text: out ? undefined : result.output }, null, 2));
}

function parseArgs(argv: string[]) {
  const output: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) output[key] = true;
    else {
      output[key] = next;
      index += 1;
    }
  }
  return output;
}

function stringArg(args: Args, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : "";
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
