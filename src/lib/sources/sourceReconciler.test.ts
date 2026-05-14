import { describe, expect, it } from "vitest";
import { applySourceConflictPenalty, buildExternalSourceRecordData, detectSourceConflict, selectPreferredSourceRecord, shouldReconcileRawRecord, hashRawRecord } from "./sourceReconciler";

describe("sourceReconciler", () => {
  it("skips unchanged raw hash during incremental sync", () => {
    const raw = { id: 1, name: "Aurora Five" };
    const previousHash = hashRawRecord(raw);
    expect(shouldReconcileRawRecord(previousHash, { name: "Aurora Five", id: 1 })).toBe(false);
  });

  it("triggers reconciliation when raw hash changes", () => {
    const previousHash = hashRawRecord({ id: 1, name: "Aurora Five" });
    expect(shouldReconcileRawRecord(previousHash, { id: 1, name: "Aurora Five", rank: 12 })).toBe(true);
  });

  it("builds raw ExternalSourceRecord data with stable hash", () => {
    const data = buildExternalSourceRecordData({
      source: "pandascore",
      externalId: "ps-1",
      entityType: "team",
      raw: { name: "Aurora Five", id: 1 },
      fetchedAt: new Date("2026-05-12T08:00:00.000Z"),
      sourceConfidence: 0.78
    });
    expect(data.rawJson).toContain("Aurora Five");
    expect(data.hash).toHaveLength(64);
  });

  it("selects Valve rankings over PandaScore in free-first priority", () => {
    const selected = selectPreferredSourceRecord([
      { source: "pandascore", capability: "detailed-stats", value: 1, sourceConfidence: 0.95 },
      { source: "valve-rankings", capability: "rankings", value: 2, sourceConfidence: 0.7 }
    ]);
    expect(selected?.source).toBe("valve-rankings");
  });

  it("detects source conflicts and lowers data quality", () => {
    const conflict = detectSourceConflict({
      entityType: "match",
      entityId: "match_1",
      field: "winnerTeamId",
      records: [
        { source: "grid", capability: "results", value: "team_a" },
        { source: "pandascore", capability: "results", value: "team_b" }
      ]
    });
    expect(conflict?.preferredSource).toBe("pandascore");
    expect(applySourceConflictPenalty(82, 2)).toBe(66);
  });
});
