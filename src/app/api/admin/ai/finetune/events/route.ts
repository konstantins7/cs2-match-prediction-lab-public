import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId") || "";
  const stateDir = path.join(process.cwd(), "data", "cache", "ai-finetune-jobs");
  const files = await readdir(stateDir).catch(() => []);
  const target = jobId ? `${jobId}.json` : files.filter((file) => file.endsWith(".json")).sort().at(-1);
  const state = target ? await readFile(path.join(stateDir, target), "utf8").catch(() => "{}") : "{}";
  return new Response(`data: ${state}\n\n`, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}
