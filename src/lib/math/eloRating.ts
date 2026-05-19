import type { H2hRow, PlayerStatsRow } from "./types";

export function calculateTeamElo(h2h: H2hRow[], teams: string[]) {
  const ratings = Object.fromEntries(teams.map((team) => [team, 1500]));
  for (const row of h2h.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
    if (!ratings[row.teamA]) ratings[row.teamA] = 1500;
    if (!ratings[row.teamB]) ratings[row.teamB] = 1500;
    const expectedA = expected(ratings[row.teamA], ratings[row.teamB]);
    const scoreA = row.winner === row.teamA ? 1 : row.winner === row.teamB ? 0 : 0.5;
    ratings[row.teamA] = round(ratings[row.teamA] + 24 * (scoreA - expectedA));
    ratings[row.teamB] = round(ratings[row.teamB] + 24 * ((1 - scoreA) - (1 - expectedA)));
  }
  return ratings;
}

export function calculatePlayerElo(rows: PlayerStatsRow[]) {
  const ratings: Record<string, number> = {};
  for (const row of rows) {
    const key = `${row.teamName}:${row.nickname}`;
    const current = ratings[key] ?? 1500;
    if (!row.rating) {
      ratings[key] = current;
      continue;
    }
    ratings[key] = round(current + (row.rating - 1) * 60);
  }
  return ratings;
}

function expected(a: number, b: number) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

function round(value: number) {
  return Number(Number(value).toFixed(2));
}
