export function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Qyzylorda"
  }).format(new Date(value));
}

export function pct(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`;
}

export function signed(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}
