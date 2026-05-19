import type { MapProbability, MapStatsRow } from "./types";

export function calculateMapProbabilities(rows: MapStatsRow[], teamA: string, teamB: string): MapProbability[] {
  const maps = [...new Set(rows.map((row) => row.mapName).filter(Boolean))].sort();
  const globalPrior = globalWinRate(rows);
  return maps.map((mapName) => {
    const a = combine(rows.filter((row) => row.teamName === teamA && row.mapName === mapName));
    const b = combine(rows.filter((row) => row.teamName === teamB && row.mapName === mapName));
    const aBayes = bayes(a.wins, a.maps, globalPrior, 4);
    const bBayes = bayes(b.wins, b.maps, globalPrior, 4);
    const denom = aBayes + bBayes || 1;
    return {
      mapName,
      teamAWinProbability: round((aBayes / denom) * 100),
      teamBWinProbability: round((bBayes / denom) * 100),
      teamAWinRate: round(a.maps ? (a.wins / a.maps) * 100 : globalPrior * 100),
      teamBWinRate: round(b.maps ? (b.wins / b.maps) * 100 : globalPrior * 100),
      teamASample: a.maps,
      teamBSample: b.maps,
      globalPrior: round(globalPrior * 100),
      warnings: a.maps < 5 || b.maps < 5 ? ["Low map sample; Bayesian prior carries more weight."] : []
    };
  });
}

function combine(rows: MapStatsRow[]) {
  return rows.reduce((acc, row) => {
    acc.maps += row.mapsPlayed;
    acc.wins += row.wins || (row.winRate / 100) * row.mapsPlayed;
    return acc;
  }, { maps: 0, wins: 0 });
}

function globalWinRate(rows: MapStatsRow[]) {
  const combined = combine(rows);
  return combined.maps ? combined.wins / combined.maps : 0.5;
}

function bayes(wins: number, sample: number, prior: number, priorWeight: number) {
  return (wins + prior * priorWeight) / (sample + priorWeight);
}

function round(value: number) {
  return Number(Number(value).toFixed(4));
}
