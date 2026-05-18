import { prisma } from "./prisma";
import { applyManualEnrichment, validateManualEnrichment } from "./manualEnrichment";
import { isPlaceholderText, parseEvidenceDate } from "./realData/dataRole";
import { analystSheetTemplates, analystSheetTypes, type AnalystSheetType } from "./analystSheetTemplates";

const activeMapsFallback = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];
const coreBlocks: AnalystSheetType[] = ["roster", "player_stats", "map_stats", "veto_history"];

export type AnalystSheetInput = {
  sheetType: AnalystSheetType;
  content: string;
};

export type ParsedAnalystSheetRow = {
  lineNumber: number;
  values: Record<string, string>;
  delimiter: "," | ";" | "\t";
};

export type AnalystSheetValidationResult = {
  ok: boolean;
  sheetValid: boolean;
  manualRealPackValid: boolean;
  errors: string[];
  warnings: string[];
  matchId: string;
  rowsParsed: number;
  rowsBySheet: Record<string, number>;
  sheetsLoaded: AnalystSheetType[];
  coveredBlocks: string[];
  missingBlocks: string[];
  recordsPreview: string[];
  convertedManualRealPack: Record<string, unknown> | null;
  before?: unknown;
  afterPreview?: unknown;
  manualValidation?: unknown;
};

type MatchContext = {
  match: {
    id: string;
    startTime: Date;
    teamA: { id: string; name: string; slug: string };
    teamB: { id: string; name: string; slug: string };
  };
  teams: Array<{ id: string; name: string; slug: string }>;
  activeMaps: string[];
};

type RowWithSheet = ParsedAnalystSheetRow & { sheetType: AnalystSheetType };

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function countDelimiter(line: string, delimiter: "," | ";" | "\t") {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") quoted = !quoted;
    if (!quoted && char === delimiter) count += 1;
  }
  return count;
}

export function detectDelimiter(text: string): "," | ";" | "\t" {
  const header = stripBom(text).split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  return candidates.map((delimiter) => ({ delimiter, count: countDelimiter(header, delimiter) })).sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function parseDelimited(text: string, delimiter: "," | ";" | "\t") {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  const clean = stripBom(text);
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(current);
      current = "";
      continue;
    }
    if (!quoted && char === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    if (char !== "\r") current += char;
  }
  row.push(current);
  rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

function normalizeHeader(value: string) {
  return value.trim().replace(/^\uFEFF/, "");
}

export function parseDelimitedRows(content: string): { delimiter: "," | ";" | "\t"; rows: ParsedAnalystSheetRow[]; errors: string[] } {
  const delimiter = detectDelimiter(content);
  const table = parseDelimited(content, delimiter);
  if (!table.length) return { delimiter, rows: [], errors: ["Таблица пустая."] };
  const headers = table[0].map(normalizeHeader);
  const rows = table.slice(1).map((cells, index) => ({
    lineNumber: index + 2,
    delimiter,
    values: Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? ""]))
  })).filter((row) => Object.values(row.values).some((value) => value.trim().length > 0));
  return { delimiter, rows, errors: [] };
}

function toNumber(value: string | undefined, delimiter: "," | ";" | "\t") {
  if (value === undefined || value.trim() === "") return null;
  const normalized = delimiter === ";" ? value.trim().replace(",", ".") : value.trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value: string | undefined, delimiter: "," | ";" | "\t") {
  const parsed = toNumber(value, delimiter);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function placeholder(value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return isPlaceholderText(value) || ["team a", "team b", "player_name", "nickname", "source name", "source", "player"].includes(normalized);
}

function slug(value: string) {
  return value.toLowerCase().replace(/^de[_-]?/, "").replace(/[^a-z0-9]+/g, "");
}

export function normalizeMapName(value: string, activeMaps = activeMapsFallback) {
  const normalized = slug(value);
  return activeMaps.find((map) => slug(map) === normalized) ?? null;
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return matrix[a.length][b.length];
}

function suggestMapName(value: string, activeMaps: string[]) {
  const normalized = slug(value);
  const ranked = activeMaps.map((map) => ({ map, distance: levenshtein(normalized, slug(map)) })).sort((a, b) => a.distance - b.distance);
  return ranked[0]?.distance <= 2 ? ranked[0].map : null;
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

async function matchContext(matchId: string): Promise<MatchContext | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { teamA: true, teamB: true } });
  if (!match) return null;
  return {
    match: {
      id: match.id,
      startTime: new Date(match.startTime),
      teamA: { id: match.teamA.id, name: match.teamA.name, slug: match.teamA.slug },
      teamB: { id: match.teamB.id, name: match.teamB.name, slug: match.teamB.slug }
    },
    teams: [
      { id: match.teamA.id, name: match.teamA.name, slug: match.teamA.slug },
      { id: match.teamB.id, name: match.teamB.name, slug: match.teamB.slug }
    ],
    activeMaps: await activeMaps()
  };
}

function resolveTeamName(context: MatchContext, value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return context.teams.find((team) => team.name.toLowerCase() === normalized || team.slug.toLowerCase() === slug(normalized)) ?? null;
}

function validateHeaders(sheetType: AnalystSheetType, rows: ParsedAnalystSheetRow[]) {
  if (!rows.length) return [];
  const expected = analystSheetTemplates[sheetType].columns;
  const headers = new Set(Object.keys(rows[0].values));
  return expected.filter((column) => !headers.has(column)).map((column) => `${analystSheetTemplates[sheetType].filename}: missing column ${column}.`);
}

function validateCommon(row: RowWithSheet, context: MatchContext) {
  const errors: string[] = [];
  const values = row.values;
  if (!values.matchId) errors.push(`Строка ${row.lineNumber}: matchId обязателен.`);
  if (values.matchId && values.matchId !== context.match.id) errors.push(`Строка ${row.lineNumber}: matchId не совпадает с выбранным матчем.`);
  if (placeholder(values.sourceName)) errors.push(`Строка ${row.lineNumber}: sourceName обязателен и не должен быть шаблонным.`);
  const confidence = positiveNumber(values.confidence, row.delimiter);
  if (confidence === null) errors.push(`Строка ${row.lineNumber}: confidence должен быть больше 0.`);
  if (row.sheetType !== "news_events") {
    if (placeholder(values.teamName)) errors.push(`Строка ${row.lineNumber}: teamName похож на шаблонное значение.`);
    if (values.teamName && !resolveTeamName(context, values.teamName)) errors.push(`Строка ${row.lineNumber}: teamName не совпадает с командами выбранного матча.`);
    if (!values.collectedAt || !parseEvidenceDate(values.collectedAt)) errors.push(`Строка ${row.lineNumber}: collectedAt обязателен.`);
    if (!values.period) errors.push(`Строка ${row.lineNumber}: period обязателен.`);
    if (positiveNumber(values.sampleSize, row.delimiter) === null) errors.push(`Строка ${row.lineNumber}: sampleSize должен быть больше 0.`);
    const collectedAt = parseEvidenceDate(values.collectedAt);
    if (collectedAt && collectedAt.getTime() > context.match.startTime.getTime()) errors.push(`Строка ${row.lineNumber}: collectedAt позже startTime матча, это leakage для pre-match evidence.`);
  }
  return errors;
}

function validateMap(row: RowWithSheet, context: MatchContext) {
  const mapName = row.values.mapName;
  const normalized = mapName ? normalizeMapName(mapName, context.activeMaps) : null;
  if (normalized) return [];
  const suggestion = mapName ? suggestMapName(mapName, context.activeMaps) : null;
  return [
    suggestion
      ? `Строка ${row.lineNumber}: карта "${mapName}" не найдена. Возможно, вы имели в виду "${suggestion}".`
      : `Строка ${row.lineNumber}: карта "${mapName ?? ""}" не найдена.`
  ];
}

function validateNumeric(row: RowWithSheet, fields: string[]) {
  return fields.flatMap((field) => {
    const value = row.values[field];
    if (value === undefined || value === "") return [];
    return toNumber(value, row.delimiter) === null ? [`Строка ${row.lineNumber}: ${field} должен быть числом.`] : [];
  });
}

function validateRow(row: RowWithSheet, context: MatchContext) {
  const errors = validateCommon(row, context);
  const values = row.values;
  if (row.sheetType === "roster") {
    if (placeholder(values.nickname)) errors.push(`Строка ${row.lineNumber}: nickname похож на шаблонное значение ${values.nickname || "empty"}.`);
  }
  if (row.sheetType === "player_stats") {
    if (placeholder(values.nickname)) errors.push(`Строка ${row.lineNumber}: nickname похож на шаблонное значение ${values.nickname || "empty"}.`);
    errors.push(...validateNumeric(row, ["maps", "kills", "deaths", "assists", "kd", "rating", "adr", "kast", "impact", "openingKills", "openingDeaths", "clutchesWon", "clutchesAttempted"]));
    for (const field of ["maps", "kd", "rating"]) {
      if (positiveNumber(values[field], row.delimiter) === null) errors.push(`Строка ${row.lineNumber}: ${field} должен быть больше 0.`);
    }
  }
  if (row.sheetType === "map_stats") {
    errors.push(...validateMap(row, context));
    errors.push(...validateNumeric(row, ["mapsPlayed", "wins", "losses", "winRate", "roundsWon", "roundsLost", "ctRoundWinRate", "tRoundWinRate", "pickRate", "banRate", "deciderRate"]));
    if (positiveNumber(values.mapsPlayed, row.delimiter) === null) errors.push(`Строка ${row.lineNumber}: mapsPlayed должен быть больше 0.`);
  }
  if (row.sheetType === "veto_history") {
    errors.push(...validateMap(row, context));
    errors.push(...validateNumeric(row, ["sampleSize", "pickRate", "banRate", "deciderRate", "confidence"]));
    if (positiveNumber(values.sampleSize, row.delimiter) === null) errors.push(`Строка ${row.lineNumber}: sampleSize должен быть больше 0.`);
  }
  if (row.sheetType === "h2h") {
    if (!resolveTeamName(context, values.teamA) || !resolveTeamName(context, values.teamB)) errors.push(`Строка ${row.lineNumber}: teamA/teamB должны совпадать с выбранным матчем.`);
    if (values.mapName) errors.push(...validateMap(row, context));
    errors.push(...validateNumeric(row, ["scoreA", "scoreB", "rosterSimilarity"]));
    const date = parseEvidenceDate(values.collectedAt);
    if (date && date.getTime() > context.match.startTime.getTime()) errors.push(`Строка ${row.lineNumber}: H2H collectedAt позже startTime матча.`);
  }
  if (row.sheetType === "news_events") {
    if (placeholder(values.title)) errors.push(`Строка ${row.lineNumber}: title похож на шаблонное значение.`);
    if (placeholder(values.summary)) errors.push(`Строка ${row.lineNumber}: summary похож на шаблонное значение.`);
    if (!values.publishedAt || !parseEvidenceDate(values.publishedAt)) errors.push(`Строка ${row.lineNumber}: publishedAt обязателен.`);
    const publishedAt = parseEvidenceDate(values.publishedAt);
    if (publishedAt && publishedAt.getTime() > context.match.startTime.getTime()) errors.push(`Строка ${row.lineNumber}: publishedAt позже startTime матча.`);
    if (values.affectedTeam && !resolveTeamName(context, values.affectedTeam)) errors.push(`Строка ${row.lineNumber}: affectedTeam не совпадает с выбранным матчем.`);
    errors.push(...validateNumeric(row, ["impactScore", "confidence"]));
  }
  return errors;
}

function metadataFromRows(rows: RowWithSheet[], fallbackPeriod: string) {
  const first = rows[0]?.values ?? {};
  const confidenceValues = rows.map((row) => positiveNumber(row.values.confidence, row.delimiter)).filter((value): value is number => value !== null);
  const sampleValues = rows.map((row) => positiveNumber(row.values.sampleSize, row.delimiter)).filter((value): value is number => value !== null);
  const collectedValues = rows
    .map((row) => parseEvidenceDate(row.values.collectedAt || row.values.publishedAt))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  return {
    sourceName: first.sourceName || "analyst_sheet_import",
    collectedAt: (collectedValues[0] ?? new Date()).toISOString(),
    period: first.period || fallbackPeriod,
    sampleSize: sampleValues.length ? Math.max(1, Math.min(...sampleValues)) : Math.max(1, rows.length),
    confidence: confidenceValues.length ? Math.min(...confidenceValues) : 0.5
  };
}

function computeWinRate(row: RowWithSheet) {
  const direct = toNumber(row.values.winRate, row.delimiter);
  if (direct !== null) return direct;
  const wins = toNumber(row.values.wins, row.delimiter);
  const losses = toNumber(row.values.losses, row.delimiter);
  if (wins !== null && losses !== null && wins + losses > 0) return wins / (wins + losses);
  return 0;
}

function convertRowsToManualRealPack(matchId: string, rows: RowWithSheet[], context: MatchContext) {
  const rowsByType = Object.fromEntries(analystSheetTypes.map((sheetType) => [sheetType, rows.filter((row) => row.sheetType === sheetType)])) as Record<AnalystSheetType, RowWithSheet[]>;
  const allMetadata = metadataFromRows(rows, "analyst_sheet_import");
  const pack: Record<string, unknown> = {
    type: "manual_real_pack",
    matchId,
    sourceName: allMetadata.sourceName,
    collectedAt: allMetadata.collectedAt,
    period: allMetadata.period,
    sampleSize: allMetadata.sampleSize,
    confidence: allMetadata.confidence,
    rosters: {},
    playerStats: [],
    mapStats: [],
    vetoHistory: [],
    h2h: [],
    news: []
  };

  if (rowsByType.roster.length) {
    const rosters: Record<string, string[]> = {};
    for (const row of rowsByType.roster) {
      const team = resolveTeamName(context, row.values.teamName);
      if (!team) continue;
      rosters[team.name] = [...(rosters[team.name] ?? []), row.values.nickname];
    }
    if (
      rowsByType.player_stats.length === 0 &&
      rowsByType.map_stats.length === 0 &&
      rowsByType.veto_history.length === 0 &&
      rowsByType.h2h.length === 0 &&
      rowsByType.news_events.length === 0
    ) {
      return {
        type: "roster",
        matchId,
        sourceName: allMetadata.sourceName,
        collectedAt: allMetadata.collectedAt,
        period: allMetadata.period,
        sampleSize: allMetadata.sampleSize,
        confidence: allMetadata.confidence,
        teams: rosters,
        rosterMetadata: metadataFromRows(rowsByType.roster, "current_roster")
      };
    }
    pack.rosters = rosters;
    pack.rosterMetadata = metadataFromRows(rowsByType.roster, "current_roster");
  }

  if (rowsByType.player_stats.length) {
    pack.playerStats = rowsByType.player_stats.map((row) => ({
      team: resolveTeamName(context, row.values.teamName)?.name ?? row.values.teamName,
      nickname: row.values.nickname,
      maps: toNumber(row.values.maps, row.delimiter),
      kills: toNumber(row.values.kills, row.delimiter),
      deaths: toNumber(row.values.deaths, row.delimiter),
      assists: toNumber(row.values.assists, row.delimiter),
      kd: toNumber(row.values.kd, row.delimiter),
      rating: toNumber(row.values.rating, row.delimiter),
      adr: toNumber(row.values.adr, row.delimiter),
      kast: toNumber(row.values.kast, row.delimiter),
      impact: toNumber(row.values.impact, row.delimiter),
      openingKillRating: toNumber(row.values.openingKills, row.delimiter),
      openingDuelTrend: toNumber(row.values.openingDeaths, row.delimiter),
      clutch: toNumber(row.values.clutchesWon, row.delimiter),
      clutchTrend: toNumber(row.values.clutchesAttempted, row.delimiter)
    }));
    pack.playerStatsMetadata = metadataFromRows(rowsByType.player_stats, "last_30_days");
  }

  if (rowsByType.map_stats.length) {
    pack.mapStats = rowsByType.map_stats.map((row) => ({
      team: resolveTeamName(context, row.values.teamName)?.name ?? row.values.teamName,
      mapName: normalizeMapName(row.values.mapName, context.activeMaps) ?? row.values.mapName,
      mapsPlayed: toNumber(row.values.mapsPlayed, row.delimiter),
      wins: toNumber(row.values.wins, row.delimiter),
      losses: toNumber(row.values.losses, row.delimiter),
      winRate: computeWinRate(row),
      roundsWon: toNumber(row.values.roundsWon, row.delimiter),
      roundsLost: toNumber(row.values.roundsLost, row.delimiter),
      ctRoundWinRate: toNumber(row.values.ctRoundWinRate, row.delimiter),
      tRoundWinRate: toNumber(row.values.tRoundWinRate, row.delimiter),
      pickRate: toNumber(row.values.pickRate, row.delimiter),
      banRate: toNumber(row.values.banRate, row.delimiter),
      deciderRate: toNumber(row.values.deciderRate, row.delimiter)
    }));
    pack.mapStatsMetadata = metadataFromRows(rowsByType.map_stats, "last_90_days");
  }

  if (rowsByType.veto_history.length) {
    pack.vetoHistory = rowsByType.veto_history.map((row) => ({
      team: resolveTeamName(context, row.values.teamName)?.name ?? row.values.teamName,
      mapName: normalizeMapName(row.values.mapName, context.activeMaps) ?? row.values.mapName,
      sampleSize: toNumber(row.values.sampleSize, row.delimiter),
      pickRate: toNumber(row.values.pickRate, row.delimiter),
      banRate: toNumber(row.values.banRate, row.delimiter),
      deciderRate: toNumber(row.values.deciderRate, row.delimiter)
    }));
    pack.vetoHistoryMetadata = metadataFromRows(rowsByType.veto_history, "last_90_days");
  }

  if (rowsByType.h2h.length) {
    pack.h2h = rowsByType.h2h.map((row) => ({
      date: row.values.date,
      teamA: resolveTeamName(context, row.values.teamA)?.name ?? row.values.teamA,
      teamB: resolveTeamName(context, row.values.teamB)?.name ?? row.values.teamB,
      winner: resolveTeamName(context, row.values.winner)?.name ?? row.values.winner,
      format: row.values.format,
      mapName: row.values.mapName ? normalizeMapName(row.values.mapName, context.activeMaps) ?? row.values.mapName : undefined,
      scoreA: toNumber(row.values.scoreA, row.delimiter),
      scoreB: toNumber(row.values.scoreB, row.delimiter),
      teamARosterSimilarity: toNumber(row.values.rosterSimilarity, row.delimiter),
      teamBRosterSimilarity: toNumber(row.values.rosterSimilarity, row.delimiter),
      relevanceScore: toNumber(row.values.rosterSimilarity, row.delimiter)
    }));
    pack.h2hMetadata = metadataFromRows(rowsByType.h2h, "current_roster_h2h");
  }

  if (rowsByType.news_events.length) {
    pack.news = rowsByType.news_events.map((row) => ({
      sourceName: row.values.sourceName,
      sourceType: row.values.sourceType || "manual_note",
      title: row.values.title,
      summary: row.values.summary,
      publishedAt: row.values.publishedAt,
      team: resolveTeamName(context, row.values.affectedTeam)?.name ?? row.values.affectedTeam,
      playerName: row.values.affectedPlayer,
      eventType: row.values.eventType,
      reliability: row.values.reliability,
      impactScore: toNumber(row.values.impactScore, row.delimiter),
      confidence: toNumber(row.values.confidence, row.delimiter)
    }));
    pack.newsMetadata = metadataFromRows(rowsByType.news_events, "latest");
  }

  return pack;
}

function coveredBlocks(sheets: AnalystSheetInput[]) {
  return [...new Set(sheets.filter((sheet) => sheet.content.trim()).map((sheet) => analystSheetTemplates[sheet.sheetType].coveredBlock))];
}

function missingBlocks(covered: string[]) {
  const set = new Set(covered);
  return coreBlocks.map((sheetType) => analystSheetTemplates[sheetType].coveredBlock).filter((block) => !set.has(block));
}

export async function validateAnalystSheetImport(input: { matchId: string; sheets: AnalystSheetInput[] }) : Promise<AnalystSheetValidationResult> {
  const context = await matchContext(input.matchId);
  const errors: string[] = [];
  const warnings: string[] = ["Шаблон — это пример структуры. Его нельзя применить без реальных данных."];
  const parsedRows: RowWithSheet[] = [];
  const rowsBySheet: Record<string, number> = {};

  if (!context) {
    return {
      ok: false,
      sheetValid: false,
      manualRealPackValid: false,
      errors: [`Match not found: ${input.matchId}`],
      warnings,
      matchId: input.matchId,
      rowsParsed: 0,
      rowsBySheet,
      sheetsLoaded: [],
      coveredBlocks: [],
      missingBlocks: coreBlocks,
      recordsPreview: [],
      convertedManualRealPack: null
    };
  }

  const sheets = input.sheets.filter((sheet) => analystSheetTypes.includes(sheet.sheetType) && sheet.content.trim().length > 0);
  if (!sheets.length) errors.push("Таблица пустая.");
  for (const sheet of sheets) {
    if (sheet.content.trim().toLowerCase().endsWith(".xlsx")) warnings.push("XLSX parser будет позже. Сейчас сохраните таблицу как CSV или TSV.");
    const parsed = parseDelimitedRows(sheet.content);
    errors.push(...parsed.errors);
    errors.push(...validateHeaders(sheet.sheetType, parsed.rows));
    rowsBySheet[sheet.sheetType] = parsed.rows.length;
    for (const row of parsed.rows) {
      const fullRow: RowWithSheet = { ...row, sheetType: sheet.sheetType };
      errors.push(...validateRow(fullRow, context));
      parsedRows.push(fullRow);
    }
  }

  const covered = coveredBlocks(sheets);
  const missing = missingBlocks(covered);
  if (covered.length === 1 && covered[0] === "roster") {
    warnings.push("Составы улучшат покрытие данных, но для аналитического прогноза ещё нужны player stats, map stats и veto.");
  }
  const convertedManualRealPack = parsedRows.length ? convertRowsToManualRealPack(input.matchId, parsedRows, context) : null;
  const manualValidation = convertedManualRealPack ? await validateManualEnrichment(JSON.stringify(convertedManualRealPack)) : null;
  const manualRecord = manualValidation && typeof manualValidation === "object" ? manualValidation as Record<string, unknown> : null;
  const manualErrors = Array.isArray(manualRecord?.errors) ? manualRecord.errors.map(String) : [];
  const manualWarnings = Array.isArray(manualRecord?.warnings) ? manualRecord.warnings.map(String) : [];
  const sheetValid = errors.length === 0;
  const manualRealPackValid = Boolean(manualRecord?.ok);

  return {
    ok: sheetValid && manualRealPackValid,
    sheetValid,
    manualRealPackValid,
    errors: [...errors, ...manualErrors],
    warnings: [...warnings, ...manualWarnings],
    matchId: input.matchId,
    rowsParsed: parsedRows.length,
    rowsBySheet,
    sheetsLoaded: sheets.map((sheet) => sheet.sheetType),
    coveredBlocks: covered,
    missingBlocks: missing,
    recordsPreview: Array.isArray(manualRecord?.creates) ? manualRecord.creates.map(String) : [],
    convertedManualRealPack,
    before: manualRecord?.before,
    afterPreview: manualRecord?.afterPreview,
    manualValidation
  };
}

export async function previewAnalystSheetImport(input: { matchId: string; sheets: AnalystSheetInput[] }) {
  return validateAnalystSheetImport(input);
}

export async function applyAnalystSheetImport(input: { matchId: string; sheets: AnalystSheetInput[] }) {
  const validation = await validateAnalystSheetImport(input);
  if (!validation.ok || !validation.convertedManualRealPack) {
    return { ...validation, applied: false };
  }
  const applied = await applyManualEnrichment(JSON.stringify(validation.convertedManualRealPack));
  return {
    ...validation,
    applied: Boolean((applied as Record<string, unknown>).applied),
    applyResult: applied
  };
}
