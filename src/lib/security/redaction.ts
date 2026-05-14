const SECRET_KEY_PATTERN = /(api[_-]?key|token|authorization|bearer|secret|password|pandascore_api_key|grid_api_key|liquipedia_api_key)/i;
const ASSIGNMENT_PATTERN = /(api[_-]?key|token|authorization|bearer|secret|password|pandascore_api_key|grid_api_key|liquipedia_api_key)(["']?\s*[:=]\s*["']?)([^"',\s}]+)/gi;
const BEARER_PATTERN = /(bearer\s+)[a-z0-9._~+/-]+/gi;

export function redactString(value: string) {
  return value.replace(ASSIGNMENT_PATTERN, "$1$2[REDACTED]").replace(BEARER_PATTERN, "$1[REDACTED]");
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") return redactString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (value instanceof Date) return value.toISOString() as T;
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSecrets(entry)
    ])
  ) as T;
}

export function safeJson(value: unknown) {
  return JSON.stringify(redactSecrets(value));
}
