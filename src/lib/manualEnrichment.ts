import { prisma } from "./prisma";
import { buildPredictionInput } from "./prediction/buildPredictionInput";
import { calculatePrediction } from "./prediction/calculatePrediction";
import { hashRawRecord, saveExternalSourceRecord } from "./sources/sourceReconciler";
import { rebuildSnapshots, savePredictionAudit } from "./sources/sourceScheduler";
import { refreshResearchPack } from "./researchQueue";
import { sourceModeForSource, type SourceName } from "./sources/types";
import { saveManualNewsItem } from "./news/manualNews";
import { deriveDataDepth, deriveRealDataDepth, type DataDepth } from "./ui/forecastUx";
import {
  calculateManualBlockQuality,
  calculateManualRealPackQuality,
  detectManualRealPlaceholderPayload,
  manualPackUnlocks,
  qualityMetadataFromRecord,
  type ManualBlockQuality,
  type ManualPackBlock,
  type ManualPackStatus
} from "./manualRealQuality";
import {
  evaluatePreMatchLeakage,
  isPlaceholderText,
  looksLikeTemplateUrl,
  normalizeDataRole,
  parseEvidenceDate,
  type RealDataRole
} from "./realData/dataRole";

export { manualEnrichmentTemplates } from "./manualEnrichmentTemplates";

const activeMapsFallback = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];

type Preview = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  creates: string[];
  updates: string[];
  blockStatuses?: ManualBlockPreview[];
  whatStillMissing?: string[];
  matchId?: string;
  type?: string;
  sourceMode?: "manual_real" | "analyst_sample" | "parsed_demo";
  importBatchId?: string;
  realActionable?: boolean;
  pipelineProof?: boolean;
  manualRealPackQuality?: {
    score: number;
    label: string;
    canReachL3: boolean;
    reasons: string[];
    warnings: string[];
  };
  before?: EnrichmentSnapshot | null;
  afterPreview?: EnrichmentSnapshot | null;
};

type EnrichmentSnapshot = {
  readiness: string;
  realForecastReady: boolean;
  dataQuality: number;
  confidence: number;
  probability: string;
  previewDataDepth: DataDepth;
  realDataDepth: DataDepth;
  missingBlocks: string[];
};

type EnrichmentMetadata = {
  isSample: boolean;
  source: "manual" | "analyst-sample" | "parsed-demo";
  recordSource: "manual_enrichment" | "analyst_sample" | "parsed_demo";
  playerSourceMode: "manual_real" | "analyst_sample" | "parsed_demo";
  importBatchId: string;
  sourceRecordId: string;
  matchId: string;
  sourceConfidence: number;
  collectedAt: Date;
  sourceDate: Date;
  dataRole: RealDataRole;
  dataLeakageCheckPassed: boolean;
};

type MatchTeams = Awaited<ReturnType<typeof matchTeams>>;

type ManualBlockPreview = {
  block: ManualPackBlock;
  label: string;
  status: ManualPackStatus;
  quality: number;
  readinessUnlock: string;
  warnings: string[];
  errors: string[];
};

const manualBlocks: Array<{ block: ManualPackBlock; label: string }> = [
  { block: "ranking", label: "Ranking confirmation" },
  { block: "roster", label: "Roster" },
  { block: "player_stats", label: "Player stats" },
  { block: "map_stats", label: "Map stats" },
  { block: "veto_history", label: "Veto history" },
  { block: "h2h", label: "H2H" },
  { block: "news", label: "News / roster events" }
];

function analystSampleEnabled() {
  return process.env.ENABLE_ANALYST_SAMPLE === "true";
}

function isSamplePayload(payload: Record<string, unknown>) {
  return payload.type === "analyst_pack" || payload.source === "analyst_sample" || payload.source === "manual_sample";
}

function isParsedDemoPayload(payload: Record<string, unknown>) {
  return payload.type === "parsed_demo" || payload.source === "parsed_demo";
}

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

function parsePayload(text: string) {
  if (!text.trim()) throw new Error("JSON payload is empty.");
  return JSON.parse(text) as Record<string, unknown>;
}

function typedSourceMode(source: string) {
  const known: SourceName[] = ["grid", "pandascore", "liquipedia", "valve-rankings", "cs-updates", "faceit", "telegram-news", "parsed-demo", "analyst-sample", "manual", "mock", "official-future"];
  return known.includes(source as SourceName) ? sourceModeForSource(source as SourceName) : "partial";
}

function sourceScope(meta: EnrichmentMetadata) {
  return {
    source: meta.recordSource,
    sourceMode: meta.playerSourceMode,
    matchId: meta.matchId,
    importBatchId: meta.importBatchId,
    sourceRecordId: meta.sourceRecordId,
    isActive: true,
    collectedAt: meta.collectedAt,
    sourceDate: meta.sourceDate,
    dataRole: meta.dataRole,
    dataLeakageCheckPassed: meta.dataLeakageCheckPassed
  };
}

function sourceMetadata(payload: Record<string, unknown>) {
  const metadata = qualityMetadataFromRecord(payload);
  const sourceDateRaw = payload.sourceDate ?? payload.matchDate ?? payload.parsedAt ?? metadata.collectedAt;
  const collectedAt = parseEvidenceDate(metadata.collectedAt);
  const sourceDate = parseEvidenceDate(sourceDateRaw);
  return {
    ...metadata,
    collectedAtDate: collectedAt,
    sourceDate,
    dataRole: normalizeDataRole(payload.dataRole ?? record(payload.metadata).dataRole, isParsedDemoPayload(payload) ? "historical_team_form" : "pre_match_evidence"),
    sourceMatchId: typeof payload.sourceMatchId === "string" ? payload.sourceMatchId : typeof payload.parsedMatchId === "string" ? payload.parsedMatchId : null
  };
}

function resolveTeamFromRow(teams: MatchTeams, row: Record<string, unknown>) {
  if (!teams) return null;
  if (typeof row.teamId === "string") {
    const byId = teams.teams.find((team) => team.id === row.teamId);
    if (byId) return byId;
  }
  return resolveTeamName(teams, row.team ?? row.teamName ?? row.name);
}

function parsedDemoSections(payload: Record<string, unknown>) {
  return {
    playerStats: rows(payload.playerStats ?? payload.players),
    mapStats: rows(payload.mapStats ?? payload.maps),
    vetoHistory: rows(payload.vetoHistory ?? payload.veto),
    teamForms: rows(payload.teamForms ?? payload.historicalTeamForm),
    roundEconomy: rows(payload.roundEconomy ?? payload.roundEconomyStats)
  };
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

async function matchTeams(matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { teamA: true, teamB: true } });
  if (!match) return null;
  return {
    match,
    teams: [match.teamA, match.teamB],
    byName: new Map([match.teamA, match.teamB].map((team) => [team.name.toLowerCase(), team]))
  };
}

function resolveTeamName(teams: MatchTeams, teamName: unknown) {
  if (!teams || typeof teamName !== "string") return null;
  const normalized = teamName.toLowerCase();
  return teams.byName.get(normalized) ?? teams.teams.find((team) => team.slug === slug(teamName)) ?? null;
}

function analystPackSections(payload: Record<string, unknown>) {
  return {
    rosters: record(payload.rosters),
    playerStats: rows(payload.playerStats),
    mapStats: rows(payload.mapStats),
    vetoHistory: rows(payload.vetoHistory),
    h2h: rows(payload.h2h),
    news: rows(payload.news)
  };
}

function manualPackSections(payload: Record<string, unknown>) {
  return {
    ranking: record(payload.rankingConfirmation ?? payload.ranking),
    rosters: record(payload.rosters ?? payload.teams),
    playerStats: rows(payload.playerStats ?? payload.players),
    mapStats: rows(payload.mapStats ?? payload.teams),
    vetoHistory: rows(payload.vetoHistory),
    h2h: rows(payload.h2h ?? payload.entries),
    news: rows(payload.news ?? payload.items),
    teamForms: rows(payload.teamForms ?? payload.historicalTeamForm)
  };
}

function blockMetadata(payload: Record<string, unknown>, block: ManualPackBlock) {
  const sections = manualPackSections(payload);
  const sectionValue =
    block === "ranking" ? sections.ranking :
    block === "roster" ? record((payload as Record<string, unknown>).rosterMetadata ?? (payload as Record<string, unknown>).roster) :
    block === "player_stats" ? record((payload as Record<string, unknown>).playerStatsMetadata) :
    block === "map_stats" ? record((payload as Record<string, unknown>).mapStatsMetadata) :
    block === "veto_history" ? record((payload as Record<string, unknown>).vetoMetadata ?? (payload as Record<string, unknown>).vetoHistoryMetadata) :
    block === "h2h" ? record((payload as Record<string, unknown>).h2hMetadata) :
    record((payload as Record<string, unknown>).newsMetadata);
  return {
    ...qualityMetadataFromRecord(payload),
    ...qualityMetadataFromRecord(sectionValue)
  };
}

function qualityPreview(payload: Record<string, unknown>, block: ManualPackBlock, valuesValid: boolean) {
  return calculateManualBlockQuality(block, blockMetadata(payload, block), valuesValid);
}

function addQualityMessages(quality: ManualBlockQuality, warnings: string[], errors: string[]) {
  warnings.push(...quality.warnings.map((warning) => `${quality.block}: ${warning}`));
  if (quality.status === "needs_review") warnings.push(`${quality.block}: low source trust; block will be accepted as partial only.`);
  if (quality.status === "invalid") errors.push(`${quality.block}: block quality invalid.`);
}

function missingAfterBlocks(statuses: ManualBlockPreview[]) {
  const applied = new Set(statuses.filter((status) => status.status === "valid" || status.status === "applied").map((status) => status.block));
  const missing: string[] = [];
  if (!applied.has("roster")) missing.push("bind roster");
  if (!applied.has("player_stats")) missing.push("import player stats");
  if (!applied.has("map_stats")) missing.push("import map stats");
  if (!applied.has("veto_history")) missing.push("import veto history");
  if (!applied.has("h2h")) missing.push("add H2H");
  if (!applied.has("news")) missing.push("add news/roster events");
  return missing;
}

function makeBlockPreview(block: ManualPackBlock, status: ManualPackStatus, quality = 0, warnings: string[] = [], errors: string[] = []): ManualBlockPreview {
  const label = manualBlocks.find((item) => item.block === block)?.label ?? block;
  return {
    block,
    label,
    status,
    quality,
    readinessUnlock: manualPackUnlocks[block],
    warnings,
    errors
  };
}

function validateManualMetadata(payload: Record<string, unknown>, block: ManualPackBlock, valuesValid: boolean, warnings: string[], errors: string[]) {
  const metadata = blockMetadata(payload, block);
  const quality = calculateManualBlockQuality(block, metadata, valuesValid);
  if (!metadata.sourceName) errors.push(`${block}: sourceName is required for manual_real.`);
  if (!metadata.collectedAt) errors.push(`${block}: collectedAt is required for manual_real.`);
  if (!metadata.period) errors.push(`${block}: period is required for manual_real.`);
  addQualityMessages(quality, warnings, errors);
  return quality;
}

function rate(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
}

function positive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function manualPackSnapshotFrom(
  base: EnrichmentSnapshot,
  params: {
    ok: boolean;
    type: string;
    sample: boolean;
    manualRealPackQuality?: Preview["manualRealPackQuality"];
    warnings: string[];
    missing: string[];
  }
): EnrichmentSnapshot {
  if (!params.ok || params.sample || params.type !== "manual_real_pack" || !params.manualRealPackQuality?.canReachL3) {
    return {
      ...base,
      missingBlocks: params.missing.length ? params.missing : base.missingBlocks
    };
  }

  const expectedDepth: DataDepth = {
    level: 4,
    label: "Карты/veto",
    description: "Ожидается scoped manual_real coverage: составы, player stats, map stats и veto history."
  };
  return {
    readiness: base.readiness === "L4_DEEP" ? "L4_DEEP" : "L3_ANALYTICAL",
    realForecastReady: params.manualRealPackQuality.score >= 65 && !params.warnings.some((warning) => warning.toLowerCase().includes("leakage")),
    dataQuality: Math.max(base.dataQuality, 60),
    confidence: Math.max(base.confidence, 58),
    probability: base.probability,
    previewDataDepth: expectedDepth,
    realDataDepth: expectedDepth,
    missingBlocks: params.missing.filter((item) => !["bind roster", "import player stats", "import map stats", "import veto history"].includes(item))
  };
}

function rowNickname(row: Record<string, unknown>) {
  return typeof row.nickname === "string" ? row.nickname.trim() : typeof row.playerName === "string" ? row.playerName.trim() : "";
}

export async function validateManualEnrichment(text: string): Promise<Preview> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const creates: string[] = [];
  const updates: string[] = [];
  let payload: Record<string, unknown>;
  try {
    payload = parsePayload(text);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "Invalid JSON."], warnings, creates, updates };
  }

  const matchId = typeof payload.matchId === "string" ? payload.matchId : "";
  const type = typeof payload.type === "string" ? payload.type : "";
  const sample = isSamplePayload(payload);
  const parsedDemo = isParsedDemoPayload(payload) && !sample;
  const sourceMode = sample ? "analyst_sample" : parsedDemo ? "parsed_demo" : "manual_real";
  const importBatchId = sample
    ? `sample_${matchId || "unknown"}_${hashRawRecord(payload).slice(0, 12)}`
    : parsedDemo
      ? `parsed_demo_${matchId || "unknown"}_${hashRawRecord(payload).slice(0, 12)}`
      : `manual_${matchId || "unknown"}_${hashRawRecord(payload).slice(0, 12)}`;

  if (sample && !analystSampleEnabled()) errors.push("ENABLE_ANALYST_SAMPLE=false: sample analyst pack is disabled.");
  if (!sample) {
    const fakeSignals = detectManualRealPlaceholderPayload(payload);
    if (fakeSignals.isPlaceholder) {
      errors.push("Похоже, что это шаблон, а не реальные данные.");
      warnings.push(...fakeSignals.reasons);
    }
  }
  if (!matchId) errors.push("matchId is required.");
  if (!type) errors.push("type is required.");
  const teams = matchId ? await matchTeams(matchId) : null;
  if (!teams) errors.push(`Match not found: ${matchId}`);
  const maps = await activeMaps();
  const blockStatuses: ManualBlockPreview[] = [];

  if (type === "analyst_pack") {
    const sections = analystPackSections(payload);
    if (!Object.keys(sections.rosters).length) errors.push("analyst_pack.rosters is required.");
    if (sections.playerStats.length < 10) errors.push("analyst_pack.playerStats should include both five-player rosters.");
    if (sections.mapStats.length < 2) errors.push("analyst_pack.mapStats is required for both teams.");
    if (sections.vetoHistory.length < 2) errors.push("analyst_pack.vetoHistory is required for both teams.");
    for (const [teamName, players] of Object.entries(sections.rosters)) {
      if (!resolveTeamName(teams, teamName)) warnings.push(`Team ${teamName} is not matched for this match; needs_review candidate required.`);
      if (!Array.isArray(players) || players.length < 5) errors.push(`Roster for ${teamName} must include five player names.`);
      else creates.push(`${players.length} analyst_sample roster/player links for ${teamName}`);
    }
    for (const player of sections.playerStats) {
      if (!resolveTeamName(teams, player.team)) warnings.push(`Team ${String(player.team)} is not matched for this match.`);
      for (const field of ["kd", "rating", "adr", "kast", "impact", "maps"]) {
        if (!Number.isFinite(Number(player[field]))) errors.push(`analyst_pack playerStats ${field} must be numeric.`);
      }
    }
    for (const row of [...sections.mapStats, ...sections.vetoHistory]) {
      if (!resolveTeamName(teams, row.team)) warnings.push(`Team ${String(row.team)} is not matched for this match.`);
      if (!maps.includes(String(row.mapName))) errors.push(`mapName ${String(row.mapName)} is not in active map pool.`);
    }
    creates.push(`${sections.playerStats.length} analyst_sample PlayerStatSnapshot records scoped to ${matchId}`);
    creates.push(`${sections.mapStats.length} analyst_sample TeamMapStat records scoped to ${matchId}`);
    creates.push(`${sections.vetoHistory.length} analyst_sample VetoPattern records scoped to ${matchId}`);
    creates.push(`${sections.h2h.length} analyst_sample HeadToHead records scoped to ${matchId}`);
    creates.push(`${sections.news.length} analyst_sample NewsItem records scoped to ${matchId}`);
  } else if (type === "manual_real_pack") {
    const sections = manualPackSections(payload);
    const metadata = sourceMetadata(payload);
    if (!metadata.sourceName || isPlaceholderText(metadata.sourceName)) errors.push("manual_real_pack sourceName is required and must not be a template value.");
    if (!metadata.collectedAt) errors.push("manual_real_pack collectedAt is required.");
    if (!metadata.period) errors.push("manual_real_pack period is required.");
    if ((metadata.sampleSize ?? 0) <= 0) errors.push("manual_real_pack sampleSize must be > 0.");
    if ((metadata.confidence ?? 0) <= 0) errors.push("manual_real_pack confidence must be > 0.");
    if (looksLikeTemplateUrl(metadata.sourceUrl)) errors.push("manual_real_pack sourceUrl looks like a template URL.");
    if (teams) {
      const leakage = evaluatePreMatchLeakage({
        dataRole: metadata.dataRole,
        sourceDate: metadata.sourceDate,
        collectedAt: metadata.collectedAtDate,
        sourceMatchId: metadata.sourceMatchId,
        targetMatchId: matchId,
        targetStartTime: new Date(teams.match.startTime)
      });
      if (!leakage.passed) {
        errors.push(...leakage.reasons.map((reason) => `manual_real_pack leakage: ${reason}`));
      }
    }
    const valuesValidByBlock: Record<ManualPackBlock, boolean> = {
      ranking: true,
      roster: true,
      player_stats: true,
      map_stats: true,
      veto_history: true,
      h2h: true,
      news: true
    };
    if (Object.keys(sections.ranking).length) {
      creates.push("manual_real ranking confirmation raw/reference");
    }
    if (!Object.keys(sections.rosters).length) valuesValidByBlock.roster = false;
    const rosterPlayersByTeamId = new Map<string, string[]>();
    for (const [teamName, players] of Object.entries(sections.rosters)) {
      const team = resolveTeamName(teams, teamName);
      if (!team) {
        errors.push(`Roster team ${teamName} must match one selected match team.`);
        valuesValidByBlock.roster = false;
      }
      if (!Array.isArray(players) || players.length === 0) {
        errors.push(`Roster for ${teamName} must include player names.`);
        valuesValidByBlock.roster = false;
      } else {
        if (players.length !== 5) {
          errors.push(`Roster for ${teamName} must include exactly five player names.`);
          valuesValidByBlock.roster = false;
        }
        if (players.some((player) => isPlaceholderText(player))) {
          errors.push(`Roster for ${teamName} contains placeholder player names.`);
          valuesValidByBlock.roster = false;
        }
        if (team) rosterPlayersByTeamId.set(team.id, players.map(String).map((player) => player.trim()).filter(Boolean));
        creates.push(`${players.length} manual_real roster/player links for ${teamName}`);
      }
    }
    if (teams) {
      for (const team of teams.teams) {
        if (!rosterPlayersByTeamId.has(team.id)) {
          errors.push(`Roster for ${team.name} is required.`);
          valuesValidByBlock.roster = false;
        }
      }
    }
    if (sections.playerStats.length) {
      const playerStatsByTeamId = new Map<string, Set<string>>();
      for (const player of sections.playerStats) {
        const team = resolveTeamFromRow(teams, player);
        if (!team) {
          errors.push(`playerStats team ${String(player.team ?? player.teamName ?? player.teamId)} must match one selected match team.`);
          valuesValidByBlock.player_stats = false;
        }
        const nickname = rowNickname(player);
        if (!nickname) {
          errors.push("playerStats nickname is required.");
          valuesValidByBlock.player_stats = false;
        }
        if (isPlaceholderText(nickname)) { errors.push("playerStats nickname must not be a placeholder."); valuesValidByBlock.player_stats = false; }
        if (!positive(player.kd)) { errors.push("playerStats kd must be > 0."); valuesValidByBlock.player_stats = false; }
        if (!positive(player.rating)) { errors.push("playerStats rating must be > 0."); valuesValidByBlock.player_stats = false; }
        if (num(player.adr, -1) < 0) { errors.push("playerStats adr must be >= 0."); valuesValidByBlock.player_stats = false; }
        if (!rate(player.kast)) { errors.push("playerStats kast must be 0..100."); valuesValidByBlock.player_stats = false; }
        if (!positive(player.maps)) { errors.push("playerStats maps must be > 0."); valuesValidByBlock.player_stats = false; }
        if (team && nickname) {
          const set = playerStatsByTeamId.get(team.id) ?? new Set<string>();
          set.add(nickname.toLowerCase());
          playerStatsByTeamId.set(team.id, set);
        }
      }
      for (const [teamId, rosterPlayers] of rosterPlayersByTeamId.entries()) {
        const stats = playerStatsByTeamId.get(teamId) ?? new Set<string>();
        const missingStats = rosterPlayers.filter((player) => !stats.has(player.toLowerCase()));
        if (missingStats.length) {
          errors.push(`playerStats missing roster players: ${missingStats.join(", ")}.`);
          valuesValidByBlock.player_stats = false;
        }
      }
      creates.push(`${sections.playerStats.length} manual_real PlayerStatSnapshot records scoped to ${matchId}`);
    } else valuesValidByBlock.player_stats = false;
    if (sections.mapStats.length) {
      const mapStatsTeams = new Set<string>();
      for (const row of sections.mapStats) {
        const team = resolveTeamFromRow(teams, row);
        if (!team) { errors.push(`mapStats team ${String(row.team ?? row.teamName ?? row.teamId)} must match one selected match team.`); valuesValidByBlock.map_stats = false; }
        if (team) mapStatsTeams.add(team.id);
        if (!maps.includes(String(row.mapName))) { errors.push(`mapName ${String(row.mapName)} is not in active map pool.`); valuesValidByBlock.map_stats = false; }
        if (!positive(row.mapsPlayed)) { errors.push("mapStats mapsPlayed must be > 0."); valuesValidByBlock.map_stats = false; }
        for (const field of ["winRate", "pickRate", "banRate"]) {
          if (!rate(row[field])) { errors.push(`mapStats ${field} must be 0..100.`); valuesValidByBlock.map_stats = false; }
        }
      }
      if (teams) {
        for (const team of teams.teams) {
          if (!mapStatsTeams.has(team.id)) { errors.push(`mapStats for ${team.name} is required.`); valuesValidByBlock.map_stats = false; }
        }
      }
      creates.push(`${sections.mapStats.length} manual_real TeamMapStat records scoped to ${matchId}`);
    } else valuesValidByBlock.map_stats = false;
    if (sections.vetoHistory.length) {
      const vetoTeams = new Set<string>();
      for (const row of sections.vetoHistory) {
        const team = resolveTeamFromRow(teams, row);
        if (!team) { errors.push(`vetoHistory team ${String(row.team ?? row.teamName ?? row.teamId)} must match one selected match team.`); valuesValidByBlock.veto_history = false; }
        if (team) vetoTeams.add(team.id);
        if (!maps.includes(String(row.mapName))) { errors.push(`mapName ${String(row.mapName)} is not in active map pool.`); valuesValidByBlock.veto_history = false; }
        for (const field of ["pickRate", "banRate", "deciderRate"]) {
          if (!rate(row[field])) { errors.push(`vetoHistory ${field} must be 0..100.`); valuesValidByBlock.veto_history = false; }
        }
        if (!positive(row.sampleSize)) { errors.push("vetoHistory sampleSize must be > 0."); valuesValidByBlock.veto_history = false; }
      }
      if (teams) {
        for (const team of teams.teams) {
          if (!vetoTeams.has(team.id)) { errors.push(`vetoHistory for ${team.name} is required.`); valuesValidByBlock.veto_history = false; }
        }
      }
      creates.push(`${sections.vetoHistory.length} manual_real VetoPattern records scoped to ${matchId}`);
    } else valuesValidByBlock.veto_history = false;
    if (sections.h2h.length) {
      for (const row of sections.h2h) {
        if (!row.date) { errors.push("H2H date is required."); valuesValidByBlock.h2h = false; }
        if (!row.format) { errors.push("H2H format is required."); valuesValidByBlock.h2h = false; }
        if (row.winner && teams && !resolveTeamName(teams, row.winner)) { errors.push("H2H winner must match one match team."); valuesValidByBlock.h2h = false; }
      }
      creates.push(`${sections.h2h.length} manual_real HeadToHead records scoped to ${matchId}`);
    } else valuesValidByBlock.h2h = false;
    if (sections.news.length) {
      for (const row of sections.news) {
        if (!row.reliability) { errors.push("News reliability is required."); valuesValidByBlock.news = false; }
        if (!Number.isFinite(Number(row.impactScore)) || Math.abs(Number(row.impactScore)) > 12) { errors.push("News impactScore must be numeric within ±12."); valuesValidByBlock.news = false; }
        if (!row.publishedAt) { errors.push("News publishedAt is required."); valuesValidByBlock.news = false; }
      }
      creates.push(`${sections.news.length} manual_real NewsItem records scoped to ${matchId}`);
    } else valuesValidByBlock.news = false;
    if (sections.teamForms.length) {
      for (const row of sections.teamForms) {
        if (!resolveTeamFromRow(teams, row)) errors.push(`teamForms team ${String(row.team ?? row.teamName ?? row.teamId)} must match one selected match team.`);
        if (!positive(row.matchesPlayed ?? row.matches)) errors.push("teamForms matchesPlayed/matches must be > 0.");
        if (!positive(row.mapsPlayed ?? row.maps)) errors.push("teamForms mapsPlayed/maps must be > 0.");
      }
      creates.push(`${sections.teamForms.length} manual_real TeamFormSnapshot records scoped to ${matchId}`);
    }

    for (const item of manualBlocks) {
      const hasBlockData =
        item.block === "ranking" ? Object.keys(sections.ranking).length > 0 :
        item.block === "roster" ? Object.keys(sections.rosters).length > 0 :
        item.block === "player_stats" ? sections.playerStats.length > 0 :
        item.block === "map_stats" ? sections.mapStats.length > 0 :
        item.block === "veto_history" ? sections.vetoHistory.length > 0 :
        item.block === "h2h" ? sections.h2h.length > 0 :
        sections.news.length > 0;
      if (!hasBlockData) {
        blockStatuses.push(makeBlockPreview(item.block, "missing", 0));
      } else {
        const quality = validateManualMetadata(payload, item.block, valuesValidByBlock[item.block], warnings, errors);
        blockStatuses.push(makeBlockPreview(item.block, quality.status, quality.score, quality.warnings, quality.reasons));
      }
    }
  } else if (type === "roster") {
    if (!sample) {
      const quality = validateManualMetadata(payload, "roster", true, warnings, errors);
      blockStatuses.push(makeBlockPreview("roster", quality.status, quality.score, quality.warnings, quality.reasons));
    }
    for (const [teamName, players] of Object.entries(record(payload.teams))) {
      if (!resolveTeamName(teams, teamName)) warnings.push(`Team ${teamName} is not matched for this match; needs_review candidate required.`);
      if (!Array.isArray(players) || players.length === 0 || players.some((player) => typeof player !== "string" || !player.trim())) errors.push(`Roster for ${teamName} must be non-empty player names.`);
      else {
        if (players.length < 5) warnings.push(`Roster for ${teamName} has fewer than five players; status partial.`);
        if (players.length > 5) warnings.push(`Roster for ${teamName} has more than five players; review active lineup.`);
        creates.push(`${players.length} manual_real roster/player links for ${teamName}`);
      }
    }
  } else if (type === "player_stats") {
    if (!sample) {
      const quality = validateManualMetadata(payload, "player_stats", true, warnings, errors);
      blockStatuses.push(makeBlockPreview("player_stats", quality.status, quality.score, quality.warnings, quality.reasons));
    }
    const players = rows(payload.players);
    if (!players.length) errors.push("players[] is required for player_stats.");
    for (const player of players) {
      if (!resolveTeamName(teams, player.team)) warnings.push(`Team ${String(player.team)} is not matched for this match.`);
      if (!player.nickname) errors.push("player_stats nickname is required.");
      if (!positive(player.kd)) errors.push("player_stats kd must be > 0.");
      if (!positive(player.rating)) errors.push("player_stats rating must be > 0.");
      if (num(player.adr, -1) < 0) errors.push("player_stats adr must be >= 0.");
      if (!rate(player.kast)) errors.push("player_stats kast must be 0..100.");
      if (!positive(player.maps)) errors.push("player_stats maps must be > 0.");
      if (player.impact !== undefined && !Number.isFinite(Number(player.impact))) errors.push("player_stats impact must be numeric.");
      creates.push(`PlayerStatSnapshot for ${String(player.nickname)}`);
    }
  } else if (type === "map_stats") {
    if (!sample) {
      const quality = validateManualMetadata(payload, "map_stats", true, warnings, errors);
      blockStatuses.push(makeBlockPreview("map_stats", quality.status, quality.score, quality.warnings, quality.reasons));
    }
    const entries = rows(payload.teams);
    if (!entries.length) errors.push("teams[] is required for map_stats.");
    for (const row of entries) {
      if (!resolveTeamName(teams, row.team)) warnings.push(`Team ${String(row.team)} is not matched for this match.`);
      if (!maps.includes(String(row.mapName))) errors.push(`mapName ${String(row.mapName)} is not in active map pool.`);
      if (!positive(row.mapsPlayed)) errors.push("map_stats mapsPlayed must be > 0.");
      for (const field of ["winRate", "pickRate", "banRate"]) if (!rate(row[field])) errors.push(`map_stats ${field} must be 0..100.`);
      for (const field of ["ctRoundWinRate", "tRoundWinRate"]) if (row[field] !== undefined && !rate(row[field])) errors.push(`map_stats ${field} must be 0..100.`);
      creates.push(`TeamMapStat ${String(row.team)} ${String(row.mapName)}`);
    }
  } else if (type === "veto_history") {
    if (!sample) {
      const quality = validateManualMetadata(payload, "veto_history", true, warnings, errors);
      blockStatuses.push(makeBlockPreview("veto_history", quality.status, quality.score, quality.warnings, quality.reasons));
    }
    const entries = rows(payload.teams);
    if (!entries.length) errors.push("teams[] is required for veto_history.");
    for (const row of entries) {
      if (!resolveTeamName(teams, row.team)) warnings.push(`Team ${String(row.team)} is not matched for this match.`);
      if (!maps.includes(String(row.mapName))) errors.push(`mapName ${String(row.mapName)} is not in active map pool.`);
      for (const field of ["pickRate", "banRate", "deciderRate"]) if (!rate(row[field])) errors.push(`veto_history ${field} must be 0..100.`);
      if (!positive(row.sampleSize)) errors.push("veto_history sampleSize must be > 0.");
      creates.push(`VetoPattern ${String(row.team)} ${String(row.mapName)}`);
    }
  } else if (type === "h2h") {
    if (!sample) {
      const quality = validateManualMetadata(payload, "h2h", true, warnings, errors);
      blockStatuses.push(makeBlockPreview("h2h", quality.status, quality.score, quality.warnings, quality.reasons));
    }
    const entries = rows(payload.entries);
    if (!entries.length) errors.push("entries[] is required for h2h.");
    for (const row of entries) {
      if (!row.date) errors.push("h2h date is required.");
      if (!row.format) errors.push("h2h format is required.");
      if (row.winner && teams && !resolveTeamName(teams, row.winner)) errors.push("h2h winner must match one match team.");
    }
    creates.push(`${entries.length} HeadToHead entries`);
  } else if (type === "news") {
    if (!sample) {
      const quality = validateManualMetadata(payload, "news", true, warnings, errors);
      blockStatuses.push(makeBlockPreview("news", quality.status, quality.score, quality.warnings, quality.reasons));
    }
    const entries = rows(payload.items);
    if (!entries.length) errors.push("items[] is required for news.");
    for (const row of entries) {
      if (!row.reliability) errors.push("news reliability is required.");
      if (!Number.isFinite(Number(row.impactScore)) || Math.abs(Number(row.impactScore)) > 12) errors.push("news impactScore must be numeric within ±12.");
      if (!row.publishedAt) errors.push("news publishedAt is required.");
    }
    creates.push(`${entries.length} NewsItem records`);
  } else if (type === "parsed_demo") {
    const metadata = sourceMetadata(payload);
    if (!metadata.sourceName || isPlaceholderText(metadata.sourceName)) errors.push("parsed_demo sourceName is required and must not be a template value.");
    if (!metadata.collectedAt) errors.push("parsed_demo collectedAt is required.");
    if (!metadata.period) errors.push("parsed_demo period is required.");
    if ((metadata.sampleSize ?? 0) <= 0) errors.push("parsed_demo sampleSize must be > 0.");
    if (!Number.isFinite(Number(metadata.confidence))) errors.push("parsed_demo confidence is required.");
    if (looksLikeTemplateUrl(metadata.sourceUrl)) errors.push("parsed_demo sourceUrl looks like a template URL.");

    if (teams) {
      const leakage = evaluatePreMatchLeakage({
        dataRole: metadata.dataRole,
        sourceDate: metadata.sourceDate,
        collectedAt: metadata.collectedAtDate,
        sourceMatchId: metadata.sourceMatchId,
        targetMatchId: matchId,
        targetStartTime: new Date(teams.match.startTime)
      });
      if (!leakage.passed) {
        errors.push(...leakage.reasons.map((reason) => `parsed_demo leakage: ${reason}`));
      }
    }

    const sections = parsedDemoSections(payload);
    const hasDomainRows = sections.playerStats.length > 0 || sections.mapStats.length > 0 || sections.vetoHistory.length > 0 || sections.teamForms.length > 0 || sections.roundEconomy.length > 0;
    if (!hasDomainRows) errors.push("parsed_demo must include playerStats, mapStats, vetoHistory, teamForms or roundEconomy; raw-only import does not increase readiness.");

    let playerValuesValid = sections.playerStats.length > 0;
    for (const player of sections.playerStats) {
      if (!resolveTeamFromRow(teams, player)) { warnings.push(`Team ${String(player.team ?? player.teamId)} is not matched for this parsed_demo player row.`); playerValuesValid = false; }
      if (!player.nickname && !player.playerName) { errors.push("parsed_demo playerStats nickname/playerName is required."); playerValuesValid = false; }
      if (!positive(player.kd)) { errors.push("parsed_demo playerStats kd must be > 0."); playerValuesValid = false; }
      if (!positive(player.rating)) { errors.push("parsed_demo playerStats rating must be > 0."); playerValuesValid = false; }
      if (num(player.adr, -1) < 0) { errors.push("parsed_demo playerStats adr must be >= 0."); playerValuesValid = false; }
      if (!rate(player.kast)) { errors.push("parsed_demo playerStats kast must be 0..100."); playerValuesValid = false; }
      if (!positive(player.maps)) { errors.push("parsed_demo playerStats maps must be > 0."); playerValuesValid = false; }
    }

    let mapValuesValid = sections.mapStats.length > 0;
    for (const row of sections.mapStats) {
      if (!resolveTeamFromRow(teams, row)) { warnings.push(`Team ${String(row.team ?? row.teamId)} is not matched for this parsed_demo map row.`); mapValuesValid = false; }
      if (!maps.includes(String(row.mapName))) { errors.push(`parsed_demo mapName ${String(row.mapName)} is not in active map pool.`); mapValuesValid = false; }
      if (!positive(row.mapsPlayed)) { errors.push("parsed_demo mapStats mapsPlayed must be > 0."); mapValuesValid = false; }
      for (const field of ["winRate", "pickRate", "banRate"]) {
        if (!rate(row[field])) { errors.push(`parsed_demo mapStats ${field} must be 0..100.`); mapValuesValid = false; }
      }
    }

    let vetoValuesValid = sections.vetoHistory.length > 0;
    for (const row of sections.vetoHistory) {
      if (!resolveTeamFromRow(teams, row)) { warnings.push(`Team ${String(row.team ?? row.teamId)} is not matched for this parsed_demo veto row.`); vetoValuesValid = false; }
      if (!maps.includes(String(row.mapName))) { errors.push(`parsed_demo veto mapName ${String(row.mapName)} is not in active map pool.`); vetoValuesValid = false; }
      for (const field of ["pickRate", "banRate", "deciderRate"]) {
        if (!rate(row[field])) { errors.push(`parsed_demo veto ${field} must be 0..100.`); vetoValuesValid = false; }
      }
      if (!positive(row.sampleSize)) { errors.push("parsed_demo veto sampleSize must be > 0."); vetoValuesValid = false; }
    }

    if (sections.playerStats.length) {
      const quality = calculateManualBlockQuality("player_stats", qualityMetadataFromRecord(payload), playerValuesValid);
      blockStatuses.push(makeBlockPreview("player_stats", quality.status, quality.score, quality.warnings, quality.reasons));
      creates.push(`${sections.playerStats.length} parsed_demo PlayerStatSnapshot records scoped to ${matchId}`);
    }
    if (sections.mapStats.length || sections.roundEconomy.length) {
      const quality = calculateManualBlockQuality("map_stats", qualityMetadataFromRecord(payload), mapValuesValid);
      blockStatuses.push(makeBlockPreview("map_stats", quality.status, quality.score, quality.warnings, quality.reasons));
      creates.push(`${sections.mapStats.length} parsed_demo TeamMapStat records scoped to ${matchId}`);
    }
    if (sections.vetoHistory.length) {
      const quality = calculateManualBlockQuality("veto_history", qualityMetadataFromRecord(payload), vetoValuesValid);
      blockStatuses.push(makeBlockPreview("veto_history", quality.status, quality.score, quality.warnings, quality.reasons));
      creates.push(`${sections.vetoHistory.length} parsed_demo VetoPattern records scoped to ${matchId}`);
    }
    if (sections.teamForms.length) creates.push(`${sections.teamForms.length} parsed_demo TeamFormSnapshot records scoped to ${matchId}`);
  } else {
    errors.push(`Unsupported enrichment type: ${type}`);
  }

  const qualityByBlock = new Map(blockStatuses.map((status) => [status.block, calculateManualBlockQuality(status.block, blockMetadata(payload, status.block), status.status !== "invalid" && status.status !== "missing")]));
  const manualRealPackQuality = sample ? undefined : calculateManualRealPackQuality({
    roster: qualityByBlock.get("roster") ?? calculateManualBlockQuality("roster", {}, false),
    playerStats: qualityByBlock.get("player_stats") ?? calculateManualBlockQuality("player_stats", {}, false),
    mapStats: qualityByBlock.get("map_stats") ?? calculateManualBlockQuality("map_stats", {}, false),
    veto: qualityByBlock.get("veto_history") ?? calculateManualBlockQuality("veto_history", {}, false),
    h2h: qualityByBlock.get("h2h") ?? calculateManualBlockQuality("h2h", {}, false),
    news: qualityByBlock.get("news") ?? calculateManualBlockQuality("news", {}, false),
    rosterComplete: blockStatuses.some((status) => status.block === "roster" && (status.status === "valid" || status.status === "applied")),
    playerStatsComplete: blockStatuses.some((status) => status.block === "player_stats" && (status.status === "valid" || status.status === "applied")),
    mapStatsComplete: blockStatuses.some((status) => status.block === "map_stats" && (status.status === "valid" || status.status === "applied")),
    vetoComplete: blockStatuses.some((status) => status.block === "veto_history" && (status.status === "valid" || status.status === "applied")),
    h2hPresent: blockStatuses.some((status) => status.block === "h2h" && (status.status === "valid" || status.status === "applied" || status.status === "partial")),
    newsChecked: blockStatuses.some((status) => status.block === "news" && (status.status === "valid" || status.status === "applied" || status.status === "partial"))
  });
  const before = teams ? await snapshot(matchId) : null;
  const missing = missingAfterBlocks(blockStatuses);
  const qualityView = manualRealPackQuality
    ? {
        score: manualRealPackQuality.score,
        label: manualRealPackQuality.label,
        canReachL3: manualRealPackQuality.canReachL3,
        reasons: manualRealPackQuality.reasons,
        warnings: manualRealPackQuality.warnings
      }
    : undefined;

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    creates,
    updates,
    blockStatuses,
    whatStillMissing: missing,
    matchId,
    type,
    sourceMode,
    importBatchId,
    realActionable: !sample,
    pipelineProof: sample,
    manualRealPackQuality: qualityView,
    before,
    afterPreview: before ? manualPackSnapshotFrom(before, {
      ok: errors.length === 0,
      type,
      sample,
      manualRealPackQuality: qualityView,
      warnings,
      missing
    }) : null
  };
}

async function saveRaw(payload: Record<string, unknown>, status: "valid" | "invalid", meta: Omit<EnrichmentMetadata, "sourceRecordId">) {
  const matchId = meta.matchId;
  const type = String(payload.type ?? "unknown");
  const primaryBlock: ManualPackBlock =
    type === "manual_real_pack" ? "roster" :
    type === "player_stats" ? "player_stats" :
    type === "map_stats" ? "map_stats" :
    type === "veto_history" ? "veto_history" :
    type === "h2h" ? "h2h" :
    type === "news" ? "news" :
    "roster";
  const quality = meta.isSample ? null : qualityPreview(payload, primaryBlock, status === "valid");
  const raw = {
    ...payload,
    importStatus: status,
    importBatchId: meta.importBatchId,
    sourceMode: meta.playerSourceMode,
    blockQuality: quality,
    importedAt: new Date().toISOString()
  };
  return saveExternalSourceRecord(prisma, {
    source: meta.source,
    entityType: status === "valid" ? `${meta.playerSourceMode}_${type}` : `${meta.playerSourceMode}_invalid`,
    externalId: `${meta.importBatchId}_${hashRawRecord(raw).slice(0, 16)}`,
    entityId: matchId,
    raw,
    fetchedAt: new Date(),
    sourceConfidence: status === "valid" ? (meta.isSample ? 0.66 : quality?.sourceConfidence ?? meta.sourceConfidence) : 0.2
  });
}

async function findOrCreatePlayer(teamId: string, nickname: string, meta: EnrichmentMetadata) {
  const existing = await prisma.player.findFirst({
    where: { teamId, nickname, sourceMode: meta.playerSourceMode, matchId: meta.matchId }
  });
  if (existing) {
    if (meta.isSample && !existing.isActive) {
      return prisma.player.update({
        where: { id: existing.id },
        data: { isActive: true, importBatchId: meta.importBatchId, sourceRecordId: meta.sourceRecordId }
      });
    }
    return existing;
  }
  return prisma.player.create({
    data: {
      id: `${slug(meta.playerSourceMode)}_player_${slug(teamId)}_${slug(nickname)}_${hashRawRecord({ teamId, nickname, matchId: meta.matchId, sourceMode: meta.playerSourceMode }).slice(0, 8)}`,
      nickname,
      teamId,
      role: "unknown",
      country: "unknown",
      sourceMode: meta.playerSourceMode,
      sourceConfidence: meta.sourceConfidence,
      needsReview: false,
      matchId: meta.matchId,
      importBatchId: meta.importBatchId,
      sourceRecordId: meta.sourceRecordId,
      isActive: true
    }
  });
}

async function applyRoster(teams: NonNullable<MatchTeams>, teamPlayers: Record<string, unknown>, meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const [teamName, players] of Object.entries(teamPlayers)) {
    const team = resolveTeamName(teams, teamName);
    if (!team || !Array.isArray(players)) continue;
    for (const nickname of players.map(String)) await findOrCreatePlayer(team.id, nickname, meta);
    changed.push(`${meta.playerSourceMode} roster imported for ${team.name}`);
  }
  return changed;
}

async function applyPlayerStats(teams: NonNullable<MatchTeams>, playerRows: Record<string, unknown>[], period: string, meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of playerRows) {
    const team = resolveTeamFromRow(teams, row);
    const nickname = typeof row.nickname === "string" ? row.nickname : typeof row.playerName === "string" ? row.playerName : "";
    if (!team || !nickname) continue;
    const player = await findOrCreatePlayer(team.id, nickname, meta);
    await prisma.playerStatSnapshot.create({
      data: {
        playerId: player.id,
        teamId: team.id,
        period,
        maps: Math.round(num(row.maps, 1)),
        rounds: Math.round(num(row.rounds, num(row.maps, 1) * 24)),
        kd: num(row.kd, 1),
        kdDiff: Math.round(num(row.kdDiff, 0)),
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
        ...sourceScope(meta)
      }
    });
    changed.push(`${meta.recordSource} PlayerStatSnapshot created for ${player.nickname}`);
  }
  return changed;
}

async function applyMapStats(teams: NonNullable<MatchTeams>, mapRows: Record<string, unknown>[], period: string, meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of mapRows) {
    const team = resolveTeamFromRow(teams, row);
    if (!team) continue;
    await prisma.teamMapStat.create({
      data: {
        teamId: team.id,
        mapName: String(row.mapName),
        period,
        mapsPlayed: Math.round(num(row.mapsPlayed, 1)),
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
        sampleQuality: Math.min(1, Math.max(0.15, num(row.mapsPlayed, 1) / 20)),
        sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
        ...sourceScope(meta)
      }
    });
    changed.push(`${meta.recordSource} TeamMapStat created for ${team.name} ${String(row.mapName)}`);
  }
  return changed;
}

async function applyVeto(teams: NonNullable<MatchTeams>, vetoRows: Record<string, unknown>[], period: string, meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of vetoRows) {
    const team = resolveTeamFromRow(teams, row);
    if (!team) continue;
    const opponentTeamId = team.id === teams.match.teamAId ? teams.match.teamBId : teams.match.teamAId;
    await prisma.vetoPattern.create({
      data: {
        teamId: team.id,
        opponentTeamId,
        format: teams.match.format,
        period,
        mapName: String(row.mapName),
        pickProbability: pct(row.pickRate, 0.1),
        banProbability: pct(row.banRate, 0.1),
        punishProbability: pct(row.punishProbability, 0.1),
        weaknessScore: pct(row.weaknessScore, 0.35),
        comfortScore: pct(row.comfortScore, 0.55),
        confidenceScore: Math.min(0.86, Math.max(0.25, num(row.sampleSize, 1) / 25)),
        ...sourceScope(meta)
      }
    });
    changed.push(`${meta.recordSource} VetoPattern created for ${team.name} ${String(row.mapName)}`);
  }
  return changed;
}

async function applyTeamForms(teams: NonNullable<MatchTeams>, formRows: Record<string, unknown>[], period: string, meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of formRows) {
    const team = resolveTeamFromRow(teams, row);
    if (!team) continue;
    await prisma.teamFormSnapshot.create({
      data: {
        teamId: team.id,
        period,
        matchesPlayed: Math.round(num(row.matchesPlayed, num(row.matches, 1))),
        mapsPlayed: Math.round(num(row.mapsPlayed, num(row.maps, 1))),
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
        ...sourceScope(meta)
      }
    });
    changed.push(`${meta.recordSource} TeamFormSnapshot created for ${team.name}`);
  }
  return changed;
}

async function applyParsedDemo(teams: NonNullable<MatchTeams>, payload: Record<string, unknown>, meta: EnrichmentMetadata) {
  const sections = parsedDemoSections(payload);
  const period = String(sourceMetadata(payload).period ?? "parsed_demo");
  const changed: string[] = [];
  changed.push(...await applyPlayerStats(teams, sections.playerStats, period, meta));
  changed.push(...await applyMapStats(teams, sections.mapStats, period, meta));
  changed.push(...await applyVeto(teams, sections.vetoHistory, period, meta));
  changed.push(...await applyTeamForms(teams, sections.teamForms, period, meta));
  if (sections.roundEconomy.length) {
    changed.push(`${sections.roundEconomy.length} parsed_demo round/economy rows accepted as scoped evidence for feature snapshots.`);
  }
  return changed;
}

async function applyH2h(teams: NonNullable<MatchTeams>, h2hRows: Record<string, unknown>[], meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of h2hRows) {
    const winnerName = typeof row.winner === "string" ? row.winner.toLowerCase() : "";
    const winnerTeamId = winnerName === teams.match.teamA.name.toLowerCase() ? teams.match.teamAId : winnerName === teams.match.teamB.name.toLowerCase() ? teams.match.teamBId : null;
    await prisma.headToHead.create({
      data: {
        teamAId: teams.match.teamAId,
        teamBId: teams.match.teamBId,
        date: row.date ? new Date(String(row.date)) : new Date(),
        format: String(row.format ?? teams.match.format),
        winnerTeamId,
        teamARosterSimilarity: pct(row.teamARosterSimilarity, 0.5),
        teamBRosterSimilarity: pct(row.teamBRosterSimilarity, 0.5),
        relevanceScore: pct(row.relevanceScore, 0.5),
        notes: typeof row.notes === "string" ? row.notes : meta.recordSource,
        ...sourceScope(meta)
      }
    });
    changed.push(`${meta.recordSource} HeadToHead entry created`);
  }
  return changed;
}

async function applyNews(teams: NonNullable<MatchTeams>, newsRows: Record<string, unknown>[], meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of newsRows) {
    const team = resolveTeamName(teams, row.team);
    await saveManualNewsItem({
      raw: {
        ...row,
        sourceName: row.sourceName ?? meta.recordSource,
        sourceType: row.sourceType ?? (meta.isSample ? "manual_note" : "manual_note"),
        sourceTier: row.sourceTier ?? (String(row.reliability ?? "").toLowerCase() === "official" ? "official" : String(row.reliability ?? "").toLowerCase().includes("rumor") ? "rumor" : "unknown")
      },
      teamId: team?.id ?? null,
      matchId: meta.matchId,
      importBatchId: meta.importBatchId,
      sourceRecordId: meta.sourceRecordId,
      recordSource: meta.recordSource,
      sourceMode: meta.isSample ? "analyst_sample" : "manual_real",
      sourceDate: meta.sourceDate,
      dataRole: meta.dataRole,
      dataLeakageCheckPassed: meta.dataLeakageCheckPassed,
      isActive: true
    });
    changed.push(`${meta.recordSource} NewsItem created for ${team?.name ?? "unknown team"}`);
  }
  return changed;
}

async function applyDomainRecords(payload: Record<string, unknown>, meta: EnrichmentMetadata) {
  const teams = await matchTeams(meta.matchId);
  if (!teams) return [];
  const changed: string[] = [];
  const type = String(payload.type);
  const period = String(payload.period ?? (meta.isSample ? "analyst_sample_pack" : "manual_enrichment"));

  if (type === "analyst_pack") {
    const sections = analystPackSections(payload);
    changed.push(...await applyRoster(teams, sections.rosters, meta));
    changed.push(...await applyPlayerStats(teams, sections.playerStats, "sample_last_30_days", meta));
    changed.push(...await applyMapStats(teams, sections.mapStats, "sample_last_90_days", meta));
    changed.push(...await applyVeto(teams, sections.vetoHistory, "sample_last_90_days", meta));
    changed.push(...await applyH2h(teams, sections.h2h, meta));
    changed.push(...await applyNews(teams, sections.news, meta));
  }
  if (type === "manual_real_pack") {
    const sections = manualPackSections(payload);
    const period = String(qualityMetadataFromRecord(payload).period ?? "manual_real_pack");
    changed.push(...await applyRoster(teams, sections.rosters, meta));
    changed.push(...await applyPlayerStats(teams, sections.playerStats, period, meta));
    changed.push(...await applyMapStats(teams, sections.mapStats, period, meta));
    changed.push(...await applyVeto(teams, sections.vetoHistory, period, meta));
    changed.push(...await applyH2h(teams, sections.h2h, meta));
    changed.push(...await applyNews(teams, sections.news, meta));
    changed.push(...await applyTeamForms(teams, sections.teamForms, period, meta));
  }
  if (type === "roster") changed.push(...await applyRoster(teams, record(payload.teams), meta));
  if (type === "player_stats") changed.push(...await applyPlayerStats(teams, rows(payload.players), period, meta));
  if (type === "map_stats") changed.push(...await applyMapStats(teams, rows(payload.teams), period, meta));
  if (type === "veto_history") changed.push(...await applyVeto(teams, rows(payload.teams), period, meta));
  if (type === "h2h") changed.push(...await applyH2h(teams, rows(payload.entries), meta));
  if (type === "news") changed.push(...await applyNews(teams, rows(payload.items), meta));
  if (type === "parsed_demo") changed.push(...await applyParsedDemo(teams, payload, meta));

  if (changed.length) {
    await prisma.match.update({
      where: { id: meta.matchId },
      data: { sourceMode: meta.playerSourceMode, sourceConfidence: meta.sourceConfidence }
    });
    changed.push(
      meta.isSample
        ? "Match marked analyst_sample for dev-only pipeline validation."
        : meta.playerSourceMode === "parsed_demo"
          ? "Match marked parsed_demo for validated real data onboarding evidence."
          : "Match marked manual_real for validated manual data pack."
    );
  }

  return changed;
}

async function snapshot(matchId: string) {
  const input = await buildPredictionInput(matchId);
  const prediction = calculatePrediction(input);
  const previewDataDepth = deriveDataDepth(input, prediction);
  const realDataDepth = deriveRealDataDepth(input, prediction);
  const missingBlocks = [
    ...prediction.readiness.missingCriticalData,
    ...prediction.realForecast.reasons
  ];
  return {
    readiness: prediction.readiness.level,
    realForecastReady: prediction.realForecast.isReady,
    dataQuality: prediction.dataQualityScore,
    confidence: prediction.confidenceScore,
    probability: `${prediction.teamAProbability}/${prediction.teamBProbability}`,
    previewDataDepth,
    realDataDepth,
    missingBlocks: [...new Set(missingBlocks)]
  };
}

export async function applyManualEnrichment(text: string) {
  let payload: Record<string, unknown>;
  try {
    payload = parsePayload(text);
  } catch (error) {
    return { ok: false, applied: false, errors: [error instanceof Error ? error.message : "Invalid JSON."], warnings: [], creates: [], updates: [] };
  }

  const validation = await validateManualEnrichment(text);
  const matchId = String(payload.matchId ?? "unknown");
  const isSample = isSamplePayload(payload);
  const parsedDemo = isParsedDemoPayload(payload) && !isSample;
  const metadata = sourceMetadata(payload);
  const primaryBlock: ManualPackBlock =
    payload.type === "player_stats" ? "player_stats" :
    payload.type === "map_stats" ? "map_stats" :
    payload.type === "veto_history" ? "veto_history" :
    payload.type === "h2h" ? "h2h" :
    payload.type === "news" ? "news" :
    "roster";
  const sourceConfidence = isSample ? 0.66 : parsedDemo ? Math.max(0.2, Math.min(0.92, metadata.confidence ?? 0.55)) : qualityPreview(payload, primaryBlock, true).sourceConfidence;
  const collectedAt = metadata.collectedAtDate ?? new Date();
  const sourceDate = metadata.sourceDate ?? collectedAt;
  const baseMeta: Omit<EnrichmentMetadata, "sourceRecordId"> = {
    isSample,
    source: isSample ? "analyst-sample" : parsedDemo ? "parsed-demo" : "manual",
    recordSource: isSample ? "analyst_sample" : parsedDemo ? "parsed_demo" : "manual_enrichment",
    playerSourceMode: isSample ? "analyst_sample" : parsedDemo ? "parsed_demo" : "manual_real",
    importBatchId: validation.importBatchId ?? `${isSample ? "sample" : parsedDemo ? "parsed_demo" : "manual"}_${matchId}_${hashRawRecord(payload).slice(0, 12)}`,
    matchId,
    sourceConfidence,
    collectedAt,
    sourceDate,
    dataRole: metadata.dataRole,
    dataLeakageCheckPassed: validation.ok
  };

  if (!validation.ok) {
    if (!isSample || analystSampleEnabled()) await saveRaw({ ...payload, validationErrors: validation.errors }, "invalid", baseMeta);
    return { ...validation, applied: false, readinessBefore: null, readinessAfter: null, whatChanged: [] };
  }

  const before = await snapshot(matchId);
  const raw = await saveRaw(payload, "valid", baseMeta);
  const meta: EnrichmentMetadata = { ...baseMeta, sourceRecordId: raw.record.id };
  const whatChanged = await applyDomainRecords(payload, meta);
  await rebuildSnapshots();
  await savePredictionAudit(matchId);
  await refreshResearchPack(matchId);
  const after = await snapshot(matchId);
  return {
    ...validation,
    applied: true,
    sourceRecordId: raw.record.id,
    before,
    after,
    readinessBefore: before.readiness,
    readinessAfter: after.readiness,
    realForecastReadyBefore: before.realForecastReady,
    realForecastReadyAfter: after.realForecastReady,
    dataQualityBefore: before.dataQuality,
    dataQualityAfter: after.dataQuality,
    confidenceBefore: before.confidence,
    confidenceAfter: after.confidence,
    previewDataDepthBefore: before.previewDataDepth,
    previewDataDepthAfter: after.previewDataDepth,
    realDataDepthBefore: before.realDataDepth,
    realDataDepthAfter: after.realDataDepth,
    probabilityBefore: before.probability,
    probabilityAfter: after.probability,
    sampleData: isSample,
    realActionable: !isSample,
    pipelineProof: isSample,
    whatChanged
  };
}

function restoreSourceMode(source: string) {
  return typedSourceMode(source);
}

export async function resetAnalystSampleForMatch(matchId: string) {
  const before = await snapshot(matchId);
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { ok: false, errors: [`Match not found: ${matchId}`] };

  const [players, playerStats, mapStats, veto, h2h, news] = await prisma.$transaction([
    prisma.player.updateMany({ where: { sourceMode: "analyst_sample", matchId }, data: { isActive: false } }),
    prisma.playerStatSnapshot.updateMany({ where: { source: "analyst_sample", matchId }, data: { isActive: false } }),
    prisma.teamMapStat.updateMany({ where: { source: "analyst_sample", matchId }, data: { isActive: false } }),
    prisma.vetoPattern.updateMany({ where: { source: "analyst_sample", matchId }, data: { isActive: false } }),
    prisma.headToHead.updateMany({ where: { source: "analyst_sample", matchId }, data: { isActive: false } }),
    prisma.newsItem.updateMany({ where: { source: "analyst_sample", matchId }, data: { isActive: false } })
  ]);

  if (match.sourceMode === "analyst_sample") {
    await prisma.match.update({
      where: { id: matchId },
      data: { sourceMode: restoreSourceMode(match.source), sourceConfidence: Math.max(0.3, Math.min(0.9, match.sourceConfidence)) }
    });
  }

  await rebuildSnapshots();
  await savePredictionAudit(matchId);
  await refreshResearchPack(matchId);
  const after = await snapshot(matchId);

  return {
    ok: true,
    matchId,
    readinessBefore: before.readiness,
    readinessAfter: after.readiness,
    dataQualityBefore: before.dataQuality,
    dataQualityAfter: after.dataQuality,
    confidenceBefore: before.confidence,
    confidenceAfter: after.confidence,
    probabilityBefore: before.probability,
    probabilityAfter: after.probability,
    deactivated: {
      players: players.count,
      playerStats: playerStats.count,
      mapStats: mapStats.count,
      veto: veto.count,
      h2h: h2h.count,
      news: news.count
    },
    whatChanged: ["Only analyst_sample records for the selected match were deactivated.", "Manual real, parsed demo, PandaScore, Valve and other real records were untouched."]
  };
}

export async function resetManualRealForMatch(matchId: string) {
  const before = await snapshot(matchId);
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { ok: false, errors: [`Match not found: ${matchId}`] };

  const [players, playerStats, mapStats, veto, h2h, news] = await prisma.$transaction([
    prisma.player.updateMany({ where: { sourceMode: "manual_real", matchId }, data: { isActive: false } }),
    prisma.playerStatSnapshot.updateMany({ where: { source: "manual_enrichment", matchId }, data: { isActive: false } }),
    prisma.teamMapStat.updateMany({ where: { source: "manual_enrichment", matchId }, data: { isActive: false } }),
    prisma.vetoPattern.updateMany({ where: { source: "manual_enrichment", matchId }, data: { isActive: false } }),
    prisma.headToHead.updateMany({ where: { source: "manual_enrichment", matchId }, data: { isActive: false } }),
    prisma.newsItem.updateMany({ where: { source: "manual_enrichment", matchId }, data: { isActive: false } })
  ]);

  if (match.sourceMode === "manual_real") {
    await prisma.match.update({
      where: { id: matchId },
      data: { sourceMode: restoreSourceMode(match.source), sourceConfidence: Math.max(0.3, Math.min(0.9, match.sourceConfidence)) }
    });
  }

  await rebuildSnapshots();
  await savePredictionAudit(matchId);
  await refreshResearchPack(matchId);
  const after = await snapshot(matchId);

  return {
    ok: true,
    matchId,
    readinessBefore: before.readiness,
    readinessAfter: after.readiness,
    dataQualityBefore: before.dataQuality,
    dataQualityAfter: after.dataQuality,
    confidenceBefore: before.confidence,
    confidenceAfter: after.confidence,
    probabilityBefore: before.probability,
    probabilityAfter: after.probability,
    deactivated: {
      players: players.count,
      playerStats: playerStats.count,
      mapStats: mapStats.count,
      veto: veto.count,
      h2h: h2h.count,
      news: news.count
    },
    whatChanged: ["Only manual_real records for the selected match were deactivated.", "PandaScore, Valve, Steam, parsed_demo, analyst_sample and other matches were untouched."]
  };
}

export async function exportManualRealPackForMatch(matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { teamA: true, teamB: true } });
  if (!match) return { ok: false, errors: [`Match not found: ${matchId}`] };
  const [players, playerStats, mapStats, veto, h2h, news, raws] = await Promise.all([
    prisma.player.findMany({ where: { matchId, sourceMode: "manual_real", isActive: true }, include: { team: true }, orderBy: { nickname: "asc" } }),
    prisma.playerStatSnapshot.findMany({ where: { matchId, source: "manual_enrichment", isActive: true }, include: { player: true }, orderBy: { createdAt: "desc" } }),
    prisma.teamMapStat.findMany({ where: { matchId, source: "manual_enrichment", isActive: true }, include: { team: true }, orderBy: [{ teamId: "asc" }, { mapName: "asc" }] }),
    prisma.vetoPattern.findMany({ where: { matchId, source: "manual_enrichment", isActive: true }, include: { team: true }, orderBy: [{ teamId: "asc" }, { mapName: "asc" }] }),
    prisma.headToHead.findMany({ where: { matchId, source: "manual_enrichment", isActive: true }, orderBy: { date: "desc" } }),
    prisma.newsItem.findMany({ where: { matchId, source: "manual_enrichment", isActive: true }, include: { team: true }, orderBy: { publishedAt: "desc" } }),
    prisma.externalSourceRecord.findMany({ where: { entityId: matchId, entityType: { startsWith: "manual_real_" } }, orderBy: { fetchedAt: "desc" }, take: 1 })
  ]);
  const metadata = qualityMetadataFromRecord(parsePayload(raws[0]?.rawJson ?? "{}"));
  const roster = new Map<string, string[]>();
  for (const player of players) {
    const teamName = player.team?.name ?? "unknown";
    roster.set(teamName, [...(roster.get(teamName) ?? []), player.nickname]);
  }
  return {
    ok: true,
    pack: {
      matchId,
      type: "manual_real_pack",
      source: "manual_real",
      metadata,
      rosters: Object.fromEntries(roster),
      playerStats: playerStats.map((stat) => ({
        team: stat.teamId === match.teamAId ? match.teamA.name : match.teamB.name,
        nickname: stat.player.nickname,
        kd: stat.kd,
        rating: stat.rating,
        adr: stat.adr,
        kast: Math.round(stat.kast * 100),
        impact: stat.impact,
        maps: stat.maps
      })),
      mapStats: mapStats.map((stat) => ({
        team: stat.team.name,
        mapName: stat.mapName,
        mapsPlayed: stat.mapsPlayed,
        winRate: Math.round(stat.winRate * 100),
        pickRate: Math.round(stat.pickRate * 100),
        banRate: Math.round(stat.banRate * 100),
        ctRoundWinRate: Math.round(stat.ctRoundWinRate * 100),
        tRoundWinRate: Math.round(stat.tRoundWinRate * 100)
      })),
      vetoHistory: veto.map((row) => ({
        team: row.team.name,
        mapName: row.mapName,
        pickRate: Math.round(row.pickProbability * 100),
        banRate: Math.round(row.banProbability * 100),
        deciderRate: Math.round(row.confidenceScore * 100),
        sampleSize: metadata.sampleSize ?? 0
      })),
      h2h: h2h.map((row) => ({
        date: row.date.toISOString(),
        format: row.format,
        winner: row.winnerTeamId === match.teamAId ? match.teamA.name : row.winnerTeamId === match.teamBId ? match.teamB.name : null,
        teamARosterSimilarity: row.teamARosterSimilarity,
        teamBRosterSimilarity: row.teamBRosterSimilarity,
        relevanceScore: row.relevanceScore,
        notes: row.notes
      })),
      news: news.map((item) => ({
        team: item.team?.name ?? null,
        title: item.title,
        summary: item.summary,
        reliability: item.reliability,
        impactScore: item.impactScore,
        publishedAt: item.publishedAt.toISOString(),
        sourceUrl: item.url
      }))
    }
  };
}
