import { resultFromRecords, sourceRecordFromRaw } from "./adapterUtils";
import type { SourceAdapter } from "./types";
import { buildSourceStatus, SOURCE_PRIORITY } from "./types";

const source = "manual" as const;
const capabilities = ["manual", "matches", "teams", "players", "rosters", "meta"] as const;

function parseManualPayload(payload?: string) {
  if (!payload?.trim()) return [];
  const trimmed = payload.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  const [headerLine, ...lines] = trimmed.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split(",").map((item) => item.trim());
  return lines.map((line) => {
    const values = line.split(",").map((item) => item.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function normalizeManualRecord(raw: unknown, index: number) {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (record.rank && record.teamName) {
    return {
      entityType: "hltv_manual_ranking",
      externalId: String(record.hltvReferenceUrl ?? `hltv-manual-${record.rankingDate ?? "unknown"}-${record.rank}-${record.teamName}`),
      raw: { ...record, source: "hltv_manual_reference" }
    };
  }
  if (record.teamA && record.teamB) {
    const teamA = String(record.teamA);
    const teamB = String(record.teamB);
    return {
      entityType: "match",
      externalId: String(record.id ?? `manual-match-${Date.parse(String(record.startTime ?? "")) || index}-${teamA}-${teamB}`),
      raw: {
        ...record,
        sourceMode: "manual_real",
        opponents: [
          { opponent: { id: teamA.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: teamA, country: record.teamACountry ?? "unknown" } },
          { opponent: { id: teamB.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: teamB, country: record.teamBCountry ?? "unknown" } }
        ],
        begin_at: record.startTime,
        number_of_games: String(record.format ?? "BO3").toUpperCase() === "BO1" ? 1 : String(record.format ?? "BO3").toUpperCase() === "BO5" ? 5 : 3,
        tournament: { name: record.eventName ?? "Manual CS2 event" },
        serie: { name: record.stage ?? "Manual import" },
        winner_id: record.winner ? String(record.winner).toLowerCase().replace(/[^a-z0-9]+/g, "-") : undefined
      }
    };
  }
  const entityType = typeof record.entityType === "string" ? record.entityType : "manual_import";
  return {
    entityType,
    externalId: String(record.id ?? record.externalId ?? record.name ?? `manual-${index}`),
    raw: { ...record, sourceMode: "manual_real" }
  };
}

export const manualImportAdapter: SourceAdapter = {
  name: source,
  label: "Manual import",
  priority: SOURCE_PRIORITY[source],
  capabilities: [...capabilities],
  requiredEnv: [],
  status() {
    return buildSourceStatus({
      source,
      label: "Manual import",
      priority: SOURCE_PRIORITY[source],
      capabilities: [...capabilities],
      requiredEnv: [],
      enabled: true,
      configured: true,
      message: "Manual JSON/CSV import is available as fallback/override."
    });
  },
  async sync(context) {
    try {
      const fetchedAt = context.now ?? new Date();
      const parsedPayload = parseManualPayload(context.payload);
      const parsed =
        parsedPayload.length === 1 &&
        parsedPayload[0] &&
        typeof parsedPayload[0] === "object" &&
        Array.isArray((parsedPayload[0] as Record<string, unknown>).matches)
          ? ((parsedPayload[0] as Record<string, unknown>).matches as unknown[])
          : parsedPayload.length === 1 &&
              parsedPayload[0] &&
              typeof parsedPayload[0] === "object" &&
              (parsedPayload[0] as Record<string, unknown>).source === "hltv_manual_reference" &&
              Array.isArray((parsedPayload[0] as Record<string, unknown>).teams)
            ? ((parsedPayload[0] as Record<string, unknown>).teams as unknown[]).map((team) => ({
                ...(team as Record<string, unknown>),
                rankingDate: (parsedPayload[0] as Record<string, unknown>).rankingDate
              }))
          : parsedPayload;
      const records = parsed.map((raw, index) => {
        const normalized = normalizeManualRecord(raw, index);
        return (
        sourceRecordFromRaw({
          source,
          entityType: normalized.entityType,
          raw: normalized.raw,
          fetchedAt,
          externalId: normalized.externalId,
          sourceConfidence: 0.62
        })
        );
      });
      return resultFromRecords({
        source,
        jobType: context.jobType,
        records,
        status: records.length ? "success" : "partial",
        notes: records.length ? "Manual records accepted and stored as raw source data." : "No manual records supplied.",
        method: "LOCAL",
        endpoint: "admin-import://manual-json-csv",
        rawSample: parsed[0] ?? null
      });
    } catch (error) {
      return resultFromRecords({
        source,
        jobType: context.jobType,
        records: [],
        status: "failed",
        errors: [error instanceof Error ? error.message : "Manual import parse failed."],
        notes: "Manual import failed."
      });
    }
  }
};
