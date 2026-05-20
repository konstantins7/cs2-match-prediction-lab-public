import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { mergeEnvContent } from "./envFile";
import { runCleanup } from "./cleanup";
import { bumpVersion } from "./releaseHelper";
import { redactJson } from "./notifications";

describe("v1.7 automation helpers", () => {
  it("merges env defaults without overwriting existing secret-like values", () => {
    const merged = mergeEnvContent('PANDASCORE_API_KEY="keep-me"\nENABLE_LOCAL_AI=false\n', 'PANDASCORE_API_KEY=""\nENABLE_AUTO_PIPELINE=false\n', {
      ENABLE_LOCAL_AI: "true"
    });
    expect(merged.content).toContain('PANDASCORE_API_KEY="keep-me"');
    expect(merged.content).toContain("ENABLE_AUTO_PIPELINE=false");
    expect(merged.addedKeys).toContain("ENABLE_AUTO_PIPELINE");
    expect(merged.preservedKeys).toContain("PANDASCORE_API_KEY");
  });

  it("cleanup dry-run reports stale files without deleting them", async () => {
    const root = path.join(tmpdir(), `cs2-cleanup-${Date.now()}`);
    const logDir = path.join(root, "data", "logs");
    await mkdir(logDir, { recursive: true });
    const stale = path.join(logDir, "old.log");
    await writeFile(stale, "old", "utf8");
    const old = new Date(Date.now() - 40 * 86_400_000);
    await utimes(stale, old, old);
    const result = await runCleanup({ root });
    expect(result.dryRun).toBe(true);
    expect(result.candidates.some((item) => item.path.endsWith("old.log"))).toBe(true);
    await expect(readFile(stale, "utf8")).resolves.toBe("old");
  });

  it("release helper bumps semantic versions deterministically", () => {
    expect(bumpVersion("1.7.0", "patch")).toBe("1.7.1");
    expect(bumpVersion("1.7.0", "minor")).toBe("1.8.0");
    expect(bumpVersion("1.7.0", "major")).toBe("2.0.0");
  });

  it("redacts secret-looking notification details", () => {
    const redacted = redactJson({ token: "abc123456", nested: { apiKey: "secret" }, ok: "visible" });
    expect(redacted).toEqual({ token: "[REDACTED]", nested: { apiKey: "[REDACTED]" }, ok: "visible" });
  });
});
