import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("data quality problem matches UI", () => {
  it("lazy loads problem matches through the includeProblemMatches API flag", () => {
    const source = readFileSync("src/components/DataQualityProblemMatchesPanel.tsx", "utf8");
    const page = readFileSync("src/app/admin/data-quality/page.tsx", "utf8");

    expect(source).toContain("Показать проблемные матчи");
    expect(source).toContain("/api/admin/data-quality?includeProblemMatches=true");
    expect(source).toContain("Link href={row.href}");
    expect(page).toContain("DataQualityProblemMatchesPanel");
  });
});
