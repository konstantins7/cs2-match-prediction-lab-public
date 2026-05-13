import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import type { SourceName, SourceRecord } from "./types";
import { SOURCE_PRIORITY } from "./types";

export type PrioritizedSourceRecord = {
  source: SourceName;
  capability: string;
  value: unknown;
  sourceConfidence?: number;
};

export type SourceConflict = {
  entityType: string;
  entityId?: string | null;
  field: string;
  preferredSource: SourceName;
  conflictingSources: SourceName[];
  warning: string;
};

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function hashRawRecord(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function shouldReconcileRawRecord(previousHash: string | null | undefined, nextRaw: unknown) {
  return previousHash !== hashRawRecord(nextRaw);
}

export function selectPreferredSourceRecord<T extends PrioritizedSourceRecord>(records: T[]) {
  return [...records].sort((a, b) => {
    const priorityDelta = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source];
    if (priorityDelta !== 0) return priorityDelta;
    return (b.sourceConfidence ?? 0.5) - (a.sourceConfidence ?? 0.5);
  })[0] ?? null;
}

export function detectSourceConflict(params: {
  entityType: string;
  entityId?: string | null;
  field: string;
  records: PrioritizedSourceRecord[];
}): SourceConflict | null {
  const normalized = params.records.map((record) => ({
    ...record,
    normalizedValue: stableStringify(record.value)
  }));
  const uniqueValues = new Set(normalized.map((record) => record.normalizedValue));
  if (uniqueValues.size <= 1) return null;
  const preferred = selectPreferredSourceRecord(params.records);
  if (!preferred) return null;
  return {
    entityType: params.entityType,
    entityId: params.entityId,
    field: params.field,
    preferredSource: preferred.source,
    conflictingSources: params.records.filter((record) => record.source !== preferred.source).map((record) => record.source),
    warning: `Source conflict for ${params.entityType}.${params.field}: ${preferred.source} selected by priority.`
  };
}

export function applySourceConflictPenalty(baseQuality: number, conflicts: number) {
  return Math.max(0, Math.min(100, baseQuality - conflicts * 8));
}

export async function saveExternalSourceRecord(db: PrismaClient, record: SourceRecord) {
  const rawJson = stableStringify(record.raw);
  const nextHash = hashRawRecord(record.raw);
  const existing = await db.externalSourceRecord.findUnique({
    where: {
      source_entityType_externalId: {
        source: record.source,
        entityType: record.entityType,
        externalId: record.externalId
      }
    }
  });
  const changed = shouldReconcileRawRecord(existing?.hash, record.raw);
  const saved = await db.externalSourceRecord.upsert({
    where: {
      source_entityType_externalId: {
        source: record.source,
        entityType: record.entityType,
        externalId: record.externalId
      }
    },
    create: {
      source: record.source,
      externalId: record.externalId,
      entityType: record.entityType,
      entityId: record.entityId,
      rawJson,
      fetchedAt: record.fetchedAt,
      hash: nextHash,
      sourceConfidence: record.sourceConfidence
    },
    update: {
      entityId: record.entityId,
      rawJson,
      fetchedAt: record.fetchedAt,
      hash: nextHash,
      sourceConfidence: record.sourceConfidence
    }
  });

  return { record: saved, changed };
}

export function buildExternalSourceRecordData(record: SourceRecord) {
  return {
    source: record.source,
    externalId: record.externalId,
    entityType: record.entityType,
    entityId: record.entityId ?? null,
    rawJson: stableStringify(record.raw),
    fetchedAt: record.fetchedAt,
    hash: hashRawRecord(record.raw),
    sourceConfidence: record.sourceConfidence
  };
}
