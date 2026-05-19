import type { H2hRow, MapStatsRow, ParsedDemoSummary, PlayerStatsRow, PrivateAnalysisData } from "@/lib/math/types";

export type ScientificFactor = {
  id: "map_vs_opponent" | "recent_trend" | "tournament_pressure" | "round_analytics";
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
