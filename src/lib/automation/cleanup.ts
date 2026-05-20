import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export type CleanupCandidate = {
  path: string;
  reason: string;
  bytes: number;
  ageDays: number;
};

export type CleanupResult = {
  dryRun: boolean;
  scanned: number;
  removed: number;
  bytes: number;
  candidates: CleanupCandidate[];
};

const defaultRules = [
  { dir: ["data", "logs"], days: 30, reason: "log older than retention" },
  { dir: ["data", "cache", "ai-responses"], days: 7, reason: "AI response cache older than TTL" },
  { dir: ["data", "cache", "ai-history", "archive"], days: 30, reason: "AI history archive older than retention" },
  { dir: ["data", "runtime"], days: 14, reason: "stale runtime state" }
];

export async function runCleanup(input: { root?: string; write?: boolean; now?: Date } = {}): Promise<CleanupResult> {
  const root = input.root ?? process.cwd();
  const now = input.now?.getTime() ?? Date.now();
  const candidates: CleanupCandidate[] = [];
  let scanned = 0;
  for (const rule of defaultRules) {
    const dir = path.join(root, ...rule.dir);
    await mkdir(dir, { recursive: true }).catch(() => undefined);
    const files = await walk(dir);
    for (const file of files) {
      scanned += 1;
      const item = await stat(file).catch(() => null);
      if (!item?.isFile()) continue;
      const ageDays = (now - item.mtimeMs) / 86_400_000;
      if (ageDays >= rule.days) {
        candidates.push({
          path: file,
          reason: rule.reason,
          bytes: item.size,
          ageDays: Math.round(ageDays)
        });
      }
    }
  }
  if (input.write) {
    for (const candidate of candidates) await rm(candidate.path, { force: true }).catch(() => undefined);
  }
  return {
    dryRun: !input.write,
    scanned,
    removed: input.write ? candidates.length : 0,
    bytes: candidates.reduce((sum, item) => sum + item.bytes, 0),
    candidates
  };
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}
