import type { H2hRow, MapStatsRow, ParsedDemoSummary, PlayerStatsRow, PrivateAnalysisData } from "@/lib/math/types";

export type ScientificFactor = {
  id: "map_vs_opponent" | "recent_trend" | "tournament_pressure" | "round_analytics" | "map_specific_elo" | "player_form_trend" | "roster_change" | "h2h_psychology" | "first_pick_ban";
  label: string;
  status: "available" | "partial" | "missing";
  impact: number;
  explanation: string;
  warnings: string[];
  details: Record<string, unknown>;
};

export function calculateScientificFactors(data: PrivateAnalysisData, teams: string[]): ScientificFactor[] {
  return [
    mapVsOpponent(data.mapStats, teams),
    recentTrend(data.playerStats, teams),
    mapSpecificElo(data.mapStats, teams),
    playerFormTrend(data.playerStats, teams),
    rosterChange(data.roster, teams),
    h2hPsychology(data.h2h, teams),
    firstPickBan(data.mapStats, teams),
    tournamentPressure(data.h2h),
    roundAnalytics(data.parsedDemo)
  ];
}

function mapVsOpponent(rows: MapStatsRow[], teams: string[]): ScientificFactor {
  const [teamA, teamB] = teams;
  if (!teamA || !teamB || rows.length === 0) {
    return missing("map_vs_opponent", "Карта против оппонента", "No map_stats rows for opponent map comparison.");
  }
  const byMap = new Map<string, { a?: MapStatsRow; b?: MapStatsRow }>();
  for (const row of rows) {
    const key = row.mapName;
    const current = byMap.get(key) ?? {};
    if (same(row.teamName, teamA)) current.a = row;
    if (same(row.teamName, teamB)) current.b = row;
    byMap.set(key, current);
  }
  const comparisons = [...byMap.entries()]
    .map(([mapName, pair]) => ({
      mapName,
      teamAWinRate: pair.a?.winRate ?? null,
      teamBWinRate: pair.b?.winRate ?? null,
      delta: pair.a && pair.b ? pair.a.winRate - pair.b.winRate : null
    }))
    .filter((row) => row.delta !== null);
  if (!comparisons.length) return missing("map_vs_opponent", "Карта против оппонента", "Map stats exist but no common maps were found for both teams.");
  const averageDelta = comparisons.reduce((sum, row) => sum + (row.delta ?? 0), 0) / comparisons.length;
  return {
    id: "map_vs_opponent",
    label: "Карта против оппонента",
    status: comparisons.length >= 3 ? "available" : "partial",
    impact: clamp(averageDelta * 0.12, -6, 6),
    explanation: `Average same-map winrate delta is ${averageDelta.toFixed(1)} percentage points.`,
    warnings: comparisons.length < 3 ? ["Low common-map sample; impact is advisory only."] : [],
    details: { comparisons }
  };
}

function recentTrend(rows: PlayerStatsRow[], teams: string[]): ScientificFactor {
  if (rows.length < 4) return missing("recent_trend", "Последние 5 матчей", "Not enough player_stats rows for trend.");
  const teamScores = teams.map((team) => {
    const values = rows.filter((row) => same(row.teamName, team)).slice(-5).map((row) => row.rating).filter(Number.isFinite);
    const first = average(values.slice(0, Math.max(1, Math.floor(values.length / 2))));
    const last = average(values.slice(Math.floor(values.length / 2)));
    return { team, sample: values.length, trend: last - first, average: average(values) };
  });
  const delta = (teamScores[0]?.trend ?? 0) - (teamScores[1]?.trend ?? 0);
  return {
    id: "recent_trend",
    label: "Последние 5 матчей",
    status: teamScores.some((row) => row.sample >= 5) ? "available" : "partial",
    impact: clamp(delta * 20, -4, 4),
    explanation: `Recent rating trend delta is ${delta.toFixed(3)}.`,
    warnings: teamScores.some((row) => row.sample < 5) ? ["Recent trend uses fewer than five rows for at least one team."] : [],
    details: { teamScores }
  };
}

function tournamentPressure(h2h: H2hRow[]): ScientificFactor {
  const closeMaps = h2h.filter((row) => Math.abs(row.scoreA - row.scoreB) <= 3).length;
  if (!h2h.length) {
    return {
      ...missing("tournament_pressure", "Турнирное давление", "No H2H rows for pressure proxy."),
      details: { note: "Stage/event pressure is intentionally advisory and does not change production prediction." }
    };
  }
  return {
    id: "tournament_pressure",
    label: "Турнирное давление",
    status: "partial",
    impact: closeMaps >= 3 ? -1.5 : 0,
    explanation: closeMaps >= 3 ? "Several close historical maps; form signal may be noisier under pressure." : "No strong pressure proxy from local H2H.",
    warnings: ["Tournament pressure is an advisory proxy until event stage metadata is wired into analysis."],
    details: { h2hRows: h2h.length, closeMaps }
  };
}

function mapSpecificElo(rows: MapStatsRow[], teams: string[]): ScientificFactor {
  const [teamA, teamB] = teams;
  const common = rows.filter((row) => same(row.teamName, teamA) || same(row.teamName, teamB));
  if (common.length < 2) return missing("map_specific_elo", "Map-specific Elo", "Not enough map_stats rows for map-specific Elo proxy.");
  const byTeam = teams.map((team) => {
    const teamRows = common.filter((row) => same(row.teamName, team));
    const score = average(teamRows.map((row) => 1500 + (row.winRate - 50) * 8 + Math.log1p(row.mapsPlayed) * 12));
    return { team, score, sample: teamRows.reduce((sum, row) => sum + row.mapsPlayed, 0) };
  });
  const delta = (byTeam[0]?.score ?? 1500) - (byTeam[1]?.score ?? 1500);
  return {
    id: "map_specific_elo",
    label: "Map-specific Elo",
    status: byTeam.every((row) => row.sample >= 10) ? "available" : "partial",
    impact: clamp(delta / 35, -5, 5),
    explanation: `Map-specific Elo proxy delta is ${delta.toFixed(1)}.`,
    warnings: byTeam.some((row) => row.sample < 10) ? ["Small map sample; Elo proxy is advisory."] : [],
    details: { teams: byTeam }
  };
}

function playerFormTrend(rows: PlayerStatsRow[], teams: string[]): ScientificFactor {
  if (rows.length < 6) return missing("player_form_trend", "Форма игроков", "Not enough player_stats rows for individual form trend.");
  const teamTrends = teams.map((team) => {
    const values = rows.filter((row) => same(row.teamName, team)).slice(-10).map((row) => row.rating).filter(Number.isFinite);
    return { team, trend: average(values.slice(-5)) - average(values.slice(0, 5)), sample: values.length };
  });
  const delta = (teamTrends[0]?.trend ?? 0) - (teamTrends[1]?.trend ?? 0);
  return {
    id: "player_form_trend",
    label: "Форма игроков",
    status: teamTrends.every((row) => row.sample >= 5) ? "available" : "partial",
    impact: clamp(delta * 18, -4, 4),
    explanation: `Recent individual rating trend delta is ${delta.toFixed(3)}.`,
    warnings: teamTrends.some((row) => row.sample < 5) ? ["At least one team has fewer than five player stat rows."] : [],
    details: { teamTrends }
  };
}

function rosterChange(rows: PrivateAnalysisData["roster"], teams: string[]): ScientificFactor {
  if (!rows.length) return missing("roster_change", "Roster change risk", "No roster rows for roster-change confidence check.");
  const now = Date.now();
  const recent = rows.filter((row) => {
    const raw = row.collectedAt ?? row.period ?? "";
    const timestamp = new Date(raw).getTime();
    return Number.isFinite(timestamp) && now - timestamp <= 14 * 24 * 60 * 60 * 1000;
  });
  const byTeam = teams.map((team) => ({ team, recentRows: recent.filter((row) => same(row.teamName, team)).length, totalRows: rows.filter((row) => same(row.teamName, team)).length }));
  return {
    id: "roster_change",
    label: "Roster change risk",
    status: byTeam.some((row) => row.totalRows >= 5) ? "partial" : "missing",
    impact: byTeam.some((row) => row.recentRows > 0 && row.totalRows < 5) ? -2 : 0,
    explanation: "Roster-change signal uses local roster row dates only.",
    warnings: ["If roster rows do not include join/event dates, this factor stays conservative."],
    details: { byTeam }
  };
}

function h2hPsychology(rows: H2hRow[], teams: string[]): ScientificFactor {
  if (!rows.length) return missing("h2h_psychology", "Последняя очная встреча", "No H2H rows for last-meeting factor.");
  const latest = [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const impact = same(latest.winner, teams[0] ?? "") ? 1.5 : same(latest.winner, teams[1] ?? "") ? -1.5 : 0;
  return {
    id: "h2h_psychology",
    label: "Последняя очная встреча",
    status: "partial",
    impact,
    explanation: `${latest.winner || "Unknown"} won the latest local H2H sample.`,
    warnings: ["Psychological factor is a small advisory nudge only."],
    details: { latest }
  };
}

function firstPickBan(rows: MapStatsRow[], teams: string[]): ScientificFactor {
  const vetoLike = rows.filter((row) => row.pickRate > 0 || row.banRate > 0);
  if (!vetoLike.length) return missing("first_pick_ban", "First pick/ban tendency", "No pick/ban rates in local map_stats/veto-derived rows.");
  const byTeam = teams.map((team) => {
    const teamRows = vetoLike.filter((row) => same(row.teamName, team));
    const topBan = [...teamRows].sort((a, b) => b.banRate - a.banRate)[0];
    const topPick = [...teamRows].sort((a, b) => b.pickRate - a.pickRate)[0];
    return { team, topBan: topBan?.mapName ?? "", banRate: topBan?.banRate ?? 0, topPick: topPick?.mapName ?? "", pickRate: topPick?.pickRate ?? 0 };
  });
  return {
    id: "first_pick_ban",
    label: "First pick/ban tendency",
    status: byTeam.some((row) => row.topBan || row.topPick) ? "available" : "partial",
    impact: 0,
    explanation: "Shows the strongest local pick/ban tendencies for analyst review.",
    warnings: [],
    details: { byTeam }
  };
}

function roundAnalytics(parsedDemo: ParsedDemoSummary | null): ScientificFactor {
  if (!parsedDemo) {
    return missing("round_analytics", "Раунд-анализ", "parsed_demo_export.json is missing. Upload parsed demo through /admin/imports for pistol, economy, and clutch analytics.");
  }
  return {
    id: "round_analytics",
    label: "Раунд-анализ",
    status: parsedDemo.pistolRounds > 0 ? "available" : "partial",
    impact: 0,
    explanation: `Parsed demo contains ${parsedDemo.pistolRounds} pistol round marker(s).`,
    warnings: ["Economy and clutch summaries appear only when parsed demo exports include those fields."],
    details: parsedDemo as unknown as Record<string, unknown>
  };
}

function missing(id: ScientificFactor["id"], label: string, message: string): ScientificFactor {
  return { id, label, status: "missing", impact: 0, explanation: message, warnings: [message], details: {} };
}

function same(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}
