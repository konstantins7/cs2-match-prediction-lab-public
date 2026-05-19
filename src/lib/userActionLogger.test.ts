import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { logUserAction, redactParams } from "./userActionLogger";

describe("user action logger", () => {
  it("redacts secret-like params recursively", () => {
    expect(redactParams({ token: "abc", nested: { api_key: "secret", safe: "ok" } })).toEqual({
      token: "[REDACTED]",
      nested: { api_key: "[REDACTED]", safe: "ok" }
    });
  });

  it("writes started and completed action entries without secrets", async () => {
    await logUserAction({ actionName: "test_user_action_logger", matchId: "m1", params: { mode: "max", token: "secret-token" }, status: "started" });
    await logUserAction({ actionName: "test_user_action_logger", matchId: "m1", durationMs: 12, status: "completed" });
    const content = await readFile(path.join(process.cwd(), "data", "logs", "user-actions.log"), "utf8");
    expect(content).toContain("test_user_action_logger");
    expect(content).toContain("\"durationMs\":12");
    expect(content).not.toContain("secret-token");
  });
});
