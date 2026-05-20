import { describe, expect, it } from "vitest";
import { detectSource, sourcePromptFragment } from "./sourceDetection";

describe("local AI source detection", () => {
  it("detects common CS2 source pages conservatively", () => {
    expect(detectSource("Rating 2.0 table copied from HLTV", "hltv.org match")).toBe("hltv");
    expect(detectSource("Current roster and transfers", "liquipedia.net/counterstrike")).toBe("liquipedia");
    expect(detectSource("IEM bracket", "esl.com")).toBe("esl");
    expect(detectSource("BLAST Premier schedule", "blast.tv")).toBe("blast");
    expect(detectSource("plain copied text")).toBe("other");
  });

  it("has source-specific prompt fragments", () => {
    expect(sourcePromptFragment("hltv")).toMatch(/Rating 2\.0/);
    expect(sourcePromptFragment("liquipedia")).toMatch(/roster/i);
  });
});
