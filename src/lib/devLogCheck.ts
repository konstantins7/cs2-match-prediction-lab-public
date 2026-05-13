export type DevLogCheckResult = {
  ok: boolean;
  matches: string[];
  warnings: string[];
};

const runtimeErrorPatterns = [
  /Fast Refresh had to perform a full reload due to a runtime error/i,
  /PrismaClientValidationError/i,
  /Unknown field (isAcademyTeam|visibilityTier|teamPriority|isPinned)/i,
  /Cannot find module/i,
  /\b(GET|POST|PUT|PATCH|DELETE)\s+\S+\s+500\b/i,
  /runtime error/i,
  /Unhandled Runtime Error/i,
  /^\s+at\s+\S+/i
];

const warningPatterns = [
  /Fast Refresh had to perform a full reload(?! due to a runtime error)/i
];

export function checkDevLogContent(content: string): DevLogCheckResult {
  const lines = content.split(/\r?\n/);
  const matches = lines
    .filter((line) => runtimeErrorPatterns.some((pattern) => pattern.test(line)))
    .map((line) => line.trim())
    .filter(Boolean);
  const warnings = lines
    .filter((line) => warningPatterns.some((pattern) => pattern.test(line)))
    .map((line) => line.trim())
    .filter(Boolean);
  return { ok: matches.length === 0, matches, warnings };
}
