import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI dashboard and history UI contracts", () => {
  it("dashboard exposes Ollama test, cache and fine-tuning controls", () => {
    const source = readFileSync("src/components/AiDashboardPanel.tsx", "utf8");
    expect(source).toContain("/api/admin/ai/dashboard");
    expect(source).toContain("/api/admin/ai/test");
    expect(source).toContain("/api/admin/ai/cache/clear");
    expect(source).toContain("/api/admin/ai/finetune");
  });

  it("history page exposes filters, CSV export and delete confirmation", () => {
    const source = readFileSync("src/components/AiHistoryPanel.tsx", "utf8");
    expect(source).toContain("/api/admin/ai/history");
    expect(source).toContain("DELETE_AI_HISTORY");
    expect(source).toContain("Export CSV");
  });

  it("AI extractor shows diagnostics, cancel, clipboard and research merge controls", () => {
    const source = readFileSync("src/components/AiDataExtractor.tsx", "utf8");
    expect(source).toContain("DiagnosticsPanel");
    expect(source).toContain("AbortController");
    expect(source).toContain("navigator.clipboard.readText");
    expect(source).toContain("Объединить и применить");
  });
});
