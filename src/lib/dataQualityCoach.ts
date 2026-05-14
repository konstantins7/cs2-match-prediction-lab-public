import {
  freshnessFromCollectedAt,
  qualityMetadataFromRecord,
  type ManualBlockQuality
} from "./manualRealQuality";

function asRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function positive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function hasRoster(payload: Record<string, unknown>) {
  const rosters = asRecord(payload.rosters ?? payload.teams);
  return Object.values(rosters).some((players) => Array.isArray(players) && players.length > 0);
}

function hasPlayerStats(payload: Record<string, unknown>) {
  return rows(payload.playerStats ?? payload.players).some((row) => positive(row.maps));
}

function hasMapStats(payload: Record<string, unknown>) {
  return rows(payload.mapStats ?? payload.teams).some((row) => positive(row.mapsPlayed));
}

function hasVeto(payload: Record<string, unknown>) {
  return rows(payload.vetoHistory).some((row) => positive(row.sampleSize));
}

export function coachManualPayload(payload: Record<string, unknown>) {
  const warnings: string[] = [];
  const metadata = qualityMetadataFromRecord(payload);
  const type = typeof payload.type === "string" ? payload.type : "";
  const sampleSize = metadata.sampleSize ?? 0;
  const confidence = metadata.confidence ?? 0;

  if (!metadata.sourceName) warnings.push("Нет sourceName: доверие к ручным данным будет снижено.");
  if (sampleSize <= 0) warnings.push("Маленькая выборка или sampleSize=0: данные можно проверить, но readiness почти не вырастет.");
  else if (sampleSize < 5) warnings.push("Маленькая выборка: прогноз будет слабым даже после apply.");
  if (!metadata.confidence || confidence <= 0.5) warnings.push("Confidence низкий: блок останется partial и не откроет полноценный L3.");

  const freshness = freshnessFromCollectedAt(metadata.collectedAt);
  if (freshness === "aging") warnings.push("Данные старше 30 дней: качество данных будет снижено.");
  if (freshness === "stale") warnings.push("Данные устарели больше чем на 60 дней: нужен review перед доверием.");
  if (freshness === "expired") warnings.push("Данные старше 90 дней: readiness не поднимется выше L2 без подтверждения.");

  if (type === "manual_real_pack") {
    const missing: string[] = [];
    if (!hasRoster(payload)) missing.push("составы");
    if (!hasPlayerStats(payload)) missing.push("player stats");
    if (!hasMapStats(payload)) {
      missing.push("map stats");
      warnings.push("Нет map stats: readiness не поднимется до L3 partial.");
    }
    if (!hasVeto(payload)) {
      missing.push("veto");
      warnings.push("Нет veto: BO3 прогноз останется неполным.");
    }
    if (missing.length) warnings.push(`Readiness не поднимется до L3 без данных: ${missing.join(", ")}.`);
  }

  return [...new Set(warnings)];
}

export function coachBlockQualities(blocks: ManualBlockQuality[] = []) {
  return [...new Set(blocks.flatMap((block) => [
    ...block.warnings,
    ...block.reasons,
    block.status === "partial" ? `${block.block}: блок partial, нужен более сильный source confidence/sample.` : "",
    block.status === "needs_review" ? `${block.block}: нужен review перед использованием в прогнозе.` : ""
  ]).filter(Boolean))];
}
