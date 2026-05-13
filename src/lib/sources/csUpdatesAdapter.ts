import { arrayFromPayload, fetchJson, resultFromRecords, sourceRecordFromRaw } from "./adapterUtils";
import type { SourceAdapter } from "./types";
import { buildSourceStatus, disabledResult, envFlag, failedResult, SOURCE_PRIORITY } from "./types";

const source = "cs-updates" as const;
const capabilities = ["meta"] as const;
const requiredEnv = ["ENABLE_CS_UPDATES_SYNC"];
const steamNewsUrl = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/";

export function classifySteamPatchQuality(item: unknown) {
  const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const title = String(record.title ?? "").toLowerCase();
  const contents = String(record.contents ?? "").toLowerCase();
  const text = `${title} ${contents}`;
  const hasPatchSignals = ["release notes", "update", "map", "weapon", "economy", "gameplay", "fixed"].some((keyword) =>
    text.includes(keyword)
  );
  const hasEnoughBody = contents.length > 280;
  return {
    quality: hasPatchSignals && hasEnoughBody ? "complete" : "partial",
    confidence: hasPatchSignals && hasEnoughBody ? 0.82 : 0.46,
    note: hasPatchSignals && hasEnoughBody ? "Steam update item has patch-note-like content." : "Steam feed item lacks complete patch-note detail; manual official update review recommended."
  };
}

export const csUpdatesAdapter: SourceAdapter = {
  name: source,
  label: "Steam / Counter-Strike Updates",
  priority: SOURCE_PRIORITY[source],
  capabilities: [...capabilities],
  requiredEnv,
  status() {
    const enabled = envFlag("ENABLE_CS_UPDATES_SYNC");
    return buildSourceStatus({
      source,
      label: "Steam / Counter-Strike Updates",
      priority: SOURCE_PRIORITY[source],
      capabilities: [...capabilities],
      requiredEnv,
      enabled,
      configured: true,
      message: enabled ? "Enabled for Steam app 730 news sync." : "Disabled: set ENABLE_CS_UPDATES_SYNC=true."
    });
  },
  async sync(context) {
    const status = this.status();
    if (!status.enabled) return disabledResult(source, context.jobType, status.message);
    if (context.jobType !== "game_meta_updates") {
      return failedResult(source, context.jobType, `CS updates adapter supports game_meta_updates, not ${context.jobType}.`);
    }
    try {
      const url = new URL(steamNewsUrl);
      url.searchParams.set("appid", "730");
      url.searchParams.set("count", "10");
      url.searchParams.set("maxlength", "6000");
      const payload = await fetchJson(url.toString(), {}, context.fetchImpl);
      const fetchedAt = context.now ?? new Date();
      const rawItems = arrayFromPayload(payload);
      const records = rawItems.map((raw) => {
        const quality = classifySteamPatchQuality(raw);
        return sourceRecordFromRaw({
          source,
          entityType: "game_meta_update",
          raw: { raw, patchDataQuality: quality.quality, qualityNote: quality.note, sourceConfidence: quality.confidence },
          fetchedAt,
          externalId: String((raw as { gid?: unknown; id?: unknown }).gid ?? (raw as { id?: unknown }).id ?? `steam-${fetchedAt.getTime()}`),
          sourceConfidence: quality.confidence
        });
      });
      const partial = records.some((record) => record.sourceConfidence < 0.6);
      return resultFromRecords({
        source,
        jobType: context.jobType,
        records,
        status: partial ? "partial" : "success",
        notes: partial ? "Steam feed synced with partial patch-note quality; manual official update fallback recommended." : "Steam app 730 updates synced.",
        endpoint: steamNewsUrl,
        method: "GET",
        rawSample: rawItems[0] ?? null
      });
    } catch (error) {
      return failedResult(source, context.jobType, error instanceof Error ? error.message : "CS updates sync failed.");
    }
  }
};
