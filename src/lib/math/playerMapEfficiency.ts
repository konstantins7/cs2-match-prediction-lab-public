import type { PlayerMapEfficiency, PlayerStatsRow } from "./types";

const maps = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];

export function calculatePlayerMapEfficiency(rows: PlayerStatsRow[], options: { decayDays: number; now?: Date } = { decayDays: 14 }): PlayerMapEfficiency[] {
  const now = options.now ?? new Date();
  const globalByMap = new Map<string, number>();
  for (const mapName of maps) {
    const values = rows.filter((row) => sameMap(row.mapName, mapName) && row.rating > 0).map((row) => row.rating);
    globalByMap.set(mapName, values.length ? avg(values) : avg(rows.map((row) => row.rating).filter(Boolean)) || 1);
  }
  const grouped = new Map<string, PlayerStatsRow[]>();
  for (const row of rows) {
    const mapName = normalizeMap(row.mapName) || "Overall";
    const key = `${row.teamName}|${row.nickname}|${mapName}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return [...grouped.entries()].map(([key, group]) => {
    const [teamName, nickname, mapName] = key.split("|");
    const weighted = weightedAverages(group, options.decayDays, now);
    const trend = trendSlope(group);
    const prior = globalByMap.get(mapName) || avg(rows.map((row) => row.rating).filter(Boolean)) || 1;
    return {
      teamName,
      nickname,
      mapName,
      rating: round(weighted.rating),
      adr: round(weighted.adr),
      kast: round(weighted.kast),
      impact: round(weighted.impact),
      normalizedRating: round((weighted.rating || prior) / prior),
      trendSlope: round(trend),
      movingAverage: movingAverage(group),
      sampleSize: group.reduce((sum, row) => sum + (row.sampleSize || row.maps || 1), 0),
      warnings: mapName === "Overall" ? ["No mapName column was present; using overall player row."] : []
    };
  });
}

export function detectOutliers(values: Array<{ id: string; value: number }>, scope: string, threshold = 3) {
  const nums = values.map((value) => value.value).filter((value) => Number.isFinite(value));
  const mean = avg(nums);
  const sd = Math.sqrt(avg(nums.map((value) => (value - mean) ** 2)));
  if (!sd) return [] as Array<{ scope: string; id: string; value: number; zScore: number }>;
  return values.map((item) => ({ scope, id: item.id, value: item.value, zScore: (item.value - mean) / sd }))
    .filter((item) => Math.abs(item.zScore) > threshold)
    .map((item) => ({ ...item, value: round(item.value), zScore: round(item.zScore) }));
}

function weightedAverages(rows: PlayerStatsRow[], decayDays: number, now: Date) {
  let weightSum = 0;
  const totals = { rating: 0, adr: 0, kast: 0, impact: 0 };
  for (const row of rows) {
    const ageDays = row.collectedAt ? Math.max(0, (now.getTime() - new Date(row.collectedAt).getTime()) / 86_400_000) : 0;
    const weight = Math.exp(-ageDays / Math.max(1, decayDays)) * Math.max(1, row.sampleSize || row.maps || 1);
    weightSum += weight;
    totals.rating += row.rating * weight;
    totals.adr += row.adr * weight;
    totals.kast += row.kast * weight;
    totals.impact += row.impact * weight;
  }
  return {
    rating: weightSum ? totals.rating / weightSum : 0,
    adr: weightSum ? totals.adr / weightSum : 0,
    kast: weightSum ? totals.kast / weightSum : 0,
    impact: weightSum ? totals.impact / weightSum : 0
  };
}

function trendSlope(rows: PlayerStatsRow[]) {
  const points = rows
    .map((row) => ({ x: row.collectedAt ? new Date(row.collectedAt).getTime() / 86_400_000 : 0, y: row.rating }))
    .filter((point) => point.x > 0 && point.y > 0)
    .sort((a, b) => a.x - b.x);
  if (points.length < 2) return 0;
  const xMean = avg(points.map((point) => point.x));
  const yMean = avg(points.map((point) => point.y));
  const numerator = points.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
  const denominator = points.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
  return denominator ? numerator / denominator : 0;
}

function movingAverage(rows: PlayerStatsRow[]) {
  const dated = rows
    .filter((row) => row.collectedAt && row.rating > 0)
    .sort((a, b) => new Date(a.collectedAt ?? "").getTime() - new Date(b.collectedAt ?? "").getTime());
  return dated.map((row, index) => {
    const window = dated.slice(Math.max(0, index - 6), index + 1);
    return { day: (row.collectedAt ?? "").slice(0, 10), value: round(avg(window.map((item) => item.rating))) };
  });
}

function normalizeMap(value?: string) {
  const slug = String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return maps.find((map) => map.toLowerCase().replace(/[^a-z0-9]/g, "") === slug) ?? "";
}

function sameMap(value: string | undefined, mapName: string) {
  return normalizeMap(value) === mapName;
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number) {
  return Number(Number(value).toFixed(4));
}
