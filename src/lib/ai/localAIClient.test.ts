import { describe, expect, it } from "vitest";
import { askLocalAI, isLocalAIEnabled } from "./localAIClient";

describe("localAIClient", () => {
  it("is disabled unless ENABLE_LOCAL_AI=true", async () => {
    expect(isLocalAIEnabled({ ENABLE_LOCAL_AI: "false" })).toBe(false);
    await expect(askLocalAI({
      prompt: "test",
      env: { ENABLE_LOCAL_AI: "false" }
    })).rejects.toThrow(/disabled/i);
  });

  it("calls local Ollama API and caches repeat prompts", async () => {
    let calls = 0;
    const prompt = `unique prompt ${Date.now()} ${Math.random()}`;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(JSON.stringify({ response: "{\"ok\":true}", eval_count: 2 }), { status: 200 });
    };
    const first = await askLocalAI({
      prompt,
      system: "return json",
      env: { ENABLE_LOCAL_AI: "true", LOCAL_AI_BASE_URL: "http://127.0.0.1:11434", LOCAL_AI_MODEL: "test-model" },
      fetchImpl
    });
    const second = await askLocalAI({
      prompt,
      system: "return json",
      env: { ENABLE_LOCAL_AI: "true", LOCAL_AI_BASE_URL: "http://127.0.0.1:11434", LOCAL_AI_MODEL: "test-model" },
      fetchImpl
    });
    expect(first.text).toContain("ok");
    expect(second.cached).toBe(true);
    expect(calls).toBe(1);
  });
});
