export type DevLogCheckResult = {
  ok: boolean;
  matches: string[];
};

const runtimeErrorPatterns = [
  /Fast Refresh had to perform a full reload due to a runtime error/i,
  /PrismaClientValidationError/i,
  /Unknown field (isAcademyTeam|visibilityTier|teamPriority|isPinned)/i,
  /runtime error/i,
  /Unhandled Runtime Error/i
];

export function checkDevLogContent(content: string): DevLogCheckResult {
  const matches = content
    .split(/\r?\n/)
    .filter((line) => runtimeErrorPatterns.some((pattern) => pattern.test(line)))
    .map((line) => line.trim())
    .filter(Boolean);
  return { ok: matches.length === 0, matches };
}
