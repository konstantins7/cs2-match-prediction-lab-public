import { describe, expect, it } from "vitest";
import { matchEntity, shouldAutoAlias, shouldCreateDomainEntity } from "./entityMatcher";

const entities = [
  { id: "team_aurora_five", name: "Aurora Five", country: "CA", rosterPlayerIds: ["p1", "p2", "p3", "p4", "p5"] },
  { id: "team_nordic_pulse", name: "Nordic Pulse", country: "SE", rosterPlayerIds: ["n1", "n2", "n3", "n4", "n5"] }
];

describe("entityMatcher", () => {
  it("matches exact aliases by source and externalId", () => {
    const result = matchEntity({
      external: { source: "pandascore", entityType: "team", externalId: "ps-1", externalName: "Different Name", raw: {} },
      aliases: [{ entityType: "team", entityId: "team_aurora_five", source: "pandascore", externalId: "ps-1", alias: "Aurora Five", confidence: 0.97 }],
      entities
    });
    expect(result.status).toBe("matched");
    expect(result.matchedEntityId).toBe("team_aurora_five");
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("matches fuzzy names with high confidence", () => {
    const result = matchEntity({
      external: { source: "valve-rankings", entityType: "team", externalId: "vr-aurora", externalName: "Aurora Five", raw: {} },
      aliases: [],
      entities
    });
    expect(result.status).toBe("matched");
    expect(result.matchedEntityId).toBe("team_aurora_five");
    expect(shouldAutoAlias(result)).toBe(true);
  });

  it("uses roster overlap for team matching", () => {
    const result = matchEntity({
      external: { source: "liquipedia", entityType: "team", externalId: "lp-a5", externalName: "Aurora 5", rosterPlayerIds: ["p1", "p2", "p3"], raw: {} },
      aliases: [],
      entities
    });
    expect(result.matchedEntityId).toBe("team_aurora_five");
    expect(result.confidence).toBeGreaterThan(0.55);
  });

  it("uses nickname, country, and team context for player matching", () => {
    const result = matchEntity({
      external: { source: "pandascore", entityType: "player", externalId: "ps-player", externalName: "A-Star", country: "CA", teamId: "team_aurora_five", raw: {} },
      aliases: [],
      entities: [{ id: "player_a_star", name: "A Star", country: "CA", teamId: "team_aurora_five" }]
    });
    expect(result.status).toBe("matched");
    expect(result.matchedEntityId).toBe("player_a_star");
  });

  it("marks low confidence candidates as needs_review and avoids duplicate creation", () => {
    const result = matchEntity({
      external: { source: "pandascore", entityType: "team", externalId: "ps-uncertain", externalName: "Aurora", raw: {} },
      aliases: [],
      entities
    });
    expect(result.status).toBe("needs_review");
    expect(shouldCreateDomainEntity(result)).toBe(false);
  });

  it("protects academy aliases from auto-matching main teams", () => {
    const result = matchEntity({
      external: { source: "pandascore", entityType: "team", externalId: "ps-g2-ares", externalName: "G2 Ares", raw: {} },
      aliases: [],
      entities: [{ id: "team_g2", name: "G2 Esports", aliases: ["G2"] }]
    });
    expect(result.status).not.toBe("matched");
    expect(shouldAutoAlias(result)).toBe(false);
  });
});
