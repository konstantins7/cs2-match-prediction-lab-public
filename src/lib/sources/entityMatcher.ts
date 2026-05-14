export type EntityType = "team" | "player" | "match" | "tournament";

export type EntityAliasInput = {
  entityType: EntityType | string;
  entityId: string;
  source: string;
  externalId: string;
  alias: string;
  confidence: number;
};

export type KnownEntityInput = {
  id: string;
  name: string;
  normalizedName?: string;
  country?: string | null;
  teamId?: string | null;
  rosterPlayerIds?: string[];
  aliases?: string[];
};

export type ExternalEntityInput = {
  source: string;
  entityType: EntityType | string;
  externalId: string;
  externalName: string;
  country?: string | null;
  teamId?: string | null;
  rosterPlayerIds?: string[];
  raw: unknown;
};

export type EntityMatchResult = {
  source: string;
  entityType: string;
  externalId: string;
  externalName: string;
  matchedEntityId?: string | null;
  confidence: number;
  status: "matched" | "needs_review" | "new_entity";
  reason: string;
  rawJson: string;
};

export function normalizeEntityName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const protectedVariantTokens = new Set(["academy", "junior", "ares", "nxt", "prospects", "young"]);

function tokens(value: string) {
  return new Set(normalizeEntityName(value).split(" ").filter(Boolean));
}

function hasProtectedVariant(value: string) {
  return [...tokens(value)].some((token) => protectedVariantTokens.has(token));
}

export function scoreNameSimilarity(left: string, right: string) {
  const a = normalizeEntityName(left);
  const b = normalizeEntityName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (hasProtectedVariant(a) !== hasProtectedVariant(b)) return 0.15;
  if (a.includes(b) || b.includes(a)) return 0.88;
  const leftTokens = tokens(a);
  const rightTokens = tokens(b);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

export function scoreRosterOverlap(left: string[] = [], right: string[] = []) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((id) => rightSet.has(id)).length;
  return overlap / Math.max(left.length, right.length);
}

export function matchEntity(params: {
  external: ExternalEntityInput;
  aliases: EntityAliasInput[];
  entities: KnownEntityInput[];
}): EntityMatchResult {
  const exactAlias = params.aliases.find(
    (alias) =>
      alias.entityType === params.external.entityType &&
      alias.source === params.external.source &&
      alias.externalId === params.external.externalId
  );
  if (exactAlias) {
    return {
      source: params.external.source,
      entityType: params.external.entityType,
      externalId: params.external.externalId,
      externalName: params.external.externalName,
      matchedEntityId: exactAlias.entityId,
      confidence: Math.max(0.95, exactAlias.confidence),
      status: "matched",
      reason: "Exact alias match by source + externalId.",
      rawJson: JSON.stringify(params.external.raw)
    };
  }

  const scored = params.entities
    .map((entity) => {
      const nameScore = Math.max(
        scoreNameSimilarity(params.external.externalName, entity.name),
        ...(entity.aliases ?? []).map((alias) => scoreNameSimilarity(params.external.externalName, alias))
      );
      const rosterScore =
        params.external.entityType === "team"
          ? scoreRosterOverlap(params.external.rosterPlayerIds, entity.rosterPlayerIds)
          : 0;
      const playerContextScore =
        params.external.entityType === "player"
          ? (params.external.country && entity.country === params.external.country ? 0.08 : 0) +
            (params.external.teamId && entity.teamId === params.external.teamId ? 0.12 : 0)
          : 0;
      const confidence =
        params.external.entityType === "team"
          ? Math.min(
              1,
              Math.max(
                nameScore * 0.72 + rosterScore * 0.28,
                nameScore >= 0.98 ? 0.9 : 0,
                rosterScore >= 0.4 ? 0.56 + rosterScore * 0.32 : 0
              )
            )
          : Math.min(1, Math.max(nameScore * 0.8 + playerContextScore, nameScore >= 0.98 ? 0.9 + playerContextScore : 0));
      return { entity, confidence, nameScore, rosterScore };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  if (!best || best.confidence < 0.45) {
    return {
      source: params.external.source,
      entityType: params.external.entityType,
      externalId: params.external.externalId,
      externalName: params.external.externalName,
      confidence: best?.confidence ?? 0,
      status: "new_entity",
      reason: "No plausible match found.",
      rawJson: JSON.stringify(params.external.raw)
    };
  }

  const status = best.confidence >= 0.82 ? "matched" : "needs_review";
  return {
    source: params.external.source,
    entityType: params.external.entityType,
    externalId: params.external.externalId,
    externalName: params.external.externalName,
    matchedEntityId: best.entity.id,
    confidence: Number(best.confidence.toFixed(3)),
    status,
    reason:
      status === "matched"
        ? "Fuzzy identity confidence is high enough for automatic aliasing."
        : "Possible fuzzy match, but confidence is too low for automatic domain writes.",
    rawJson: JSON.stringify(params.external.raw)
  };
}

export function shouldCreateDomainEntity(result: EntityMatchResult) {
  return result.status === "new_entity" && result.confidence < 0.45;
}

export function shouldAutoAlias(result: EntityMatchResult) {
  return result.status === "matched" && result.confidence >= 0.82 && Boolean(result.matchedEntityId);
}
