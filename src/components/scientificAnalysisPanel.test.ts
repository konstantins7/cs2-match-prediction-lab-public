import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("scientific analysis UI", () => {
  it("adds a dedicated match tab and local controls", () => {
    const tabs = readFileSync("src/components/MatchDetailTabs.tsx", "utf8");
    const panel = readFileSync("src/components/ScientificAnalysisPanel.tsx", "utf8");
    expect(tabs).toContain("Научный анализ");
    expect(tabs).toContain("ScientificAnalysisPanel");
    expect(panel).toContain("eloWeight");
    expect(panel).toContain("Download scientific metrics CSV");
    expect(panel).toContain("Player-map efficiency");
  });
});
