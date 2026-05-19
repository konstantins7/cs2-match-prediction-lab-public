import { describe, expect, it } from "vitest";
import { logResearchEvent, tailResearchLog } from "./research-log";

describe("research logging", () => {
  it("redacts token-like values before writing logs", async () => {
    await logResearchEvent({
      level: "WARN",
      source: "google-cse",
      message: "quotaExceeded api_key=abc123 token=secret",
      url: "https://example.com/search?key=abc123"
    });
    const content = (await tailResearchLog(1)).join("\n");
    expect(content).not.toContain("abc123");
    expect(content).not.toContain("secret");
    expect(content).toContain("[REDACTED]");
  });
});
