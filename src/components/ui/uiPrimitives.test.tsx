import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell, ConfidenceRiskExplainer, DataDepthMeter, ForecastStory } from ".";

describe("dark esport dashboard UI primitives", () => {
  it("renders user, analyst, and advanced navigation modes", () => {
    const html = renderToStaticMarkup(<AppShell><div>content</div></AppShell>);
    expect(html).toContain("Матчи");
    expect(html).toContain("Прогнозы");
    expect(html).toContain("Задачи");
    expect(html).toContain("Источники");
    expect(html).toContain("Модель");
    expect(html).toContain("Режим аналитика");
    expect(html).toContain("Расширенно");
    expect(html).toContain("Data pack");
    expect(html).toContain("Training export");
  });

  it("renders data depth, forecast story, and confidence/risk explanation copy", () => {
    const html = renderToStaticMarkup(
      <div>
        <DataDepthMeter depth={{ level: 4, label: "Карты/veto", description: "Есть map stats и veto history." }} />
        <ForecastStory story={{
          known: ["Есть рейтинг"],
          missing: ["Нет player stats"],
          probability: ["Team Strength влияет на вероятность"],
          change: ["Veto может изменить прогноз"],
          nextAction: { label: "Добавить map/veto", href: "/admin/research-queue", reason: "Нужно для L3" }
        }} />
        <ConfidenceRiskExplainer view={{
          confidenceLabel: "Уверенность низкая",
          confidenceReasons: ["Нет player stats"],
          riskReasons: ["Высокая неопределённость"],
          reduceRiskWith: ["Добавить составы"]
        }} />
      </div>
    );
    expect(html).toContain("Глубина данных");
    expect(html).toContain("Почему статус такой?");
    expect(html).toContain("Что известно");
    expect(html).toContain("Чего не хватает");
    expect(html).toContain("Почему вероятность такая");
    expect(html).toContain("Лучшее следующее действие");
    expect(html).toContain("Confidence / Risk");
  });

  it("keeps user-facing app and component copy away from betting/casino language", () => {
    const files = collectFiles("src/app").concat(collectFiles("src/components"));
    const forbidden = /\b(odds|betting|bookmaker|wager|casino|stake)\b|ставка/iu;
    const hits = files
      .filter((file) => !file.endsWith(".test.tsx") && !file.endsWith(".test.ts"))
      .flatMap((file) => {
        const text = readFileSync(file, "utf8");
        return forbidden.test(text) ? [file] : [];
      });
    expect(hits).toEqual([]);
  });
});

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? collectFiles(path) : [path];
  });
}
