import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import { checkDevLogContent } from "./devLogCheck";

describe("MVP 0.8.4 safety checks", () => {
  it("package version is 0.8.4", () => {
    expect(packageJson.version).toBe("0.8.4");
  });

  it("dev log checker fails when Fast Refresh is caused by runtime errors", () => {
    const result = checkDevLogContent("warn\nFast Refresh had to perform a full reload due to a runtime error.\n");
    expect(result.ok).toBe(false);
    expect(result.matches.length).toBe(1);
  });

  it("plain Fast Refresh reload is warning-only", () => {
    const result = checkDevLogContent("warn\nFast Refresh had to perform a full reload. Read more: https://nextjs.org/docs/messages/fast-refresh-reload\n");
    expect(result.ok).toBe(true);
    expect(result.matches.length).toBe(0);
    expect(result.warnings.length).toBe(1);
  });

  it("dev log checker fails on critical runtime signatures", () => {
    const result = checkDevLogContent("GET / 500 in 42ms\nError: Cannot find module './741.js'\n    at Object.<anonymous> (page.js:1:1)\n");
    expect(result.ok).toBe(false);
    expect(result.matches.length).toBe(3);
  });

  it("dev log checker passes clean content", () => {
    expect(checkDevLogContent("ready on http://127.0.0.1:3012\n").ok).toBe(true);
  });
});
