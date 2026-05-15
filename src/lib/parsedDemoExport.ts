import { prisma } from "./prisma";
import { buildPredictionInput } from "./prediction/buildPredictionInput";
import { calculatePrediction } from "./prediction/calculatePrediction";
import { hashRawRecord, saveExternalSourceRecord } from "./sources/sourceReconciler";
import { rebuildSnapshots, savePredictionAudit } from "./sources/sourceScheduler";
import { refreshResearchPack } from "./researchQueue";
import { deriveDataDepth, deriveRealDataDepth, type DataDepth } from "./ui/forecastUx";
import {
  evaluatePreMatchLeakage,
  isPlaceholderText,
  isPreMatchUsableDataRole,
  normalizeDataRole,
  parseEvidenceDate,
  type RealDataRole
} from "./realData/dataRole";
import {
  parsedDemoDataRoles,
  parsedDemoSourceTools,
  type ParsedDemoSourceTool
} from "./parsedDemoExportProfiles";

const activeMapsFallback = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train", "Vertigo", "Overpass"];
const numericPlayerFields = ["maps", "rounds", "kills", "deaths", "assists", "kd", "kdDiff", "rating", "adr", "kast", "impact"];
const numericMapFields = ["mapsPlayed", "winRate", "pickRate", "banRate", "ctRoundWinRate", "tRoundWinRate", "pistolWinRate", "forceBuyWinRate"];

export type ParsedDemoExportSnapshot = {
  readiness: string;
  realForecastReady: boolean;
  dataQuality: number;
  confidence: number;
  probability: string;
  previewDataDepth: DataDepth;
  realDataDepth: DataDepth;
  missingBlocks: string[];
};

export type ParsedDemoExportValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  matchId?: string;
  sourceTool?: ParsedDemoSourceTool;
  dataRole?: RealDataRole;
  importBatchId?: string;
  sourceQuality: number;
  leakage: {
    passed: boolean;
    reasons: string[];
    evidenceDate: string | null;
  };
  creates: Record<string, number>;
  recordsPreview: string[];
  before: ParsedDemoExportSnapshot | null;
  afterPreview: (ParsedDemoExportSnapshot & {
    expectedRealForecastReady: boolean;
    sourceQuality: number;
    stillMissing: string[];
  }) | null;
  roleExplanation?: string;
};

type ParsedDemoExportContext = {
  match: {
    id: string;
    startTime: Date;
    format: string;
    teamAId: string;
    teamBId: string;
    teamA: { id: string; name: string; slug?: string | null };
    teamB: { id: string; name: string; slug?: string | null };
  };
  activeMaps: string[];
};

type ParsedDemoExportMetadata = {
  sourceTool: ParsedDemoSourceTool;
  sourceName: string;
  matchId: string;
  dataRole: RealDataRole;
  period: string;
  sampleSize: number;
  confidence: number;
  collectedAt: Date;
  sourceDate: Date;
  sourceMatchId: string | null;
  importBatchId: string;
  dataLeakageCheckPassed: boolean;
  forecastEligible: boolean;
};

function record(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value: unknown, fallback = 0.5) {
  const parsed = num(value, fallback);
  return parsed > 1 ? parsed / 100 : parsed;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parsePayload(input: string | unknown) {
  if (typeof input === "string") {
    if (!input.trim()) throw new Error("JSON payload is empty.");
    return JSON.parse(input) as Record<string, unknown>;
  }
  return record(input);
}

function sourceTool(value: unknown): ParsedDemoSourceTool | null {
  return parsedDemoSourceTools.includes(value as ParsedDemoSourceTool) ? (value as ParsedDemoSourceTool) : null;
}

function normalizeTeamName(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeMap(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function resolveTeam(context: ParsedDemoExportContext, row: Record<string, unknown>) {
  const candidates = [
    row.teamId,
    row.teamName,
    row.team,
    row.name,
    record(row.teamRef).id,
    record(row.teamRef).name
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    if (candidate === context.match.teamAId) return context.match.teamA;
    if (candidate === context.match.teamBId) return context.match.teamB;
    const normalized = normalizeTeamName(candidate);
    if (normalized && [context.match.teamA.name.toLowerCase(), context.match.teamA.slug?.toLowerCase()].includes(normalized)) return context.match.teamA;
    if (normalized && [context.match.teamB.name.toLowerCase(), context.match.teamB.slug?.toLowerCase()].includes(normalized)) return context.match.teamB;
  }
  return null;
}

function playerNickname(row: Record<string, unknown>) {
  const value = row.nickname ?? row.playerName ?? row.name ?? row.steamName;
  return typeof value === "string" ? value.trim() : "";
}

function isNumericIfPresent(row: Record<string, unknown>, fields: string[]) {
  return fields.filter((field) => row[field] !== undefined && row[field] !== null && row[field] !== "").filter((field) => !Number.isFinite(Number(row[field])));
}

function hasPlayerStatCoverage(row: Record<string, unknown>) {
  return ["kills", "deaths", "assists", "kd", "rating", "adr", "kast", "impact", "rounds", "maps"].some((field) => row[field] !== undefined && row[field] !== null && row[field] !== "");
}

function usefulStatCoverage(payload: Record<string, unknown>) {
  return {
    playerStats: rows(payload.players).filter(hasPlayerStatCoverage).length,
    mapStats: rows(payload.maps).length,
    teamForms: rows(payload.teamForms).length,
    rounds: rows(payload.rounds).length,
    economy: rows(payload.economy).length,
    pistol: rows(payload.pistol).length,
    overtime: rows(payload.overtime).length,
    veto: rows(payload.vetoHistory).length,
    h2h: rows(payload.h2h).length
  };
}

function creationCounts(payload: Record<string, unknown>) {
  const useful = usefulStatCoverage(payload);
  return {
    PlayerStatSnapshot: useful.playerStats,
    TeamMapStat: useful.mapStats,
    TeamFormSnapshot: useful.teamForms + useful.rounds + useful.economy + useful.pistol + useful.overtime,
    VetoPattern: useful.veto,
    HeadToHead: useful.h2h,
    EntityMatchCandidate: 0
  };
}

function previewRecords(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}: ${count}`);
}

function sourceQuality(sampleSize: number, confidence: number, usefulCount: number) {
  const confidenceScore = Math.max(0, Math.min(100, confidence > 1 ? confidence : confidence * 100));
  const sampleScore = Math.min(100, Math.max(0, sampleSize * 8));
  const coverageScore = Math.min(100, Math.max(0, usefulCount * 8));
  return Math.round(confidenceScore * 0.5 + sampleScore * 0.25 + coverageScore * 0.25);
}

function roleExplanation(dataRole: RealDataRole) {
  if (dataRole === "post_match_analysis") {
    return "Эти данные подходят для разбора после матча и backtesting, но не используются как pre-match evidence.";
  }
  if (dataRole === "backtest_only") {
    return "Эти данные используются только для проверки модели, не для live-прогноза.";
  }
  return "Этот импорт может повысить глубину данных, но прогноз станет готовым только если пройдены Real Forecast gates.";
}

async function activeMaps() {
  const pool = await prisma.activeMapPoolVersion.findFirst({ where: { endedAt: null }, orderBy: { startedAt: "desc" } });
  if (!pool) return activeMapsFallback;
  try {
    const parsed = JSON.parse(pool.mapsJson);
    return Array.isArray(parsed) ? parsed.map(String) : activeMapsFallback;
  } catch {
    return activeMapsFallback;
  }
}

async function contextForMatch(matchId: string): Promise<ParsedDemoExportContext | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { teamA: true, teamB: true } });
  if (!match) return null;
  return { match, activeMaps: await activeMaps() };
}

async function snapshot(matchId: string): Promise<ParsedDemoExportSnapshot> {
  const input = await buildPredictionInput(matchId);
  const prediction = calculatePrediction(input);
  const missingBlocks = [...prediction.readiness.missingCriticalData, ...prediction.realForecast.reasons];
  return {
    readiness: prediction.readiness.level,
    realForecastReady: prediction.realForecast.isReady,
    dataQuality: prediction.dataQualityScore,
    confidence: prediction.confidenceScore,
    probability: `${prediction.teamAProbability}/${prediction.teamBProbability}`,
    previewDataDepth: deriveDataDepth(input, prediction),
    realDataDepth: deriveRealDataDepth(input, prediction),
    missingBlocks: [...new Set(missingBlocks)]
  };
}

function validateShape(payload: Record<string, unknown>, context: ParsedDemoExportContext): {
  errors: string[];
  warnings: string[];
  metadata: ParsedDemoExportMetadata | null;
  creates: Record<string, number>;
  sourceQuality: number;
  leakage: ParsedDemoExportValidation["leakage"];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tool = sourceTool(payload.sourceTool);
  const type = typeof payload.type === "string" ? payload.type : "";
  if (type !== "parsed_demo_export") errors.push("type must be parsed_demo_export.");
  if (!tool) errors.push("sourceTool must be one of cs_demo_manager, awpy, demoparser, demoinfocs, custom.");
  const matchId = typeof payload.matchId === "string" ? payload.matchId : "";
  if (matchId !== context.match.id) errors.push(`matchId must match selected match ${context.match.id}.`);

  const sourceName = typeof payload.sourceName === "string" ? payload.sourceName.trim() : "";
  const period = typeof payload.period === "string" ? payload.period.trim() : "";
  const sampleSize = num(payload.sampleSize, 0);
  const confidence = num(payload.confidence, 0);
  const collectedAt = parseEvidenceDate(payload.collectedAt);
  const sourceDate = parseEvidenceDate(payload.sourceDate ?? payload.matchDate ?? payload.parsedAt ?? payload.collectedAt);
  const dataRole = normalizeDataRole(payload.dataRole, "historical_team_form");
  const sourceMatchId = typeof payload.sourceMatchId === "string" ? payload.sourceMatchId : typeof payload.parsedMatchId === "string" ? payload.parsedMatchId : null;
  if (!sourceName || isPlaceholderText(sourceName)) errors.push("sourceName is required and cannot be placeholder/template text.");
  if (!period || isPlaceholderText(period)) errors.push("period is required and cannot be placeholder/template text.");
  if (!collectedAt) errors.push("collectedAt is required for cutoff/leakage checks.");
  if (sampleSize <= 0) errors.push("sampleSize must be > 0.");
  if (confidence <= 0) errors.push("confidence must be > 0.");
  if (!parsedDemoDataRoles.includes(payload.dataRole as typeof parsedDemoDataRoles[number])) errors.push("dataRole must be historical_team_form, pre_match_evidence, post_match_analysis, or backtest_only.");

  const teamRows = rows(payload.teams);
  const playerRows = rows(payload.players);
  if (!teamRows.length) errors.push("teams are required.");
  if (!playerRows.length) errors.push("players are required.");

  const resolvedTeamIds = new Set<string>();
  for (const row of teamRows) {
    const teamName = row.teamName ?? row.name ?? row.team;
    if (isPlaceholderText(teamName)) errors.push("teams contain placeholder/template values.");
    const team = resolveTeam(context, row);
    if (!team) errors.push(`team does not resolve to selected match teams: ${String(teamName ?? row.teamId ?? "unknown")}`);
    else resolvedTeamIds.add(team.id);
  }
  if (!resolvedTeamIds.has(context.match.teamAId) || !resolvedTeamIds.has(context.match.teamBId)) {
    errors.push("teams must include both selected match teams.");
  }

  const playerTeams = new Set<string>();
  for (const row of playerRows) {
    const nickname = playerNickname(row);
    if (!nickname || isPlaceholderText(nickname)) errors.push("players contain missing or placeholder nicknames.");
    const team = resolveTeam(context, row);
    if (!team) errors.push(`player team mismatch for ${nickname || "unknown player"}.`);
    else playerTeams.add(team.id);
    const badNumeric = isNumericIfPresent(row, numericPlayerFields);
    if (badNumeric.length) errors.push(`invalid numeric player stats for ${nickname || "unknown player"}: ${badNumeric.join(", ")}`);
  }
  if (!playerTeams.has(context.match.teamAId) || !playerTeams.has(context.match.teamBId)) {
    errors.push("players must include rows for both selected match teams.");
  }

  const mapSet = new Set(context.activeMaps.map((map) => map.toLowerCase()));
  for (const row of [...rows(payload.maps), ...rows(payload.vetoHistory)]) {
    const mapName = row.mapName ?? row.map;
    if (!mapName || isPlaceholderText(mapName) || !mapSet.has(normalizeMap(mapName))) errors.push(`unknown or invalid map name: ${String(mapName ?? "missing")}`);
    const badNumeric = isNumericIfPresent(row, numericMapFields);
    if (badNumeric.length) errors.push(`invalid numeric map stats for ${String(mapName ?? "unknown map")}: ${badNumeric.join(", ")}`);
    if (!resolveTeam(context, row)) errors.push(`map/veto team mismatch for ${String(mapName ?? "unknown map")}.`);
  }

  const useful = usefulStatCoverage(payload);
  const usefulCount = Object.values(useful).reduce((sum, count) => sum + count, 0);
  if (usefulCount === 0) errors.push("raw-only/template payload rejected: at least one useful stat block is required.");
  if (useful.playerStats === 0) warnings.push("No player stat rows with numeric coverage were found.");
  if (useful.mapStats === 0) warnings.push("No map stats were found; map/veto coverage may remain missing.");
  if (useful.veto === 0) warnings.push("No vetoHistory was provided; Real Forecast gates may still block readiness.");

  const leakage = evaluatePreMatchLeakage({
    dataRole,
    sourceDate: sourceDate ?? collectedAt,
    collectedAt,
    sourceMatchId,
    targetMatchId: context.match.id,
    targetStartTime: new Date(context.match.startTime)
  });
  const dataRolePreMatchUsable = isPreMatchUsableDataRole(dataRole);
  const preMatchPassed = dataRolePreMatchUsable && leakage.passed;
  if (dataRolePreMatchUsable && !leakage.passed) {
    errors.push(...leakage.reasons.map((reason) => `parsed_demo_export leakage: ${reason}`));
  }
  if (!dataRolePreMatchUsable) {
    warnings.push(roleExplanation(dataRole));
  }

  const creates = creationCounts(payload);
  const quality = sourceQuality(sampleSize, confidence, usefulCount);
  const metadata = tool && sourceName && period && collectedAt && sourceDate
    ? {
        sourceTool: tool,
        sourceName,
        matchId: context.match.id,
        dataRole,
        period,
        sampleSize,
        confidence: Math.max(0.01, Math.min(1, confidence > 1 ? confidence / 100 : confidence)),
        collectedAt,
        sourceDate,
        sourceMatchId,
        importBatchId: `parsed_demo_export_${context.match.id}_${hashRawRecord(payload).slice(0, 12)}`,
        dataLeakageCheckPassed: preMatchPassed,
        forecastEligible: preMatchPassed
      }
    : null;

  return {
    errors,
    warnings,
    metadata,
    creates,
    sourceQuality: quality,
    leakage: {
      passed: preMatchPassed,
      reasons: leakage.reasons,
      evidenceDate: leakage.evidenceDate?.toISOString() ?? null
    }
  };
}

function afterPreview(before: ParsedDemoExportSnapshot | null, validation: ReturnType<typeof validateShape>) {
  if (!before || !validation.metadata) return null;
  const counts = validation.creates;
  const playerRowsEnough = counts.PlayerStatSnapshot >= 10;
  const hasMap = counts.TeamMapStat >= 2;
  const hasVeto = counts.VetoPattern >= 2;
  const hasDeep = counts.TeamFormSnapshot > 0;
  const eligible = validation.metadata.forecastEligible && validation.sourceQuality >= 50;
  let expectedLevel = before.realDataDepth.level;
  if (eligible && playerRowsEnough) expectedLevel = Math.max(expectedLevel, 3) as DataDepth["level"];
  if (eligible && hasMap && hasVeto) expectedLevel = Math.max(expectedLevel, 4) as DataDepth["level"];
  if (eligible && hasDeep) expectedLevel = Math.max(expectedLevel, 5) as DataDepth["level"];
  const realDepthLabels: Record<DataDepth["level"], Omit<DataDepth, "level">> = {
    1: { label: "Недостаточно real data", description: "Parsed export не закрывает real evidence gates." },
    2: { label: "Рейтинг/basic history", description: "Есть базовый real context, но нет player/map/veto coverage." },
    3: { label: "Составы/player stats", description: "Parsed export может закрыть player stat coverage." },
    4: { label: "Карты/veto", description: "Parsed export может закрыть map/veto coverage." },
    5: { label: "Demo/round/economy", description: "Parsed export содержит round/economy proxy evidence." }
  };
  const expectedReady = eligible && playerRowsEnough && hasMap && (hasVeto || hasDeep);
  const stillMissing = [...before.missingBlocks];
  if (!playerRowsEnough) stillMissing.push("10 player stat rows from both teams");
  if (!hasMap) stillMissing.push("map stats for both teams");
  if (!hasVeto && !hasDeep) stillMissing.push("veto history or strong round/economy substitute");
  if (!eligible) stillMissing.push("eligible pre-match dataRole/cutoff/source quality");
  return {
    ...before,
    realForecastReady: before.realForecastReady || expectedReady,
    realDataDepth: { level: expectedLevel, ...realDepthLabels[expectedLevel] },
    expectedRealForecastReady: expectedReady,
    sourceQuality: validation.sourceQuality,
    stillMissing: [...new Set(stillMissing)]
  };
}

export async function validateParsedDemoExport(input: string | unknown): Promise<ParsedDemoExportValidation> {
  let payload: Record<string, unknown>;
  try {
    payload = parsePayload(input);
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "Invalid JSON."],
      warnings: [],
      sourceQuality: 0,
      leakage: { passed: false, reasons: ["payload could not be parsed"], evidenceDate: null },
      creates: {},
      recordsPreview: [],
      before: null,
      afterPreview: null
    };
  }

  const matchId = typeof payload.matchId === "string" ? payload.matchId : "";
  const context = matchId ? await contextForMatch(matchId) : null;
  const before = context ? await snapshot(context.match.id).catch(() => null) : null;
  if (!context) {
    return {
      ok: false,
      errors: [`Match not found: ${matchId || "missing matchId"}`],
      warnings: [],
      matchId,
      sourceQuality: 0,
      leakage: { passed: false, reasons: ["match not found"], evidenceDate: null },
      creates: {},
      recordsPreview: [],
      before,
      afterPreview: null
    };
  }

  const validation = validateShape(payload, context);
  const result: ParsedDemoExportValidation = {
    ok: validation.errors.length === 0,
    errors: validation.errors,
    warnings: validation.warnings,
    matchId: context.match.id,
    sourceTool: validation.metadata?.sourceTool,
    dataRole: validation.metadata?.dataRole,
    importBatchId: validation.metadata?.importBatchId,
    sourceQuality: validation.sourceQuality,
    leakage: validation.leakage,
    creates: validation.creates,
    recordsPreview: previewRecords(validation.creates),
    before,
    afterPreview: afterPreview(before, validation),
    roleExplanation: validation.metadata ? roleExplanation(validation.metadata.dataRole) : undefined
  };
  return result;
}

export async function previewParsedDemoExport(input: string | unknown) {
  return validateParsedDemoExport(input);
}

function scope(meta: ParsedDemoExportMetadata, sourceRecordId: string) {
  return {
    source: "parsed_demo",
    sourceMode: "parsed_demo",
    matchId: meta.matchId,
    importBatchId: meta.importBatchId,
    sourceRecordId,
    collectedAt: meta.collectedAt,
    sourceDate: meta.sourceDate,
    dataRole: meta.dataRole,
    dataLeakageCheckPassed: meta.dataLeakageCheckPassed,
    isActive: true
  };
}

async function resolveOrCreateScopedPlayer(row: Record<string, unknown>, teamId: string, meta: ParsedDemoExportMetadata, sourceRecordId: string) {
  if (typeof row.playerId === "string") {
    const byId = await prisma.player.findFirst({ where: { id: row.playerId, teamId } });
    if (byId) return { player: byId, needsReview: false };
  }
  const nickname = playerNickname(row);
  const existing = (await prisma.player.findMany({ where: { teamId, isActive: true } })).find((player) => player.nickname.toLowerCase() === nickname.toLowerCase());
  if (existing) return { player: existing, needsReview: false };

  const externalId = String(row.externalId ?? `${meta.sourceTool}:${teamId}:${nickname}`);
  const candidate = await prisma.entityMatchCandidate.findFirst({
    where: { source: "parsed-demo", entityType: "player", externalId, status: "needs_review" }
  });
  if (!candidate) {
    await prisma.entityMatchCandidate.create({
      data: {
        source: "parsed-demo",
        entityType: "player",
        externalId,
        externalName: nickname,
        matchedEntityId: null,
        confidence: 0.35,
        status: "needs_review",
        rawJson: JSON.stringify({ ...row, sourceTool: meta.sourceTool, matchId: meta.matchId })
      }
    });
  }
  const playerId = `parsed_demo_player_${slug(teamId)}_${slug(nickname)}_${hashRawRecord({ teamId, nickname, matchId: meta.matchId }).slice(0, 8)}`;
  const player = await prisma.player.upsert({
    where: { id: playerId },
    create: {
      id: playerId,
      nickname,
      teamId,
      role: typeof row.role === "string" ? row.role : "unknown",
      country: typeof row.country === "string" ? row.country : "unknown",
      sourceMode: "parsed_demo",
      sourceConfidence: meta.confidence,
      needsReview: true,
      matchId: meta.matchId,
      importBatchId: meta.importBatchId,
      sourceRecordId,
      isActive: true
    },
    update: {
      importBatchId: meta.importBatchId,
      sourceRecordId,
      isActive: true,
      needsReview: true
    }
  });
  return { player, needsReview: true };
}

async function applyPlayerStats(payload: Record<string, unknown>, context: ParsedDemoExportContext, meta: ParsedDemoExportMetadata, sourceRecordId: string) {
  let created = 0;
  let candidates = 0;
  for (const row of rows(payload.players).filter(hasPlayerStatCoverage)) {
    const team = resolveTeam(context, row);
    if (!team) continue;
    const { player, needsReview } = await resolveOrCreateScopedPlayer(row, team.id, meta, sourceRecordId);
    if (needsReview) candidates += 1;
    await prisma.playerStatSnapshot.create({
      data: {
        playerId: player.id,
        teamId: team.id,
        period: meta.period,
        maps: Math.round(num(row.maps, meta.sampleSize)),
        rounds: Math.round(num(row.rounds, Math.max(1, meta.sampleSize * 24))),
        kd: num(row.kd, num(row.kills, 1) / Math.max(1, num(row.deaths, 1))),
        kdDiff: Math.round(num(row.kdDiff, num(row.kills, 0) - num(row.deaths, 0))),
        rating: num(row.rating, 1),
        adr: num(row.adr, 70),
        kast: pct(row.kast, 0.7),
        impact: num(row.impact, 1),
        openingKillRating: num(row.openingKillRating, 1),
        clutchScore: pct(row.clutch, 0.5),
        volatilityScore: pct(row.volatility, 0.35),
        pressureScore: pct(row.pressurePerformance, 0.5),
        trendScore: num(row.ratingTrend, 0),
        ratingTrend: num(row.ratingTrend, 0),
        kdTrend: num(row.kdTrend, 0),
        adrTrend: num(row.adrTrend, 0),
        openingDuelTrend: num(row.openingDuelTrend, 0),
        clutchTrend: num(row.clutchTrend, 0),
        pressurePerformance: pct(row.pressurePerformance, 0.5),
        mapSpecificPerformance: pct(row.mapSpecificPerformance, 0.5),
        roleImpact: pct(row.roleImpact, 0.5),
        starDependency: pct(row.starDependency, 0.35),
        worstPlayerLiability: pct(row.worstPlayerLiability, 0.15),
        lanRating: num(row.lanRating, num(row.rating, 1)),
        onlineRating: num(row.onlineRating, num(row.rating, 1)),
        sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
        ...scope(meta, sourceRecordId)
      }
    });
    created += 1;
  }
  return { created, candidates };
}

async function applyMapStats(payload: Record<string, unknown>, context: ParsedDemoExportContext, meta: ParsedDemoExportMetadata, sourceRecordId: string) {
  let created = 0;
  for (const row of rows(payload.maps)) {
    const team = resolveTeam(context, row);
    if (!team) continue;
    await prisma.teamMapStat.create({
      data: {
        teamId: team.id,
        mapName: String(row.mapName ?? row.map),
        period: meta.period,
        mapsPlayed: Math.round(num(row.mapsPlayed, meta.sampleSize)),
        winRate: pct(row.winRate, 0.5),
        pickRate: pct(row.pickRate, 0.1),
        banRate: pct(row.banRate, 0.1),
        firstPickRate: pct(row.firstPickRate, 0.08),
        deciderRate: pct(row.deciderRate, 0.1),
        ctRoundWinRate: pct(row.ctRoundWinRate, 0.5),
        tRoundWinRate: pct(row.tRoundWinRate, 0.5),
        pistolWinRate: pct(row.pistolWinRate, 0.5),
        conversionAfterPistolWin: pct(row.conversionAfterPistolWin, 0.58),
        forceBuyWinRate: pct(row.forceBuyWinRate, 0.3),
        antiEcoLossRate: pct(row.antiEcoLossRate, 0.08),
        overtimeWinRate: pct(row.overtimeWinRate, 0.5),
        multipleOvertimeWinRate: pct(row.multipleOvertimeWinRate, 0.4),
        overtimeFrequency: pct(row.overtimeFrequency, 0.08),
        pressureRoundWinRate: pct(row.pressureRoundWinRate, 0.5),
        clutchInOvertimeScore: pct(row.clutchInOvertimeScore, 0.5),
        closingScore: pct(row.closingScore, 0.5),
        comebackScore: pct(row.comebackScore, 0.5),
        ecoRecoveryScore: pct(row.ecoRecoveryScore, 0.5),
        resetResistanceScore: pct(row.resetResistanceScore, 0.5),
        recentTrend: num(row.recentTrend, 0),
        openingRoundPerformance: pct(row.openingRoundPerformance, 0.5),
        sampleQuality: Math.min(1, Math.max(0.15, meta.sampleSize / 20)),
        sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
        ...scope(meta, sourceRecordId)
      }
    });
    created += 1;
  }
  return created;
}

function proxyRows(payload: Record<string, unknown>) {
  return [
    ...rows(payload.teamForms),
    ...rows(payload.rounds),
    ...rows(payload.economy),
    ...rows(payload.pistol),
    ...rows(payload.overtime)
  ];
}

async function applyTeamForms(payload: Record<string, unknown>, context: ParsedDemoExportContext, meta: ParsedDemoExportMetadata, sourceRecordId: string) {
  let created = 0;
  for (const row of proxyRows(payload)) {
    const team = resolveTeam(context, row);
    if (!team) continue;
    await prisma.teamFormSnapshot.create({
      data: {
        teamId: team.id,
        period: meta.period,
        matchesPlayed: Math.round(num(row.matchesPlayed, meta.sampleSize)),
        mapsPlayed: Math.round(num(row.mapsPlayed, num(row.maps, meta.sampleSize))),
        matchWinRate: pct(row.matchWinRate, pct(row.winRate, 0.5)),
        mapWinRate: pct(row.mapWinRate, pct(row.winRate, 0.5)),
        roundWinRate: pct(row.roundWinRate, 0.5),
        vsTop10WinRate: pct(row.vsTop10WinRate, 0.5),
        vsTop20WinRate: pct(row.vsTop20WinRate, 0.5),
        vsTop50WinRate: pct(row.vsTop50WinRate, 0.5),
        vsTop100WinRate: pct(row.vsTop100WinRate, 0.5),
        winVsTop10: Math.round(num(row.winVsTop10, 0)),
        winVsTop20: Math.round(num(row.winVsTop20, 0)),
        winVsTop50: Math.round(num(row.winVsTop50, 0)),
        winVsTop100: Math.round(num(row.winVsTop100, 0)),
        lossVsLowerRanked: Math.round(num(row.lossVsLowerRanked, 0)),
        opponentStrengthAdjustedForm: num(row.opponentStrengthAdjustedForm, num(row.formScore, 0.5)),
        currentStreak: Math.round(num(row.currentStreak, 0)),
        formScore: num(row.formScore, pct(row.winRate, 0.5)),
        volatilityScore: pct(row.volatilityScore, 0.35),
        matchesLast7Days: Math.round(num(row.matchesLast7Days, 0)),
        mapsLast7Days: Math.round(num(row.mapsLast7Days, 0)),
        travelRiskScore: pct(row.travelRiskScore, 0.2),
        timezoneShiftHours: Math.round(num(row.timezoneShiftHours, 0)),
        fatigueScore: pct(row.fatigueScore, 0.2),
        lanWinRate: pct(row.lanWinRate, pct(row.winRate, 0.5)),
        onlineWinRate: pct(row.onlineWinRate, pct(row.winRate, 0.5)),
        motivationScore: pct(row.motivationScore, 0.5),
        rosterStabilityScore: pct(row.rosterStabilityScore, 0.6),
        closeOutRate: pct(row.closeOutRate, 0.5),
        mapPointConversion: pct(row.mapPointConversion, 0.5),
        leadProtectionScore: pct(row.leadProtectionScore, 0.5),
        lostFromWinningPositionRate: pct(row.lostFromWinningPositionRate, 0.15),
        deciderCollapseRate: pct(row.deciderCollapseRate, 0.15),
        seriesCloseOutRate: pct(row.seriesCloseOutRate, 0.5),
        comebackFrom3RoundDeficit: pct(row.comebackFrom3RoundDeficit, 0.25),
        comebackFrom5RoundDeficit: pct(row.comebackFrom5RoundDeficit, 0.12),
        badHalfRecovery: pct(row.badHalfRecovery, 0.25),
        lostPistolRecovery: pct(row.lostPistolRecovery, 0.28),
        lostOwnPickRecovery: pct(row.lostOwnPickRecovery, 0.3),
        ...scope(meta, sourceRecordId)
      }
    });
    created += 1;
  }
  return created;
}

async function applyVeto(payload: Record<string, unknown>, context: ParsedDemoExportContext, meta: ParsedDemoExportMetadata, sourceRecordId: string) {
  let created = 0;
  for (const row of rows(payload.vetoHistory)) {
    const team = resolveTeam(context, row);
    if (!team) continue;
    await prisma.vetoPattern.create({
      data: {
        teamId: team.id,
        opponentTeamId: team.id === context.match.teamAId ? context.match.teamBId : context.match.teamAId,
        format: context.match.format,
        period: meta.period,
        mapName: String(row.mapName ?? row.map),
        pickProbability: pct(row.pickRate, 0.1),
        banProbability: pct(row.banRate, 0.1),
        punishProbability: pct(row.punishProbability, 0.1),
        weaknessScore: pct(row.weaknessScore, 0.35),
        comfortScore: pct(row.comfortScore, 0.55),
        confidenceScore: Math.min(0.92, Math.max(0.25, num(row.sampleSize, meta.sampleSize) / 25)),
        ...scope(meta, sourceRecordId)
      }
    });
    created += 1;
  }
  return created;
}

async function applyH2h(payload: Record<string, unknown>, context: ParsedDemoExportContext, meta: ParsedDemoExportMetadata, sourceRecordId: string) {
  let created = 0;
  for (const row of rows(payload.h2h)) {
    const winnerName = normalizeTeamName(row.winner ?? row.winnerTeamName);
    const winnerTeamId = winnerName === context.match.teamA.name.toLowerCase() ? context.match.teamAId : winnerName === context.match.teamB.name.toLowerCase() ? context.match.teamBId : null;
    await prisma.headToHead.create({
      data: {
        teamAId: context.match.teamAId,
        teamBId: context.match.teamBId,
        date: parseEvidenceDate(row.date) ?? meta.sourceDate,
        format: String(row.format ?? context.match.format),
        winnerTeamId,
        teamARosterSimilarity: pct(row.teamARosterSimilarity, 0.5),
        teamBRosterSimilarity: pct(row.teamBRosterSimilarity, 0.5),
        relevanceScore: pct(row.relevanceScore, 0.5),
        notes: typeof row.notes === "string" ? row.notes : "parsed_demo_export",
        ...scope(meta, sourceRecordId)
      }
    });
    created += 1;
  }
  return created;
}

export async function applyParsedDemoExport(input: string | unknown) {
  let payload: Record<string, unknown>;
  try {
    payload = parsePayload(input);
  } catch (error) {
    return { ok: false, applied: false, errors: [error instanceof Error ? error.message : "Invalid JSON."], warnings: [], recordsCreated: {}, candidatesNeedingReview: 0 };
  }

  const preview = await previewParsedDemoExport(payload);
  if (!preview.ok || !preview.matchId) {
    return { ...preview, applied: false, recordsCreated: {}, candidatesNeedingReview: 0 };
  }

  const context = await contextForMatch(preview.matchId);
  if (!context) {
    return { ...preview, ok: false, applied: false, errors: [`Match not found: ${preview.matchId}`], recordsCreated: {}, candidatesNeedingReview: 0 };
  }
  const shape = validateShape(payload, context);
  if (!shape.metadata) {
    return { ...preview, ok: false, applied: false, errors: [...preview.errors, "Parsed demo export metadata is incomplete."], recordsCreated: {}, candidatesNeedingReview: 0 };
  }
  const meta = shape.metadata;
  const before = await snapshot(meta.matchId);
  const saved = await saveExternalSourceRecord(prisma, {
    source: "parsed-demo",
    entityType: "parsed_demo_export",
    externalId: `${meta.importBatchId}_${hashRawRecord(payload).slice(0, 16)}`,
    entityId: meta.matchId,
    raw: {
      ...payload,
      sourceTool: meta.sourceTool,
      importBatchId: meta.importBatchId,
      importStatus: "valid",
      dataLeakageCheckPassed: meta.dataLeakageCheckPassed
    },
    fetchedAt: new Date(),
    sourceConfidence: meta.confidence
  });

  const playerStats = await applyPlayerStats(payload, context, meta, saved.record.id);
  const mapStats = await applyMapStats(payload, context, meta, saved.record.id);
  const teamForms = await applyTeamForms(payload, context, meta, saved.record.id);
  const veto = await applyVeto(payload, context, meta, saved.record.id);
  const h2h = await applyH2h(payload, context, meta, saved.record.id);
  if (meta.forecastEligible && playerStats.created + mapStats + teamForms + veto + h2h > 0) {
    await prisma.match.update({
      where: { id: meta.matchId },
      data: { sourceMode: "parsed_demo", sourceConfidence: meta.confidence }
    });
  }
  await rebuildSnapshots();
  await savePredictionAudit(meta.matchId);
  await refreshResearchPack(meta.matchId);
  const after = await snapshot(meta.matchId);

  return {
    ...preview,
    applied: true,
    sourceRecordId: saved.record.id,
    before,
    after,
    recordsCreated: {
      PlayerStatSnapshot: playerStats.created,
      TeamMapStat: mapStats,
      TeamFormSnapshot: teamForms,
      VetoPattern: veto,
      HeadToHead: h2h
    },
    candidatesNeedingReview: playerStats.candidates,
    whatChanged: [
      "ExternalSourceRecord saved for parsed_demo_export.",
      "Scoped parsed_demo records created with matchId/sourceRecordId/importBatchId/dataRole/leakage flags.",
      "Snapshots, feature snapshots, predictions and research queue refreshed."
    ]
  };
}
