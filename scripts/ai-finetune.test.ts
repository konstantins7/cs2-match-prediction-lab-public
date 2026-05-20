import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI fine-tuning scripts", () => {
  it("prepare script writes ShareGPT-style JSONL from accepted local examples", () => {
    const source = readFileSync("scripts/ai-prepare-dataset.ts", "utf8");
    expect(source).toContain("sharegpt_local_ai_dataset.jsonl");
    expect(source).toContain("messages");
    expect(source).toContain("redactString");
  });

  it("finetune script is optional and never installs Python dependencies automatically", () => {
    const source = readFileSync("scripts/ai-finetune.ts", "utf8");
    expect(source).toContain("At least 50 accepted examples");
    expect(source).toContain("AI_FINETUNE_COMMAND");
    expect(source).toContain("ollama");
    expect(source).not.toContain("pip install");
  });
});
