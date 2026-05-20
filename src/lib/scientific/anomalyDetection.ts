import type { AnomalyFinding, MapStatsRow, PlayerStatsRow, PrivateAnalysisData, RosterRow } from "@/lib/math/types";

const defaultThreshold = Number(process.env.SCIENTIFIC_ANOMALY_Z_THRESHOLD ?? "2.5");

export function detectScientificAnomalies(data: PrivateAnalysisData, threshold = defaultThreshold): AnomalyFinding[] {
  return [
    ...detectPlayerAnomalies(data.playerStats, threshold),
    ...detectTeamMapAnomalies(data.mapStats, threshold),
    ...detectVetoAnomalies(data.mapStats),
    ...detectRosterAnomalies(data.roster)
  ];
}

export function detectPlayerAnomalies(rows: PlayerStatsRow[], threshold = defaultThreshold): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];
  const groups = groupBy(rows, (row) => `${row.teamName}:${row.nickname}`);
  for (const [key, group] of groups) {
    if (group.length < 3) continue;
    for (const metric of ["rating", "adr", "kast"] as const) {
      const values = group.map((row) => row[metric]).filter(Number.isFinite);
      const latest = values.at(-1);
      if (latest === undefined) continue;
      const score = zScore(latest, values);
      if (Math.abs(score) < threshold) continue;
      findings.push({
        id: `player:${key}:${metric}`,
        scope: "player",
        severity: Math.abs(score) >= threshold + 1 ? "critical" : "warning",
        metric,
        subject: key,
        value: round(latest),
        baseline: round(avg(values)),
        zScore: round(score),
        explanation: `${key} ${metric} deviates from recent baseline by z=${round(score)}.`,
        recommendation: "Review role changes, roster context, and source quality before trusting the average."
      });
    }
  }
  return findings;
}

export function detectTeamMapAnomalies(rows: MapStatsRow[], threshold = defaultThreshold): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];
  const groups = groupBy(rows, (row) => row.teamName);
  for (const [teamName, group] of groups) {
    if (group.length < 3) continue;
    const values = group.map((row) => row.winRate).filter(Number.isFinite);
    for (const row of group) {
      const score = zScore(row.winRate, values);
      if (Math.abs(score) < threshold) continue;
      findings.push({
        id: `team:${teamName}:${row.mapName}:winRate`,
        scope: "team",
        severity: Math.abs(score) >= threshold + 1 ? "critical" : "warning",
        metric: "map_win_rate",
        subject: `${teamName} on ${row.mapName}`,
        value: round(row.winRate),
        baseline: round(avg(values)),
        zScore: round(score),
        explanation: `${teamName} has an unusual ${row.mapName} winrate versus its map-pool baseline.`,
        recommendation: "Check sample size and recent veto tendency for this map."
      });
    }
  }
  return findings;
}

export function detectVetoAnomalies(rows: MapStatsRow[]): AnomalyFinding[] {
  return rows
    .filter((row) => row.mapsPlayed >= 3 && ((row.winRate >= 60 && row.banRate >= 35) || (row.winRate <= 40 && row.pickRate >= 35)))
    .map((row) => ({
      id: `veto:${row.teamName}:${row.mapName}`,
      scope: "veto" as const,
      severity: "warning" as const,
      metric: "pick_ban_tendency",
      subject: `${row.teamName} ${row.mapName}`,
      value: row.winRate >= 60 ? row.banRate : row.pickRate,
      baseline: row.winRate,
      explanation: row.winRate >= 60
        ? `${row.teamName} often bans a statistically strong map.`
        : `${row.teamName} often picks a statistically weak map.`,
      recommendation: "Inspect opponent-specific veto context; this can be a style matchup or stale source artifact."
    }));
}

export function detectRosterAnomalies(rows: RosterRow[]): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];
  const groups = groupBy(rows, (row) => row.teamName);
  const recentCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const [teamName, group] of groups) {
    const uniquePlayers = new Set(group.map((row) => row.nickname.toLowerCase()).filter(Boolean));
    if (uniquePlayers.size && uniquePlayers.size !== 5) {
      findings.push({
        id: `roster:${teamName}:size`,
        scope: "roster",
        severity: uniquePlayers.size < 4 || uniquePlayers.size > 6 ? "critical" : "warning",
        metric: "roster_size",
        subject: teamName,
        value: uniquePlayers.size,
        baseline: 5,
        explanation: `${teamName} has ${uniquePlayers.size} unique roster rows instead of a stable five-player core.`,
        recommendation: "Confirm substitutes/coaches and remove non-playing rows before Apply."
      });
    }
    const recentRows = group.filter((row) => {
      const time = new Date(row.collectedAt ?? row.period ?? "").getTime();
      return Number.isFinite(time) && time >= recentCutoff;
    });
    if (recentRows.length > 0 && uniquePlayers.size < 5) {
      findings.push({
        id: `roster:${teamName}:recent-change`,
        scope: "roster",
        severity: "warning",
        metric: "recent_roster_change",
        subject: teamName,
        value: recentRows.length,
        explanation: `${teamName} has recent roster rows but an incomplete core.`,
        recommendation: "Treat player-form history as less stable until the current five are confirmed."
      });
    }
  }
  return findings;
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = key(row);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
  }
  return groups;
}

function zScore(value: number, values: number[]) {
  const mean = avg(values);
  const stdev = Math.sqrt(avg(values.map((item) => (item - mean) ** 2)));
  return stdev > 0 ? (value - mean) / stdev : 0;
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number) {
  return Number(Number(value).toFixed(3));
}
