import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataConnectors } from "./dataConnectorRegistry";
import { detectPrivateInboxFileType, isTrustedLocalImportEnabled } from "./privateNormalizedInbox";

describe("MVP 0.8.4 data gap resolver", () => {
  it("defines resolver outputs and uniform connector results", () => {
    const resolver = readFileSync("src/lib/dataGapResolver.ts", "utf8");
    const registry = readFileSync("src/lib/dataConnectorRegistry.ts", "utf8");
    expect(resolver).toContain("resolveMatchDataGaps");
    expect(resolver).toContain("missingBlocks");
    expect(resolver).toContain("connectorResults");
    expect(resolver).toContain("recordsCreated");
    expect(resolver).toContain("recordsUpdated");
    expect(registry).toContain("export type ConnectorResult");
    expect(registry).toContain("normalizedPayloadSummary");
    expect(registry).toContain("success");
    expect(registry).toContain("partial");
    expect(registry).toContain("missing");
    expect(registry).toContain("blocked");
    expect(registry).toContain("error");
  });

  it("keeps connector policy explicit and forbidden connectors unable to auto-run", () => {
    const byId = new Map(dataConnectors.map((connector) => [connector.id, connector]));
    for (const id of ["hltv_automatic_scraper", "apify", "browser_crawler", "telegram_scraping", "unsupported_grid_apis", "fake_imputed_data"]) {
      expect(byId.get(id)?.legalStatus).toBe("forbidden");
      expect(byId.get(id)?.canAutoRun).toBe(false);
    }
    expect(byId.get("private_normalized_inbox")).toMatchObject({ canAutoRun: true, legalStatus: "user_provided" });
    expect(byId.get("generic_website_table_adapter")).toMatchObject({ canAutoRun: false, mode: "disabled" });
  });

  it("detects accepted private inbox files and rejects unsupported/raw inputs", () => {
    expect(detectPrivateInboxFileType("roster.csv")).toBe("roster");
    expect(detectPrivateInboxFileType("player_stats.csv")).toBe("player_stats");
    expect(detectPrivateInboxFileType("map_stats.csv")).toBe("map_stats");
    expect(detectPrivateInboxFileType("veto_history.csv")).toBe("veto_history");
    expect(detectPrivateInboxFileType("manual_real_pack.json")).toBe("manual_real_pack");
    expect(detectPrivateInboxFileType("parsed_demo_export.json")).toBe("parsed_demo_export");
    expect(detectPrivateInboxFileType("raw_hltv.html")).toBe("unsupported");
    expect(detectPrivateInboxFileType("crawler-config.json")).toBe("unsupported");
  });

  it("keeps trusted local imports disabled by default", () => {
    expect(isTrustedLocalImportEnabled({})).toBe(false);
    expect(isTrustedLocalImportEnabled({ ENABLE_TRUSTED_LOCAL_IMPORTS: "false" })).toBe(false);
    expect(isTrustedLocalImportEnabled({ ENABLE_TRUSTED_LOCAL_IMPORTS: "true" })).toBe(true);
  });

  it("wires resolver into full analysis timeline without direct manual CSV apply", () => {
    const implementation = readFileSync("src/lib/fullMatchAnalysis.ts", "utf8");
    expect(implementation).toContain("resolveMatchDataGaps");
    expect(implementation).toContain("dataGapResolution");
    expect(implementation).toContain("Проверяю private normalized inbox");
    expect(implementation).toContain("connectorResults");
    expect(implementation).not.toContain("applyAnalystSheetImport");
  });

  it("documents no scraper dependencies or gate changes", () => {
    const packageJson = readFileSync("package.json", "utf8").toLowerCase();
    const readme = readFileSync("README.md", "utf8");
    const registry = readFileSync("src/lib/dataConnectorRegistry.ts", "utf8").toLowerCase();
    expect(packageJson).not.toMatch(/apify|puppeteer|playwright/);
    expect(registry).toContain("forbidden");
    expect(readme).toContain("ENABLE_TRUSTED_LOCAL_IMPORTS=false");
    expect(readme).toContain("Forecast math, Real Forecast Ready gates");
    expect(readme).toContain("HLTV automatic scraper");
  });
});
