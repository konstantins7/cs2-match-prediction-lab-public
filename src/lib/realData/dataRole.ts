export const REAL_DATA_ROLES = [
  "pre_match_evidence",
  "historical_team_form",
  "post_match_analysis",
  "backtest_only",
] as const;

export type RealDataRole = (typeof REAL_DATA_ROLES)[number];

const preMatchUsableRoles: ReadonlySet<RealDataRole> = new Set([
  "pre_match_evidence",
  "historical_team_form",
]);

export function normalizeDataRole(value: unknown, fallback: RealDataRole = "pre_match_evidence"): RealDataRole {
  return REAL_DATA_ROLES.includes(value as RealDataRole) ? (value as RealDataRole) : fallback;
}

export function isPreMatchUsableDataRole(value: unknown): boolean {
  return preMatchUsableRoles.has(normalizeDataRole(value));
}

export function parseEvidenceDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isPlaceholderText(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return [
    "example",
    "team name",
    "player1",
    "player2",
    "player3",
    "roster update",
    "short official note",
    "official team site",
    "template",
    "todo",
    "tbd",
  ].some((placeholder) => normalized.includes(placeholder));
}

export function looksLikeTemplateUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.includes("example.com") || normalized.includes("template") || normalized.includes("localhost");
}

export type PreMatchLeakageInput = {
  dataRole: unknown;
  sourceDate?: Date | null;
  collectedAt?: Date | null;
  sourceMatchId?: string | null;
  targetMatchId: string;
  targetStartTime: Date;
};

export function evaluatePreMatchLeakage(input: PreMatchLeakageInput): {
  passed: boolean;
  reasons: string[];
  evidenceDate: Date | null;
  dataRole: RealDataRole;
} {
  const dataRole = normalizeDataRole(input.dataRole);
  const evidenceDate = input.sourceDate ?? input.collectedAt ?? null;
  const reasons: string[] = [];

  if (!preMatchUsableRoles.has(dataRole)) {
    reasons.push(`${dataRole} cannot be used as pre-match forecast evidence.`);
  }

  if (!evidenceDate) {
    reasons.push("sourceDate/collectedAt is required for cutoff checks.");
  } else {
    if (evidenceDate.getTime() > input.targetStartTime.getTime()) {
      reasons.push("Evidence date is after target match start time.");
    }
    if (
      input.sourceMatchId &&
      input.sourceMatchId === input.targetMatchId &&
      evidenceDate.getTime() >= input.targetStartTime.getTime()
    ) {
      reasons.push("Target-match parsed evidence after match start is post-match data.");
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
    evidenceDate,
    dataRole,
  };
}

export function isActivePreMatchEvidence(record: {
  isActive?: boolean | null;
  dataLeakageCheckPassed?: boolean | null;
  dataRole?: string | null;
  sourceDate?: Date | null;
  collectedAt?: Date | null;
  matchId?: string | null;
}, target: { id: string; startTime: Date }): boolean {
  if (record.isActive === false || record.dataLeakageCheckPassed === false) {
    return false;
  }
  const leakage = evaluatePreMatchLeakage({
    dataRole: record.dataRole,
    sourceDate: record.sourceDate ?? null,
    collectedAt: record.collectedAt ?? null,
    sourceMatchId: record.matchId ?? null,
    targetMatchId: target.id,
    targetStartTime: target.startTime,
  });
  return leakage.passed;
}
