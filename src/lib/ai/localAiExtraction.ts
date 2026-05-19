import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analystSheetTemplates, analystSheetTypes, quoteCsv, type AnalystSheetType } from "@/lib/analystSheetTemplates";
import { validateNormalizedFile, type NormalizedFileValidationResult } from "@/lib/validation/normalizedFileValidator";
import { hash, logAI, askLocalAI, type LocalAIEnv } from "./localAIClient";
import { detectSource, sourcePromptFragment, type LocalAiSourceSite } from "./sourceDetection";

export type AiExtractedSheet = {
  sheetType: AnalystSheetType;
  content: string;
  rows: Array<Record<string, unknown>>;
  validation: NormalizedFileValidationResult;
};

export type LocalAiExtractionResult = {
  ok: boolean;
  extractionId: string;
  sourceSite: string;
  detectedSource: LocalAiSourceSite;
  promptVersion: string;
  promptVariant: string;
  confidence: number;
  timedApplyEligible: boolean;
  warnings: string[];
  sheets: AiExtractedSheet[];
  suggestedNextAction: string;
  cached: boolean;
  durationMs: number;
};

export type LocalAiExtractionInput = {
  matchId: string;
  teamA: string;
  teamB: string;
  inputText: string;
  sourceHint?: string;
  sourceSite?: LocalAiSourceSite;
  promptVariant?: string;
  modelOverride?: string;
  selfCheck?: boolean;
  env?: LocalAIEnv;
  fetchImpl?: typeof fetch;
};

type AiPayload = {
  sourceSite?: unknown;
  confidence?: unknown;
  warnings?: unknown;
  roster?: unknown;
  playerStats?: unknown;
  mapStats?: unknown;
  vetoHistory?: unknown;
  h2h?: unknown;
  newsEvents?: unknown;
};

const promptVersion = "local-ai-extraction-v2";
const activeMaps = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train", "Vertigo", "Overpass"];
const extractionCacheDir = path.join(process.cwd(), "data", "cache", "ai-responses", "extractions");
const acceptedCacheDir = path.join(process.cwd(), "data", "cache", "ai-responses", "accepted");

export async function extractWithLocalAI(input: LocalAiExtractionInput): Promise<LocalAiExtractionResult> {
  const startedAt = Date.now();
  const detectedSource = input.sourceSite || detectSource(input.inputText, input.sourceHint);
  const promptVariant = input.promptVariant || "default";
  const system = buildSystemPrompt(detectedSource, promptVariant);
  const prompt = buildUserPrompt(input, detectedSource, promptVariant);
  const first = await askLocalAI({
    prompt,
    system,
    model: input.modelOverride,
    env: input.env,
    fetchImpl: input.fetchImpl,
    cacheKeyParts: [input.matchId, input.teamA, input.teamB, input.sourceHint || "", detectedSource, promptVariant, promptVersion]
  });
  const responseText = input.selfCheck
    ? (await askLocalAI({
        prompt: buildSelfCheckPrompt(first.text),
        system,
        model: input.modelOverride,
        env: input.env,
        fetchImpl: input.fetchImpl,
        cacheKeyParts: [input.matchId, first.cacheKey, "self-check", detectedSource, promptVariant, promptVersion]
      })).text
    : first.text;
  const parsed = parseJsonPayload(responseText);
  const result = buildExtractionResult({
    payload: parsed,
    matchId: input.matchId,
    teamA: input.teamA,
    teamB: input.teamB,
    extractionId: hash(`${input.matchId}\n${input.teamA}\n${input.teamB}\n${input.inputText}\n${promptVersion}`),
    detectedSource,
    promptVariant,
    cached: first.cached,
    durationMs: Date.now() - startedAt,
    env: input.env
  });
  await persistExtraction(result).catch(() => undefined);
  await logAI({
    status: "extracted",
    action: "local_ai_extract",
    model: first.model,
    durationMs: result.durationMs,
    sourceSite: result.sourceSite,
    detectedSource: result.detectedSource,
    promptVersion: result.promptVersion,
    promptVariant: result.promptVariant,
    confidence: result.confidence,
    warnings: result.warnings.length,
    sheets: Object.fromEntries(result.sheets.map((sheet) => [sheet.sheetType, sheet.rows.length]))
  }).catch(() => undefined);
  return result;
}

export function buildExtractionResult(input: {
  payload: AiPayload;
  matchId: string;
  teamA: string;
  teamB: string;
  extractionId: string;
  detectedSource?: LocalAiSourceSite;
  promptVariant?: string;
  cached: boolean;
  durationMs: number;
  env?: LocalAIEnv;
}): LocalAiExtractionResult {
  const collectedAt = new Date().toISOString();
  const sourceSite = stringValue(input.payload.sourceSite) || "unknown";
  const confidence = clampNumber(numberValue(input.payload.confidence) ?? 70, 1, 100) ?? 70;
  const warnings = arrayOfStrings(input.payload.warnings);
  const context = { matchId: input.matchId, teamA: input.teamA, teamB: input.teamB, collectedAt, sourceSite, confidence };
  const sheets = [
    sheet("roster", rosterRows(input.payload.roster, context), input),
    sheet("player_stats", playerStatRows(input.payload.playerStats, context), input),
    sheet("map_stats", mapStatRows(input.payload.mapStats, context), input),
    sheet("veto_history", vetoRows(input.payload.vetoHistory, context), input),
    sheet("h2h", h2hRows(input.payload.h2h, context), input),
    sheet("news_events", newsRows(input.payload.newsEvents, context), input)
  ].filter((entry) => entry.rows.length > 0);
  const hardErrors = sheets.flatMap((entry) => entry.validation.errors);
  return {
    ok: sheets.length > 0 && hardErrors.length === 0,
    extractionId: input.extractionId,
    sourceSite,
    detectedSource: input.detectedSource || "other",
    promptVersion,
    promptVariant: input.promptVariant || "default",
    confidence,
    timedApplyEligible: sheets.length > 0 && hardErrors.length === 0 && confidence >= autoApplyMinConfidence(input.env),
    warnings: [...warnings, ...sheets.flatMap((entry) => entry.validation.warnings)],
    sheets,
    suggestedNextAction: hardErrors.length
      ? "Исправьте красные ячейки перед Apply."
      : sheets.length
        ? "Проверьте таблицы и нажмите Apply, если данные выглядят реальными."
        : "AI не нашёл валидных строк. Вставьте больше исходного текста или используйте CSV импорт.",
    cached: input.cached,
    durationMs: input.durationMs
  };
}

export async function readPersistedExtraction(extractionId: string) {
  const parsed = JSON.parse(await readFile(path.join(extractionCacheDir, `${safeFileName(extractionId)}.json`), "utf8")) as LocalAiExtractionResult;
  return parsed;
}

export async function persistAcceptedExtraction(input: {
  extractionId: string;
  matchId: string;
  inputText?: string;
  sourceSite?: string;
  promptVersion?: string;
  promptVariant?: string;
  sheets: Array<{ sheetType: AnalystSheetType; content: string }>;
}) {
  await mkdir(acceptedCacheDir, { recursive: true });
  await writeFile(path.join(acceptedCacheDir, `${safeFileName(input.extractionId)}.json`), JSON.stringify({
    timestamp: new Date().toISOString(),
    matchId: input.matchId,
    inputText: input.inputText,
    sourceSite: input.sourceSite,
    promptVersion: input.promptVersion,
    promptVariant: input.promptVariant,
    sheets: input.sheets
  }, null, 2), "utf8");
}

function sheet(sheetType: AnalystSheetType, rows: Array<Record<string, unknown>>, input: { matchId: string; teamA: string; teamB: string }): AiExtractedSheet {
  const content = rowsToCsv(sheetType, rows);
  return {
    sheetType,
    content,
    rows,
    validation: validateNormalizedFile({
      fileName: analystSheetTemplates[sheetType].filename,
      content,
      expectedMatchId: input.matchId,
      allowedTeamNames: [input.teamA, input.teamB]
    })
  };
}

function rowsToCsv(sheetType: AnalystSheetType, rows: Array<Record<string, unknown>>) {
  const columns = analystSheetTemplates[sheetType].columns;
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => quoteCsv(stringValue(row[column]))).join(",")).join("\n")}\n`;
}

function rosterRows(value: unknown, context: RowContext) {
  return asRows(value).map((row) => {
    const teamName = normalizeTeam(row.teamName ?? row.team ?? row.side, context);
    const nickname = stringValue(row.nickname ?? row.player ?? row.name);
    return {
      matchId: context.matchId,
      teamName,
      nickname,
      role: stringValue(row.role) || "player",
      country: stringValue(row.country),
      sourceName: "Local AI extraction",
      collectedAt: context.collectedAt,
      period: "current_roster",
      sampleSize: positiveOr(row.sampleSize, 1),
      confidence: context.confidence
    };
  }).filter((row) => row.teamName && row.nickname);
}

function playerStatRows(value: unknown, context: RowContext) {
  return asRows(value).map((row) => {
    const kills = num(row.kills);
    const deaths = num(row.deaths);
    const kd = num(row.kd ?? row.kdr) ?? (kills !== null && deaths !== null && deaths > 0 ? round(kills / deaths, 2) : null);
    return {
      matchId: context.matchId,
      teamName: normalizeTeam(row.teamName ?? row.team, context),
      nickname: stringValue(row.nickname ?? row.player ?? row.name),
      maps: positiveOr(row.maps ?? row.mapsPlayed ?? row.sampleSize, 1),
      kills: numericString(kills),
      deaths: numericString(deaths),
      assists: numericString(num(row.assists)),
      kd: numericString(kd),
      rating: rangeString(row.rating ?? row.rating2 ?? row.rating20, 0.2, 2.5),
      adr: rangeString(row.adr, 0, 150),
      kast: rangeString(row.kast, 0, 100),
      impact: rangeString(row.impact, 0, 2.5),
      openingKills: numericString(num(row.openingKills)),
      openingDeaths: numericString(num(row.openingDeaths)),
      clutchesWon: numericString(num(row.clutchesWon)),
      clutchesAttempted: numericString(num(row.clutchesAttempted)),
      sourceName: "Local AI extraction",
      collectedAt: context.collectedAt,
      period: "ai_extracted",
      sampleSize: positiveOr(row.sampleSize ?? row.maps ?? row.mapsPlayed, 1),
      confidence: context.confidence
    };
  }).filter((row) => row.teamName && row.nickname);
}

function mapStatRows(value: unknown, context: RowContext) {
  return asRows(value).map((row) => {
    const wins = num(row.wins);
    const losses = num(row.losses);
    const mapsPlayed = num(row.mapsPlayed ?? row.maps ?? row.sampleSize) ?? (wins !== null && losses !== null ? wins + losses : null);
    const winRate = num(row.winRate ?? row.winrate) ?? (wins !== null && mapsPlayed && mapsPlayed > 0 ? round((wins / mapsPlayed) * 100, 1) : null);
    return {
      matchId: context.matchId,
      teamName: normalizeTeam(row.teamName ?? row.team, context),
      mapName: normalizeMap(row.mapName ?? row.map),
      mapsPlayed: numericString(mapsPlayed ?? 1),
      wins: numericString(wins),
      losses: numericString(losses),
      winRate: rangeString(winRate, 0, 100),
      roundsWon: numericString(num(row.roundsWon)),
      roundsLost: numericString(num(row.roundsLost)),
      ctRoundWinRate: rangeString(row.ctRoundWinRate, 0, 100),
      tRoundWinRate: rangeString(row.tRoundWinRate, 0, 100),
      pickRate: rangeString(row.pickRate, 0, 100),
      banRate: rangeString(row.banRate, 0, 100),
      deciderRate: rangeString(row.deciderRate, 0, 100),
      sourceName: "Local AI extraction",
      collectedAt: context.collectedAt,
      period: "ai_extracted",
      sampleSize: numericString(mapsPlayed ?? 1),
      confidence: context.confidence
    };
  }).filter((row) => row.teamName && row.mapName);
}

function vetoRows(value: unknown, context: RowContext) {
  return asRows(value).map((row) => {
    const action = stringValue(row.action ?? row.type).toLowerCase();
    const pickRate = row.pickRate ?? (action.includes("pick") ? 100 : 0);
    const banRate = row.banRate ?? (action.includes("ban") || action.includes("remove") ? 100 : 0);
    const deciderRate = row.deciderRate ?? (action.includes("decider") || action.includes("left") ? 100 : 0);
    return {
      matchId: context.matchId,
      teamName: normalizeTeam(row.teamName ?? row.team, context),
      mapName: normalizeMap(row.mapName ?? row.map),
      sampleSize: positiveOr(row.sampleSize, 1),
      pickRate: rangeString(pickRate, 0, 100),
      banRate: rangeString(banRate, 0, 100),
      deciderRate: rangeString(deciderRate, 0, 100),
      sourceName: "Local AI extraction",
      collectedAt: context.collectedAt,
      period: "ai_extracted_veto",
      confidence: context.confidence
    };
  }).filter((row) => row.teamName && row.mapName);
}

function h2hRows(value: unknown, context: RowContext) {
  return asRows(value).map((row) => ({
    matchId: context.matchId,
    date: stringValue(row.date) || context.collectedAt,
    teamA: normalizeTeam(row.teamA, context) || context.teamA,
    teamB: normalizeTeam(row.teamB, context) || context.teamB,
    winner: normalizeTeam(row.winner, context),
    format: stringValue(row.format) || "BO3",
    mapName: row.mapName || row.map ? normalizeMap(row.mapName ?? row.map) : "",
    scoreA: numericString(num(row.scoreA)),
    scoreB: numericString(num(row.scoreB)),
    rosterSimilarity: rangeString(row.rosterSimilarity, 0, 100) || "50",
    sourceName: "Local AI extraction",
    collectedAt: context.collectedAt,
    period: "ai_extracted_h2h",
    sampleSize: positiveOr(row.sampleSize, 1),
    confidence: context.confidence
  })).filter((row) => row.teamA && row.teamB);
}

function newsRows(value: unknown, context: RowContext) {
  return asRows(value).map((row) => ({
    matchId: context.matchId,
    sourceName: "Local AI extraction",
    sourceType: stringValue(row.sourceType) || context.sourceSite || "copied_text",
    title: stringValue(row.title),
    summary: stringValue(row.summary),
    publishedAt: stringValue(row.publishedAt) || context.collectedAt,
    affectedTeam: normalizeTeam(row.affectedTeam ?? row.team, context),
    affectedPlayer: stringValue(row.affectedPlayer ?? row.player),
    eventType: stringValue(row.eventType) || "context",
    reliability: stringValue(row.reliability) || "ai_extracted",
    impactScore: rangeString(row.impactScore, -10, 10) || "0",
    confidence: context.confidence
  })).filter((row) => row.title && row.summary);
}

type RowContext = { matchId: string; teamA: string; teamB: string; collectedAt: string; sourceSite: string; confidence: number };

function buildSystemPrompt(source: LocalAiSourceSite, promptVariant: string) {
  return [
    "You are a CS2 data extraction assistant running locally.",
    "Extract only facts present in the provided text. Never invent players, maps, stats, veto, H2H or dates.",
    "Return strict JSON only. If a block is missing, return an empty array.",
    "Use these top-level keys: sourceSite, confidence, warnings, roster, playerStats, mapStats, vetoHistory, h2h, newsEvents.",
    "Use CS2 map names: Mirage, Inferno, Nuke, Ancient, Anubis, Dust2, Train, Vertigo, Overpass.",
    "Player stats may include maps, kills, deaths, assists, kd, rating, adr, kast, impact.",
    "Map stats may include mapsPlayed, wins, losses, winRate, roundsWon, roundsLost, ctRoundWinRate, tRoundWinRate, pickRate, banRate, deciderRate.",
    "Veto rows may include teamName, mapName, action, pickRate, banRate, deciderRate.",
    `Prompt version: ${promptVersion}. Prompt variant: ${promptVariant}. Detected source: ${source}.`,
    sourcePromptFragment(source)
  ].join("\n");
}

function buildUserPrompt(input: LocalAiExtractionInput, source: LocalAiSourceSite, promptVariant: string) {
  return [
    `matchId: ${input.matchId}`,
    `expectedTeamA: ${input.teamA}`,
    `expectedTeamB: ${input.teamB}`,
    `sourceHint: ${input.sourceHint || "unknown"}`,
    `detectedSource: ${source}`,
    `promptVariant: ${promptVariant}`,
    "Return JSON only. Keep unknown fields empty, not guessed.",
    "Copied text:",
    input.inputText.slice(0, 60_000)
  ].join("\n\n");
}

function buildSelfCheckPrompt(firstJson: string) {
  return [
    "Check this extracted JSON for CS2 logic errors, OCR-like typos and impossible values.",
    "Do not add facts not already present. Return corrected strict JSON only.",
    firstJson
  ].join("\n\n");
}

function parseJsonPayload(text: string): AiPayload {
  const trimmed = text.trim();
  const direct = tryParse(trimmed);
  if (direct) return direct;
  const match = trimmed.match(/\{[\s\S]*\}/);
  const extracted = match ? tryParse(match[0]) : null;
  if (extracted) return extracted;
  throw new Error("Local AI returned non-JSON output.");
}

function tryParse(text: string): AiPayload | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as AiPayload : null;
  } catch {
    return null;
  }
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(asRows);
  }
  return [];
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace("%", "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown) {
  return num(value);
}

function clampNumber(value: number | null, min: number, max: number) {
  if (value === null) return null;
  if (value < min || value > max) return null;
  return value;
}

function rangeString(value: unknown, min: number, max: number) {
  return numericString(clampNumber(num(value), min, max));
}

function numericString(value: number | null) {
  return value === null ? "" : String(value);
}

function positiveOr(value: unknown, fallback: number) {
  const parsed = num(value);
  return String(parsed && parsed > 0 ? parsed : fallback);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeMap(value: unknown) {
  const raw = stringValue(value);
  const slug = raw.toLowerCase().replace(/^de[_-]?/, "").replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = { dustii: "Dust2", dust2: "Dust2" };
  return aliases[slug] || activeMaps.find((map) => map.toLowerCase().replace(/[^a-z0-9]+/g, "") === slug) || raw;
}

function normalizeTeam(value: unknown, context: RowContext) {
  const raw = stringValue(value);
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const teamA = context.teamA.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const teamB = context.teamB.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalized === "teama" || normalized === teamA || teamA.includes(normalized) || normalized.includes(teamA)) return context.teamA;
  if (normalized === "teamb" || normalized === teamB || teamB.includes(normalized) || normalized.includes(teamB)) return context.teamB;
  return raw;
}

async function persistExtraction(result: LocalAiExtractionResult) {
  await mkdir(extractionCacheDir, { recursive: true });
  await writeFile(path.join(extractionCacheDir, `${safeFileName(result.extractionId)}.json`), JSON.stringify(result, null, 2), "utf8");
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "").slice(0, 96);
}

function autoApplyMinConfidence(env: LocalAIEnv = process.env as unknown as LocalAIEnv) {
  const parsed = Number((env as Record<string, string | undefined>).AI_AUTO_APPLY_MIN_CONFIDENCE || 85);
  return Number.isFinite(parsed) ? parsed : 85;
}

export const localAiPromptVersion = promptVersion;
export const localAiSheetTypes = analystSheetTypes;
