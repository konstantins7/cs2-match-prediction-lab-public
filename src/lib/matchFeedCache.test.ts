import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMatchFeedFingerprint, computeMatchFeedDelta, type MatchFeedSnapshotRow } from "./matchFeedCache";
import { hashRawRecord, shouldReconcileRawRecord } from "./sources/sourceReconciler";

function row(overrides: Partial<MatchFeedSnapshotRow> = {}): MatchFeedSnapshotRow {
  const base = {
    key: "pandascore:1",
    id: "pandascore_match_1",
    source: "pandascore",
    sourceMatchId: "1",
    eventName: "Cache Cup",
    status: "upcoming",
    startTime: "2026-05-21T18:00:00.000Z",
    format: "BO3",
    teamAId: "team_a",
    teamBId: "team_b",
    teamAName: "Team A",
    teamBName: "Team B",
    updatedAt: "2026-05-17T10:00:00.000Z"
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    fingerprint: overrides.fingerprint ?? buildMatchFeedFingerprint(merged)
  };
}

describe("match feed cache and diff", () => {
  it("calculates new, updated, unchanged and stale feed rows", () => {
    const unchangedBefore = row({ key: "pandascore:1", sourceMatchId: "1" });
    const updatedBefore = row({ key: "pandascore:2", id: "pandascore_match_2", sourceMatchId: "2", status: "upcoming" });
    const staleBefore = row({ key: "pandascore:3", id: "pandascore_match_3", sourceMatchId: "3" });
    const after = [
      row({ key: "pandascore:1", sourceMatchId: "1" }),
      row({ key: "pandascore:2", id: "pandascore_match_2", sourceMatchId: "2", status: "live" }),
      row({ key: "pandascore:4", id: "pandascore_match_4", sourceMatchId: "4", teamAName: "Team C" })
    ];
    const delta = computeMatchFeedDelta([unchangedBefore, updatedBefore, staleBefore], after, new Set(["pandascore:1", "pandascore:2", "pandascore:4"]));
    expect(delta.counts).toEqual({ new: 1, updated: 1, unchanged: 1, stale: 1 });
    expect(delta.stale[0].key).toBe("pandascore:3");
  });

  it("keeps unchanged raw payloads out of reconciliation through stable hashes", () => {
    const raw = { id: 10, name: "Evo Novo vs WAZABI", opponents: [{ id: 1 }, { id: 2 }] };
    const previousHash = hashRawRecord(raw);
    expect(shouldReconcileRawRecord(previousHash, { opponents: [{ id: 1 }, { id: 2 }], name: "Evo Novo vs WAZABI", id: 10 })).toBe(false);
    expect(shouldReconcileRawRecord(previousHash, { ...raw, status: "running" })).toBe(true);
  });

  it("keeps page render read-only and routes refresh through an explicit button action", () => {
    const home = readFileSync("src/app/page.tsx", "utf8");
    const matches = readFileSync("src/app/matches/page.tsx", "utf8");
    const predictions = readFileSync("src/app/predictions/page.tsx", "utf8");
    const button = readFileSync("src/components/MatchFeedRefreshButton.tsx", "utf8");
    expect(`${home}\n${matches}\n${predictions}`).not.toContain("syncUpcomingMatches(");
    expect(`${home}\n${matches}\n${predictions}`).not.toContain("refreshMatchFeed(");
    expect(button).toContain('action: "refresh_match_feed"');
    expect(button).toContain("Обновить список матчей");
  });
});
