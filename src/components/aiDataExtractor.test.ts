import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AiDataExtractor UI", () => {
  it("supports local OCR and routes apply through the local AI API", () => {
    const source = readFileSync("src/components/AiDataExtractor.tsx", "utf8");
    expect(source).toContain("Быстрый AI импорт");
    expect(source).toContain("/api/ai/extract-local");
    expect(source).toContain("/api/ai/apply-local");
    expect(source).toContain("tesseract.js");
    expect(source).toContain("image/png,image/jpeg,image/webp");
    expect(source).toContain(".txt,.html,.md");
    expect(source).toContain("Дополнить AI данными");
    expect(source).toContain("autoApply");
  });
});
