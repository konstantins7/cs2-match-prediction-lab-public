export type ImportProfileStatus = "active" | "instruction_only" | "placeholder" | "future_inactive";

export type ImportProfile = {
  id: string;
  title: string;
  status: ImportProfileStatus;
  expectedFormat: string;
  expectedJsonSchema: string;
  requiredFields: string[];
  optionalFields: string[];
  sourceMetadata: string[];
  dataRole: string;
  cutoffLeakageRules: string[];
  validationChecklist: string[];
  expectedImpact: string;
  mappingHints: string[];
  actionHref: string;
  futureParsers?: string[];
};

export const importProfiles: ImportProfile[] = [
  {
    id: "manual_real_pack_json",
    title: "Manual Real Pack JSON",
    status: "active",
    expectedFormat: "JSON",
    expectedJsonSchema: "{ type, matchId, sourceName, collectedAt, period, sampleSize, confidence, rosters, playerStats, mapStats, vetoHistory, h2h, news }",
    requiredFields: ["type=manual_real_pack", "matchId", "sourceName", "collectedAt", "period", "sampleSize > 0", "confidence > 0", "5 players per team", "playerStats", "mapStats", "vetoHistory"],
    optionalFields: ["h2h", "news", "section-level metadata", "teamForms"],
    sourceMetadata: ["sourceName", "collectedAt", "period", "sampleSize", "confidence"],
    dataRole: "pre_match_evidence | historical_team_form",
    cutoffLeakageRules: ["collectedAt/sourceDate must be <= target match startTime for pre-match evidence", "post-start target match data is post_match_analysis/backtest_only"],
    validationChecklist: ["reject placeholders", "reject sampleSize=0", "reject confidence=0", "validate map names", "validate team mapping", "reject raw-only payload"],
    expectedImpact: "Can raise real data coverage and Real Forecast Ready only if all gates pass.",
    mappingHints: ["Use exact matchId", "Team names must match selected match", "Roster players should match playerStats rows"],
    actionHref: "/admin/research-queue"
  },
  {
    id: "parsed_demo_json",
    title: "Parsed Demo JSON",
    status: "active",
    expectedFormat: "JSON",
    expectedJsonSchema: "{ type, matchId, sourceName, collectedAt, dataRole, playerStats, mapStats, roundEconomy, vetoHistory }",
    requiredFields: ["matchId", "sourceName", "collectedAt", "dataRole", "playerStats or roundEconomy", "sampleSize > 0"],
    optionalFields: ["pistol", "overtime", "clutch", "closing", "demo metadata"],
    sourceMetadata: ["sourceName", "collectedAt", "demoId/sourceRecordId", "dataRole"],
    dataRole: "pre_match_evidence | historical_team_form | post_match_analysis | backtest_only",
    cutoffLeakageRules: ["target-match post-start payload cannot become pre-match evidence", "dataLeakageCheckPassed=false excludes forecast/training export"],
    validationChecklist: ["reject empty template", "reject future leakage", "validate maps", "validate numeric stats"],
    expectedImpact: "Strongest free deep path for player/map/round/economy evidence.",
    mappingHints: ["Normalize parser output into existing parsed_demo/manual_real shape", "Keep import match-scoped"],
    actionHref: "/admin/research-queue?template=parsed_demo"
  },
  {
    id: "cs_demo_manager_json",
    title: "CS Demo Manager export",
    status: "instruction_only",
    expectedFormat: "JSON first; XLSX/SQL future",
    expectedJsonSchema: "{ source, matchId, exportedAt, playerStats, mapStats, roundEconomy, heatmaps? }",
    requiredFields: ["sourceName", "matchId", "exportedAt/collectedAt", "playerStats", "mapStats"],
    optionalFields: ["heatmaps", "roundEconomy", "vetoHistory", "raw export metadata"],
    sourceMetadata: ["tool name/version", "exportedAt", "analyst sourceName"],
    dataRole: "historical_team_form | pre_match_evidence",
    cutoffLeakageRules: ["Exported data must predate target match startTime for pre-match use"],
    validationChecklist: ["JSON only in 0.6.1", "XLSX parser future", "SQL import future", "map to existing validated intake"],
    expectedImpact: "Free tool path for player/map/demo analysis after manual normalization.",
    mappingHints: ["Convert export to parsed_demo JSON or manual_real_pack JSON", "Do not upload local DB files"],
    actionHref: "/admin/research-queue?template=parsed_demo",
    futureParsers: ["XLSX parser", "SQL import"]
  },
  {
    id: "awpy_json",
    title: "Awpy output",
    status: "instruction_only",
    expectedFormat: "JSON normalized from local parser output",
    expectedJsonSchema: "{ source, matchId, parser='awpy', playerStats, roundEvents, mapStats }",
    requiredFields: ["matchId", "sourceName", "collectedAt", "playerStats or roundEvents"],
    optionalFields: ["roundEconomy", "grenade/utility events", "parser version"],
    sourceMetadata: ["parser", "parserVersion", "sourceName", "collectedAt"],
    dataRole: "historical_team_form | post_match_analysis | backtest_only",
    cutoffLeakageRules: ["Use as pre-match evidence only when sourceDate <= target startTime"],
    validationChecklist: ["JSON-first only", "no bundled parser worker", "numeric stats valid", "map names valid"],
    expectedImpact: "Instruction path to deep demo evidence without adding parser dependencies.",
    mappingHints: ["Normalize rounds/maps into parsed_demo JSON", "Keep target match leakage classification explicit"],
    actionHref: "/admin/research-queue?template=parsed_demo",
    futureParsers: [".dem parser worker"]
  },
  {
    id: "demoparser_json",
    title: "demoparser output",
    status: "instruction_only",
    expectedFormat: "JSON normalized from demoparser/demoparser2 output",
    expectedJsonSchema: "{ source, matchId, parser='demoparser', playerStats, roundEvents, mapStats }",
    requiredFields: ["matchId", "sourceName", "collectedAt", "playerStats or roundEvents"],
    optionalFields: ["economy", "pistol", "overtime", "parser version"],
    sourceMetadata: ["parser", "parserVersion", "sourceName", "collectedAt"],
    dataRole: "historical_team_form | post_match_analysis | backtest_only",
    cutoffLeakageRules: ["Target-match post-start data is not pre-match evidence"],
    validationChecklist: ["JSON-first only", "no raw .dem worker in 0.6.1", "validate numeric stats", "reject raw-only payload"],
    expectedImpact: "Free parser-output profile for round/player/map evidence.",
    mappingHints: ["Normalize to parsed_demo JSON before apply", "Do not add heavy dependencies"],
    actionHref: "/admin/research-queue?template=parsed_demo",
    futureParsers: [".dem parser worker"]
  },
  {
    id: "demoinfocs_json",
    title: "demoinfocs output",
    status: "instruction_only",
    expectedFormat: "JSON worker output, future parser worker inactive",
    expectedJsonSchema: "{ source, matchId, parser='demoinfocs', roundEvents, playerStats? }",
    requiredFields: ["matchId", "sourceName", "collectedAt", "roundEvents"],
    optionalFields: ["playerStats", "economy", "parser version"],
    sourceMetadata: ["parser", "parserVersion", "sourceName", "collectedAt"],
    dataRole: "historical_team_form | post_match_analysis | backtest_only",
    cutoffLeakageRules: ["Use only data before target startTime for pre-match evidence"],
    validationChecklist: ["JSON-first only", "worker execution future/inactive", "validate maps and numeric events"],
    expectedImpact: "Future-friendly local parser output path for round/economy evidence.",
    mappingHints: ["Map worker output into parsed_demo JSON", "Keep importBatchId/sourceRecordId lineage"],
    actionHref: "/admin/research-queue?template=parsed_demo",
    futureParsers: [".dem parser worker"]
  },
  {
    id: "leetify_placeholder",
    title: "Leetify public/profile context",
    status: "placeholder",
    expectedFormat: "Explicit profile/player context only",
    expectedJsonSchema: "{ source, playerProfileUrl/playerId, sourceName, collectedAt, attribution }",
    requiredFields: ["explicit profile/player ID", "sourceName", "collectedAt", "attribution"],
    optionalFields: ["public profile stats", "match analysis reference"],
    sourceMetadata: ["attribution", "profile privacy state", "collectedAt"],
    dataRole: "context_evidence",
    cutoffLeakageRules: ["Only use sourceDate <= target startTime for prediction context"],
    validationChecklist: ["attribution required", "explicit IDs only", "privacy dependent", "no broad crawl"],
    expectedImpact: "Optional player context only; not Tier-1/deep provider.",
    mappingHints: ["Do not search/crawl profiles", "Attach only to confirmed player/entity"],
    actionHref: "/admin/sources#source-hunter"
  },
  {
    id: "faceit_explicit_ids",
    title: "FACEIT explicit ID context",
    status: "active",
    expectedFormat: "CSV/JSON manual ID mapping",
    expectedJsonSchema: "{ source:'faceit_manual_ids', teams:[{teamName, faceitTeamId}], players:[{nickname, faceitPlayerId}] }",
    requiredFields: ["entityType/teamName/nickname", "faceitId"],
    optionalFields: ["confidence", "notes"],
    sourceMetadata: ["source=faceit", "manual confirmation"],
    dataRole: "context_evidence",
    cutoffLeakageRules: ["FACEIT context alone cannot make Real Forecast Ready"],
    validationChecklist: ["explicit IDs only", "low-confidence creates needs_review", "no duplicate teams/players"],
    expectedImpact: "Improves player/team context and research queue, not full L3 alone.",
    mappingHints: ["Use EntityAlias", "Resolve low confidence via EntityMatchCandidate"],
    actionHref: "/admin/sources#faceit-context"
  },
  {
    id: "hltv_manual_rank",
    title: "HLTV manual rank CSV/JSON",
    status: "active",
    expectedFormat: "CSV or JSON manual reference",
    expectedJsonSchema: "{ source:'hltv_manual_reference', rankingDate, teams:[{ rank, teamName, hltvReferenceUrl }] }",
    requiredFields: ["rank", "teamName", "hltvReferenceUrl", "rankingDate"],
    optionalFields: ["notes", "manual confidence"],
    sourceMetadata: ["rankingDate", "manual sourceName"],
    dataRole: "ranking_reference",
    cutoffLeakageRules: ["Ranking date must be known; stale rankings reduce priority"],
    validationChecklist: ["manual import only", "no Apify", "no scraping", "low-confidence match creates needs_review"],
    expectedImpact: "Improves rank/reference and Pro Focus, not live/deep forecast evidence.",
    mappingHints: ["Use rank, teamName, hltvReferenceUrl", "Review low-confidence matches manually"],
    actionHref: "/admin/sources#source-hunter"
  },
  {
    id: "liquipedia_roster",
    title: "Liquipedia roster if configured",
    status: "placeholder",
    expectedFormat: "Approved API roster/tournament context",
    expectedJsonSchema: "{ teamName, roster, tournament, sourceName, sourceDate }",
    requiredFields: ["LIQUIPEDIA_API_KEY", "team mapping", "sourceDate"],
    optionalFields: ["roster changes", "tournament history"],
    sourceMetadata: ["sourceDate", "API endpoint", "rate limit state"],
    dataRole: "pre_match_evidence | roster_reference",
    cutoffLeakageRules: ["Roster sourceDate must be <= target match startTime"],
    validationChecklist: ["approved API access only", "respect 60 requests/hour", "no HTML scraping"],
    expectedImpact: "Best API path for roster blockers when configured.",
    mappingHints: ["Map team names to existing Team records", "Never create duplicates on low confidence"],
    actionHref: "/admin/sources#source-hunter"
  }
];

export function getImportProfiles() {
  return importProfiles;
}

export function getImportProfile(id: string) {
  return importProfiles.find((profile) => profile.id === id) ?? null;
}
