import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ScientificAnalysisPanel smart analytics UI", () => {
  it("contains v1.6 smart analytics blocks and print-friendly HTML export", () => {
    const source = readFileSync("src/components/ScientificAnalysisPanel.tsx", "utf8");
    expect(source).toContain("Похожие матчи");
    expect(source).toContain("Аномалии");
    expect(source).toContain("Сравнение моделей");
    expect(source).toContain("Рекомендации по данным");
    expect(source).toContain("Экспорт отчёта (HTML)");
    expect(source).toContain("window.print()");
    expect(source).not.toContain("puppeteer");
  });

  it("backtesting exposes advisory model selector and CSV export", () => {
    const page = readFileSync("src/app/admin/backtesting/page.tsx", "utf8");
    expect(page).toContain("Advisory model comparison");
    expect(page).toContain("Export CSV");
    expect(page).toContain("ensemble");
  });
});
