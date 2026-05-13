import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import { checkDevLogContent } from "./devLogCheck";

describe("MVP 0.3.5 safety checks", () => {
  it("package version is 0.3.5", () => {
    expect(packageJson.version).toBe("0.3.5");
  });

  it("dev log checker fails when runtime or Fast Refresh errors exist", () => {
    const result = checkDevLogContent("warn\nFast Refresh had to perform a full reload due to a runtime error.\n");
    expect(result.ok).toBe(false);
    expect(result.matches.length).toBe(1);
  });

  it("dev log checker passes clean content", () => {
    expect(checkDevLogContent("ready on http://127.0.0.1:3012\n").ok).toBe(true);
  });
});
