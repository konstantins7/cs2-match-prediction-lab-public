import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type EnvMergeResult = {
  created: boolean;
  changed: boolean;
  path: string;
  addedKeys: string[];
  preservedKeys: string[];
  recommendedLocalAiEnabled: boolean;
};

const secretKeyPattern = /(KEY|TOKEN|SECRET|PASSWORD|CX|DATABASE_URL)$/i;

export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    result[match[1]] = unquote(match[2].trim());
  }
  return result;
}

export function mergeEnvContent(existingContent: string, exampleContent: string, overrides: Record<string, string>) {
  const existing = parseEnvContent(existingContent);
  const example = parseEnvContent(exampleContent);
  const lines = existingContent.trimEnd() ? existingContent.trimEnd().split(/\r?\n/) : [];
  const existingKeys = new Set(Object.keys(existing));
  const addedKeys: string[] = [];
  const preservedKeys: string[] = [];
  const desired = { ...example, ...overrides };

  for (const [key, value] of Object.entries(desired)) {
    if (existingKeys.has(key)) {
      if (secretKeyPattern.test(key)) preservedKeys.push(key);
      continue;
    }
    lines.push(`${key}=${quote(value)}`);
    addedKeys.push(key);
  }

  return {
    content: `${lines.join("\n")}${lines.length ? "\n" : ""}`,
    addedKeys,
    preservedKeys,
    changed: addedKeys.length > 0
  };
}

export async function ensureEnvLocal(input: {
  root?: string;
  localAiReady?: boolean;
  dryRun?: boolean;
} = {}): Promise<EnvMergeResult> {
  const root = input.root ?? process.cwd();
  const envPath = path.join(root, ".env.local");
  const examplePath = path.join(root, ".env.example");
  const [exampleContent, existingContent] = await Promise.all([
    readFile(examplePath, "utf8"),
    readFile(envPath, "utf8").catch(() => "")
  ]);
  const overrides: Record<string, string> = input.localAiReady
    ? { ENABLE_LOCAL_AI: "true" }
    : { ENABLE_LOCAL_AI: "false" };
  const merged = mergeEnvContent(existingContent, exampleContent, overrides);
  const created = existingContent.length === 0;
  if (!input.dryRun && (created || merged.changed)) {
    await writeFile(envPath, merged.content, "utf8");
  }
  return {
    created,
    changed: created || merged.changed,
    path: envPath,
    addedKeys: merged.addedKeys,
    preservedKeys: merged.preservedKeys,
    recommendedLocalAiEnabled: Boolean(input.localAiReady)
  };
}

function unquote(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function quote(value: string) {
  if (/^(true|false|\d+)$/.test(value)) return value;
  return JSON.stringify(value);
}
