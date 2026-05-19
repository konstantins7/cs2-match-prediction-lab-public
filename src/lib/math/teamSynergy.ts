import type { PlayerStatsRow, RosterRow, TeamSynergy } from "./types";

export function calculateTeamSynergy(roster: RosterRow[], playerStats: PlayerStatsRow[]): TeamSynergy[] {
  const teams = [...new Set([...roster.map((row) => row.teamName), ...playerStats.map((row) => row.teamName)].filter(Boolean))];
  return teams.map((teamName) => {
    const teamRoster = roster.filter((row) => row.teamName === teamName);
    const teamStats = playerStats.filter((row) => row.teamName === teamName);
    const nicknames = [...new Set([...teamRoster.map((row) => row.nickname), ...teamStats.map((row) => row.nickname)].filter(Boolean))];
    const pairCorrelations = [];
    for (let left = 0; left < nicknames.length; left += 1) {
      for (let right = left + 1; right < nicknames.length; right += 1) {
        const a = ratingsByPeriod(teamStats.filter((row) => row.nickname === nicknames[left]));
        const b = ratingsByPeriod(teamStats.filter((row) => row.nickname === nicknames[right]));
        const common = [...a.keys()].filter((key) => b.has(key));
        const correlation = pearson(common.map((key) => a.get(key) ?? 0), common.map((key) => b.get(key) ?? 0));
        pairCorrelations.push({ playerA: nicknames[left], playerB: nicknames[right], correlation: round(correlation), sampleSize: common.length });
      }
    }
    const ratings = teamStats.map((row) => row.rating).filter((value) => value > 0);
    const best = ratings.length ? Math.max(...ratings) : 0;
    const mean = avg(ratings);
    const roles = new Set(teamRoster.map((row) => row.role).filter((role) => role && role !== "unknown"));
    return {
      teamName,
      pairCorrelations,
      rosterStability: teamRoster.length >= 5 ? 1 : teamRoster.length / 5,
      leaderEffect: round(Math.max(0, best - mean)),
      roleDiversity: roles.size ? round(roles.size / Math.max(1, teamRoster.length)) : null,
      warnings: teamStats.length < 5 ? ["Low player stats sample for reliable synergy."] : []
    };
  });
}

function ratingsByPeriod(rows: PlayerStatsRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) map.set(`${row.collectedAt ?? ""}|${row.mapName ?? "overall"}`, row.rating);
  return map;
}

function pearson(a: number[], b: number[]) {
  if (a.length < 2 || b.length < 2 || a.length !== b.length) return 0;
  const meanA = avg(a);
  const meanB = avg(b);
  const numerator = a.reduce((sum, value, index) => sum + (value - meanA) * (b[index] - meanB), 0);
  const denominator = Math.sqrt(a.reduce((sum, value) => sum + (value - meanA) ** 2, 0) * b.reduce((sum, value) => sum + (value - meanB) ** 2, 0));
  return denominator ? numerator / denominator : 0;
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number) {
  return Number(Number(value).toFixed(4));
}
