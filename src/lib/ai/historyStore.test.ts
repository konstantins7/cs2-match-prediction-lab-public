import { describe, expect, it } from "vitest";
import { buildAiHistoryRecord } from "./historyStore";

describe("AI history store", () => {
  it("redacts and truncates input previews by default", () => {
    const record = buildAiHistoryRecord({
      matchId: "match_1",
      status: "success",
      inputText: `token=secret-value ${"A".repeat(100)}`,
      sheetCounts: { roster: 2 },
      warnings: [],
      errors: []
    }, { AI_HISTORY_INPUT_CHARS: "20", AI_HISTORY_FULL_INPUT: "false" });
    expect(record.inputPreview?.length).toBeLessThanOrEqual(40);
    expect(record.inputPreview).not.toContain("secret-value");
    expect(record.sheetCounts.roster).toBe(2);
  });

  it("stores full input only when explicitly enabled", () => {
    const record = buildAiHistoryRecord({
      matchId: "match_1",
      status: "partial",
      inputText: "plain copied match table",
      sheetCounts: {},
      warnings: [],
      errors: []
    }, { AI_HISTORY_FULL_INPUT: "true" });
    expect(record.inputPreview).toBe("plain copied match table");
  });
});
