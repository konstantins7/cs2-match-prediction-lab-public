import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("private normalized inbox validation flow", () => {
  it("runs core normalized file validation before analyst apply path", async () => {
    const source = await readFile(path.join(process.cwd(), "src/lib/privateNormalizedInbox.ts"), "utf8");
    expect(source).toContain("validateNormalizedFile");
    expect(source.indexOf("const coreValidation")).toBeLessThan(source.indexOf("const validation = await validateAnalystSheetImport"));
    expect(source).toContain("Core normalized file validation failed; Apply path was not called.");
  });
});
