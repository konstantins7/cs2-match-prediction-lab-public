import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type IdentifierKind = "hltvTeam" | "hltvMatch" | "liquipediaPage" | "csstatsTeam";

type IdCache = {
  updatedAt: string;
  entries: Record<string, { value: string; source: string; expiresAt: string }>;
};

const defaultPath = path.join(process.cwd(), "data", "cache", "ids.json");
const ttlMs = 7 * 24 * 60 * 60 * 1000;

export async function getCachedIdentifier(kind: IdentifierKind, key: string, now = new Date(), filePath = defaultPath) {
  const cache = await readCache(filePath);
  const entry = cache.entries[cacheKey(kind, key)];
  if (!entry) return "";
  return new Date(entry.expiresAt).getTime() > now.getTime() ? entry.value : "";
}

export async function setCachedIdentifier(kind: IdentifierKind, key: string, value: string, source: string, now = new Date(), filePath = defaultPath) {
  const cache = await readCache(filePath);
  cache.entries[cacheKey(kind, key)] = { value, source, expiresAt: new Date(now.getTime() + ttlMs).toISOString() };
  cache.updatedAt = now.toISOString();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function cacheKey(kind: IdentifierKind, key: string) {
  return `${kind}:${key.trim().toLowerCase()}`;
}

async function readCache(filePath: string): Promise<IdCache> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as IdCache;
  } catch {
    return { updatedAt: new Date(0).toISOString(), entries: {} };
  }
}
